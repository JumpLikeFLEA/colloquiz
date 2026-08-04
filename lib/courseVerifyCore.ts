/**
 * Pure core of course answer-verification Layer 2 (the blind solver). Split out of
 * lib/courseVerify.ts — which imports the Anthropic client graph and so cannot load
 * without an API key — so `tallyBlind` stays unit-testable offline. Same precedent
 * as lib/courseFilters.ts vs lib/courses.ts: pure, isomorphic logic in its own file.
 */

export interface BlindItem {
  /** authored_key — a stable id echoed into critic_notes and used to join results. */
  key: string;
  /** the question stem (LaTeX); MUST NOT include options or the correct answer. */
  stem: string;
  /** the authored answer key (LaTeX), compared against each blind solve. */
  correctAnswer: string;
}

export interface VerifyOutcome {
  ok: boolean | null; // true = confirmed, false = proven wrong, null = unverifiable
  reason?: string;
}

export const BLIND_SOLVER_SAMPLES = 3; // k
export const BLIND_SOLVER_AGREEMENT = 2; // runs that must match the key to confirm (majority of 3)

/**
 * Pull the answer string out of a blind-solver reply. The critic model tends to
 * show its working — prose plus $$…$$ LaTeX full of braces — before emitting the
 * final {"answer": "..."} object, which defeats a generic greedy-brace JSON
 * extractor (the first "{" it grabs is a \frac{…} brace). So target the answer
 * field directly and take the LAST occurrence: the model's final JSON, past any
 * worked-example braces. Returns null when no answer field is present or it is
 * empty — treated by the caller as an abstention, never a crash.
 */
export function extractAnswer(text: string): string | null {
  const matches = [...text.matchAll(/"answer"\s*:\s*"((?:\\.|[^"\\])*)"/g)];
  if (matches.length === 0) return null;
  const raw = matches[matches.length - 1][1];
  try {
    // Re-wrap and JSON.parse so escape sequences in the value unescape correctly.
    const value = JSON.parse(`"${raw}"`) as string;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Pure decision from k solver samples and their per-sample key-match verdicts.
 * `answers` and `keyMatches` are parallel arrays (one entry per parseable sample):
 * keyMatches[i] is true (SymPy proved sample i equal to the key), false (proved
 * unequal), or null (couldn't decide).
 */
export function tallyBlind(
  answers: string[],
  keyMatches: (boolean | null)[],
  agreement: number,
): VerifyOutcome {
  if (answers.length === 0) {
    return { ok: null, reason: "blind solver produced no parseable answer" };
  }
  const matches = keyMatches.filter((m) => m === true).length;
  const decided = keyMatches.filter((m) => m !== null).length;
  const produced = `[${answers.join(" | ")}]`;

  if (matches >= agreement) return { ok: true };

  // A confident solver that decidably contradicts the key on every run is evidence
  // the KEY is wrong (false); a scattered/inconclusive one is merely unverifiable.
  if (matches === 0 && decided >= agreement) {
    return {
      ok: false,
      reason: `blind solver contradicted the key on all ${decided} decidable run(s); it produced ${produced}`,
    };
  }
  return {
    ok: null,
    reason: `blind solver did not confirm the key (${matches}/${answers.length} run(s) matched, ${agreement} needed); it produced ${produced}`,
  };
}
