/**
 * Pre-parse raw-byte lint for un-doubled LaTeX backslashes in authored JSON.
 *
 * LaTeX in JSON must have EVERY backslash doubled: `"\\(\\int_0^1 x^2\\,dx\\)"`.
 * LLMs get this wrong constantly, and the failure is asymmetric:
 *
 *  - `\int` `\sqrt` `\(` `\[` … → an ILLEGAL JSON escape → a loud `SyntaxError`.
 *    Harmless in that the file simply will not parse, but V8's message is only
 *    "Bad escaped character in JSON at position 4721".
 *  - `\frac` `\text` `\theta` `\begin` `\ne` `\to` `\right` … → `\f \t \b \n \r`
 *    are LEGAL JSON escapes, so these parse SILENTLY into `<FF>rac`, `<TAB>ext`,
 *    `<LF>e` … — the evidence is destroyed by `JSON.parse` before zod ever runs.
 *
 * So the real fix is upstream, on the RAW file bytes before `JSON.parse`. This
 * catches both the loud and the silent case with a `line:col` message naming the
 * offending token and the fix. (The zod C0-control refinement in lib/courseContent
 * is the belt-and-braces second layer for the silent case; this is the first.)
 *
 * Every backslash in valid JSON is inside a string literal and begins an escape,
 * so scanning the whole file text is sound — there is no non-string backslash to
 * confuse it. As in `segmentMath`, a doubled `\\` is consumed as a PAIR so the
 * second backslash is never re-examined (else correctly-escaped `\\frac` would
 * false-flag on its `\f`).
 */

export interface LatexLintIssue {
  /** 1-based line of the offending backslash. */
  line: number;
  /** 1-based column of the offending backslash. */
  col: number;
  /** Best-effort offending token, e.g. `\frac`, `\int`, `\(`. */
  token: string;
  /** Human-readable message with the fix. */
  message: string;
}

const LETTER = /[A-Za-z]/;

function makeIssue(raw: string, at: number, line: number, lineStart: number): LatexLintIssue {
  // Token for the message: the backslash plus the next char, extended through a
  // trailing letter run ONLY when the command name is itself alphabetic — so
  // `\frac`/`\int`/`\theta` capture the whole command, while `\(`/`\[` stop at the
  // delimiter and do not swallow the following `x`. Capped so a runaway line can't
  // blow up the message.
  let end = at + 2;
  if (LETTER.test(raw[at + 1] ?? "")) {
    while (end < raw.length && LETTER.test(raw[end])) end += 1;
  }
  const token = raw.slice(at, Math.min(end, at + 20));
  const col = at - lineStart + 1;
  const doubled = token.replace(/\\/g, "\\\\");
  return {
    line,
    col,
    token,
    message:
      `line ${line}:${col}: unescaped LaTeX backslash "${token}" — ` +
      `double every backslash inside JSON strings (write "${doubled}", not "${token}")`,
  };
}

/**
 * Scan raw file text and report every un-doubled LaTeX backslash. Empty array =
 * clean. Pure and isomorphic; the importer prepends the file path to each
 * message.
 */
export function lintLatexBackslashes(raw: string): LatexLintIssue[] {
  const issues: LatexLintIssue[] = [];
  const n = raw.length;
  let line = 1;
  let lineStart = 0;

  for (let i = 0; i < n; i++) {
    const ch = raw[i];
    if (ch === "\n") {
      line += 1;
      lineStart = i + 1;
      continue;
    }
    if (ch !== "\\") continue;

    const next = raw[i + 1];

    // Trailing lone backslash — let JSON.parse report it; nothing to double.
    if (next === undefined) continue;

    // `\\` — a correctly-doubled backslash. Consume the pair (the extra i++ plus
    // the loop's i++ skips both) so the second `\` is never examined on its own.
    if (next === "\\") {
      i += 1;
      continue;
    }

    // Unconditionally-legal single escapes: `\"`  `\/`  `\uXXXX`.
    if (next === '"' || next === "/" || next === "u") continue;

    // `\b \f \n \r \t` — a legal JSON escape UNLESS a letter immediately follows,
    // which is the single-backslash LaTeX signature (`\frac` `\text` `\begin`
    // `\ne` `\to` `\theta` `\right`). A genuine control escape is never followed
    // by "rac"/"heta"/… — and authored strings forbid literal C0 anyway, so a
    // real `\n`+letter would be rejected downstream regardless.
    if (next === "b" || next === "f" || next === "n" || next === "r" || next === "t") {
      if (LETTER.test(raw[i + 2] ?? "")) {
        issues.push(makeIssue(raw, i, line, lineStart));
      }
      continue;
    }

    // Anything else after `\` is an illegal JSON escape — the loud case
    // (`\int` `\sqrt` `\(` `\[`). Reported here with line:col and the fix
    // instead of leaving it to JSON.parse's position-only error.
    issues.push(makeIssue(raw, i, line, lineStart));
  }

  return issues;
}
