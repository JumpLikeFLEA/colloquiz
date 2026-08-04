/**
 * Answer verification, Layer 2 — the blind-solver pass (plan §4 "the largest risk").
 *
 * For a course MCQ that carries NO machine-checkable `verify` block, we cannot run
 * SymPy Layer 1 directly. Instead a fresh model call is given the STEM ONLY — no
 * options, no `correct_answer` — and asked to solve it from scratch, k independent
 * times at non-zero temperature. Withholding the answer is the whole point: this is
 * deliberately NOT lib/generator/critic.ts, which critiques a complete item and can
 * anchor on the answer it is shown.
 *
 * Each sample is returned as a SymPy expression string, then compared to the
 * authored key (LaTeX) by scripts/verify_math.py via the `equiv` check. An item is
 * confirmed only when a majority of the k runs independently reproduce the key —
 * self-consistency across samples catches an arithmetic slip that a single pass
 * would repeat. Anything short of that routes to `pending` (human review).
 *
 * The pure decision (tallyBlind) and the shared types live in lib/courseVerifyCore.ts
 * so they are testable without the Anthropic client graph. The importer owns the
 * split: items WITH a `verify` block go through Layer 1; items without come here.
 */

import { callBlindSolver } from "./generator/llm";
import { runVerifyChecks, type VerifyCheck } from "./verifyMath";
import {
  tallyBlind,
  extractAnswer,
  BLIND_SOLVER_SAMPLES,
  BLIND_SOLVER_AGREEMENT,
  type BlindItem,
  type VerifyOutcome,
} from "./courseVerifyCore";

export {
  BLIND_SOLVER_SAMPLES,
  BLIND_SOLVER_AGREEMENT,
  tallyBlind,
  type BlindItem,
  type VerifyOutcome,
};

const ITEM_CONCURRENCY = 4; // how many items solve in parallel (× k LLM calls each)

const BLIND_SOLVER_SYSTEM_PROMPT = `You are a meticulous mathematician independently verifying answer keys for a Calculus course. You are given ONE problem stem and NOTHING else — no answer choices, no worked solution. Solve it yourself, from scratch.

Rules:
- The stem contains LaTeX inside \\( … \\) (inline) and \\[ … \\] (display) delimiters.
- Return ONLY the final answer, as a single SymPy-parseable Python expression string — the form sympy.sympify accepts. Use ** for powers, * for multiplication, and sqrt(), sin(), cos(), tan(), exp(), log() (natural log), pi, E, oo (infinity), Rational(a, b) for exact fractions.
- Do NOT return LaTeX. Do NOT include units, prose, an equals sign, or the variable name on a left-hand side. Just the expression.
- Examples of well-formed answers: "3*x**2*sin(x) + x**3*cos(x)", "Rational(2, 3)", "1", "exp(x)", "pi/2", "-oo".
- If a limit does not exist or is unbounded, return "oo", "-oo", "zoo", or "nan" as appropriate.
- Do NOT show your working or explain your steps. Respond with a single JSON object and nothing else: {"answer": "<sympy expression>"}`;

function buildSolverPrompt(stem: string): string {
  return `Problem:\n\n${stem}\n\nSolve it and respond with {"answer": "<sympy expression>"}.`;
}

async function blindSolveOnce(stem: string): Promise<string | null> {
  try {
    const text = await callBlindSolver(BLIND_SOLVER_SYSTEM_PROMPT, buildSolverPrompt(stem));
    return extractAnswer(text);
  } catch {
    // A failed call is an abstention, not a batch failure.
    return null;
  }
}

async function solveK(stem: string, k: number): Promise<string[]> {
  const samples = await Promise.all(Array.from({ length: k }, () => blindSolveOnce(stem)));
  return samples.filter((s): s is string => s !== null);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Blind-verify a batch of items. Returns one outcome per item, keyed by `item.key`.
 * Solves every item k times (bounded concurrency), then compares all samples to
 * their keys in a single SymPy subprocess round-trip.
 */
export async function blindVerify(
  items: BlindItem[],
  opts: { samples?: number; agreement?: number; timeout?: number } = {},
): Promise<Map<string, VerifyOutcome>> {
  const k = opts.samples ?? BLIND_SOLVER_SAMPLES;
  const agreement = opts.agreement ?? BLIND_SOLVER_AGREEMENT;
  const out = new Map<string, VerifyOutcome>();
  if (items.length === 0) return out;

  // 1. Blind-solve every item k times (bounded so a big stage doesn't fan out to
  //    hundreds of simultaneous model calls).
  const answersByKey = new Map<string, string[]>();
  await mapLimit(items, ITEM_CONCURRENCY, async (item) => {
    answersByKey.set(item.key, await solveK(item.stem, k));
  });

  // 2. One batched SymPy comparison of every sample against its item's key.
  const checks: VerifyCheck[] = [];
  for (const item of items) {
    (answersByKey.get(item.key) ?? []).forEach((ans, j) => {
      checks.push({
        id: `${item.key}#${j}`,
        kind: "equiv",
        a: ans,
        a_fmt: "sympy",
        b: item.correctAnswer,
        b_fmt: "latex",
      });
    });
  }
  const results = await runVerifyChecks(checks, { timeout: opts.timeout });
  const okById = new Map(results.map((r) => [r.id, r.ok] as const));

  // 3. Tally per item.
  for (const item of items) {
    const samples = answersByKey.get(item.key) ?? [];
    const keyMatches = samples.map((_, j) => okById.get(`${item.key}#${j}`) ?? null);
    out.set(item.key, tallyBlind(samples, keyMatches, agreement));
  }
  return out;
}
