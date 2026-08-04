#!/usr/bin/env python
"""
Machine answer-verification for the course importer (plan §4, Layers 1 & 3).

This is the SymPy half of answer verification. It is NOT a solver and it does NOT
touch LLMs — the blind-solver pass (Layer 2) lives in TypeScript. This script only
decides, for items that carry a machine-checkable `verify` block or a set of MCQ
options, whether the authored answer is mathematically right and whether any two
distractors collapse to the same value.

Protocol — one process spawn per import, all work batched:
  stdin  : {"timeout": <seconds>, "checks": [ <check>, ... ]}
  stdout : {"results": [ <result>, ... ]}   (order preserved, id echoed)

Two check kinds:

  Layer 1 — answer (both sides are SymPy expression strings, NOT LaTeX; the plan
  keeps LaTeX out of this path deliberately — sympy.parsing.latex is brittle):
    {"id": "...", "kind": "answer", "sympy": "diff(x**3*sin(x), x)",
     "answer": "3*x**2*sin(x) + x**3*cos(x)"}
    -> ok=true   the answer is provably equivalent to the restated problem
    -> ok=false  provably NOT equivalent  (a real defect: route the item to pending)
    -> ok=null   could not decide (parse error, timeout, inconclusive) -> pending

  Layer 3 — options (LaTeX strings; parsed with the Lark backend, ANTLR-free):
    {"id": "...", "kind": "options", "options": ["\\frac12", "\\frac{1}{2}", ...]}
    -> ok=false  two options are mathematically equivalent (item is unanswerable)
    -> ok=true   no equivalent pair found among the options that parsed
  Options never return null: an option that will not parse is silently skipped
  (textual distinctness is already enforced in the importer), so a parse failure
  on one distractor is never grounds to hold the whole item for review.

  Layer 2 support — equiv (compare two expressions, each tagged as its own format,
  so a blind-solver answer in SymPy form can be checked against a LaTeX answer key):
    {"id": "...", "kind": "equiv",
     "a": "3*x**2", "a_fmt": "sympy", "b": "3x^2", "b_fmt": "latex"}
    -> ok=true / false as for `answer`; ok=null when either side will not parse or
       SymPy cannot decide.

`ok=false` and `ok=null` both keep an item out of `approved`; the importer writes
the `reason` into `critic_notes` so the human reviewer sees *why*.

Every check runs in a single reusable worker process with a hard per-check wall
clock (ProcessPoolExecutor.result(timeout=...)). A runaway simplify() poisons that
one worker; it is discarded and a fresh one is spun up for the next check, so one
pathological item cannot wedge a 300-item batch. Cross-platform (no signal.alarm,
which Windows lacks).
"""

import json
import sys
import warnings
from concurrent.futures import ProcessPoolExecutor, TimeoutError as FutureTimeout

# SymPy's Lark LaTeX backend emits a SymPyDeprecationWarning on compact forms like
# `\frac12` (it still yields the correct value). This module speaks JSON on stdout;
# silence warnings so captured stderr stays clean. Applies in spawned workers too,
# which re-import this module.
warnings.simplefilter("ignore")

DEFAULT_TIMEOUT = 10  # seconds per check


# ── Workers (module-level so ProcessPoolExecutor can pickle them on spawn) ──

def _exprs_equal(a, b):
    """True/False if decidable, None if SymPy cannot (or must not) conclude.

    Never raises: a malformed operand (e.g. parse_latex handing back a non-Expr
    tuple) or a simplify() that blows up is an *undecidable* result, not a crash —
    the item routes to human review rather than poisoning the worker.
    """
    from sympy import simplify, Basic

    if not isinstance(a, Basic) or not isinstance(b, Basic):
        return None
    try:
        diff = simplify(a - b)
        if diff == 0 or getattr(diff, "is_zero", None) is True:
            return True
        if getattr(diff, "is_zero", None) is False:
            return False
        # simplify was inconclusive; equals() adds numeric probing and returns
        # True / False / None.
        return a.equals(b)
    except Exception:  # noqa: BLE001 — any SymPy failure is "undecidable"
        return None


def _check_answer(sympy_src, answer_src):
    from sympy import sympify

    try:
        lhs = sympify(sympy_src)
        rhs = sympify(answer_src)
    except Exception as e:  # noqa: BLE001 — any parse failure is "unverifiable"
        return {"ok": None, "reason": f"could not parse: {e}"}

    verdict = _exprs_equal(lhs, rhs)
    if verdict is True:
        return {"ok": True}
    if verdict is False:
        return {
            "ok": False,
            "reason": f"answer '{answer_src}' does not equal '{sympy_src}' (= {lhs})",
        }
    return {"ok": None, "reason": "SymPy could not decide equivalence"}


def _parse(src, fmt):
    """Parse one operand by its declared format. Raises on failure.

    parse_latex can *succeed* on junk by returning a non-Expr (e.g. a tuple for
    "does not exist"); treat that as a parse failure so callers get a clean
    "could not parse" rather than a downstream arithmetic crash.
    """
    from sympy import Basic

    if fmt == "latex":
        from sympy.parsing.latex import parse_latex

        result = parse_latex(src, backend="lark")
    else:  # default / "sympy"
        from sympy import sympify

        result = sympify(src)

    if not isinstance(result, Basic):
        raise ValueError(f"parsed to a non-expression ({type(result).__name__})")
    return result


def _check_equiv(a_src, a_fmt, b_src, b_fmt):
    try:
        a = _parse(a_src, a_fmt or "sympy")
    except Exception as e:  # noqa: BLE001
        return {"ok": None, "reason": f"could not parse a ({a_fmt}): {e}"}
    try:
        b = _parse(b_src, b_fmt or "sympy")
    except Exception as e:  # noqa: BLE001
        return {"ok": None, "reason": f"could not parse b ({b_fmt}): {e}"}

    verdict = _exprs_equal(a, b)
    if verdict is True:
        return {"ok": True}
    if verdict is False:
        return {"ok": False, "reason": f"'{a_src}' does not equal '{b_src}'"}
    return {"ok": None, "reason": "SymPy could not decide equivalence"}


def _check_options(options):
    parsed = []  # (index, expr) for options that parsed to a real expression
    for i, opt in enumerate(options):
        try:
            parsed.append((i, _parse(opt, "latex")))
        except Exception:  # noqa: BLE001 — unparseable option is simply skipped
            continue

    for a in range(len(parsed)):
        for b in range(a + 1, len(parsed)):
            ia, ea = parsed[a]
            ib, eb = parsed[b]
            try:
                if _exprs_equal(ea, eb) is True:
                    return {
                        "ok": False,
                        "reason": (
                            f"options {ia} and {ib} are mathematically equivalent "
                            f"('{options[ia]}' == '{options[ib]}')"
                        ),
                    }
            except Exception:  # noqa: BLE001 — an inconclusive pair is not a defect
                continue
    return {"ok": True}


def _run_one(check):
    """Dispatch a single check. Runs inside the worker process."""
    # SymPy re-arms its own deprecation filters on import, so a module-level
    # simplefilter is not enough — suppress inside the call that does the work.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        kind = check.get("kind")
        if kind == "answer":
            return _check_answer(check["sympy"], check["answer"])
        if kind == "options":
            return _check_options(check["options"])
        if kind == "equiv":
            return _check_equiv(
                check["a"], check.get("a_fmt"), check["b"], check.get("b_fmt")
            )
        return {"ok": None, "reason": f"unknown check kind '{kind}'"}


# ── Driver ──────────────────────────────────────────────────────────────────

def verify_all(checks, timeout):
    results = []
    executor = ProcessPoolExecutor(max_workers=1)
    try:
        for check in checks:
            future = executor.submit(_run_one, check)
            try:
                outcome = future.result(timeout=timeout)
            except FutureTimeout:
                outcome = {"ok": None, "reason": f"timed out after {timeout}s"}
                # The worker is stuck on this computation; discard and replace it.
                executor.shutdown(wait=False, cancel_futures=True)
                executor = ProcessPoolExecutor(max_workers=1)
            except Exception as e:  # noqa: BLE001 — worker crash -> unverifiable
                outcome = {"ok": None, "reason": f"worker error: {e}"}
                executor.shutdown(wait=False, cancel_futures=True)
                executor = ProcessPoolExecutor(max_workers=1)
            outcome["id"] = check.get("id")
            outcome["kind"] = check.get("kind")
            results.append(outcome)
    finally:
        executor.shutdown(wait=False, cancel_futures=True)
    return results


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception as e:  # noqa: BLE001
        json.dump({"error": f"invalid request JSON: {e}"}, sys.stdout)
        sys.exit(1)

    checks = payload.get("checks", [])
    timeout = payload.get("timeout", DEFAULT_TIMEOUT)
    results = verify_all(checks, timeout)
    json.dump({"results": results}, sys.stdout)


if __name__ == "__main__":
    main()
