import type { StoredAttempt } from "./attemptStore";

/**
 * A lesson's best score from the attempts in the browser's local store, for
 * one lesson version: the same formula as `get_course_attempt_summary`
 * (supabase/migrations/050_course_attempt_summary.sql). That is the best
 * attempt per block by earned/possible, those summed, and
 * `round(100 * earned / possible)`. Null when nothing for that version is
 * stored.
 *
 * The lesson page needs it because the server's figure can lag
 * (docs/decisions/0088): after a learner signs in from the end of a lesson,
 * the page renders before the player has uploaded their anonymous attempts.
 *
 * Pure, so it is unit-tested without a browser.
 */
export function bestPercentForVersion(attempts: readonly StoredAttempt[], lessonVersionId: string): number | null {
  const bestPerBlock = new Map<string, StoredAttempt>();
  for (const a of attempts) {
    if (a.lessonVersionId !== lessonVersionId || a.possible <= 0) continue;
    const current = bestPerBlock.get(a.blockId);
    if (!current || a.earned / a.possible > current.earned / current.possible) bestPerBlock.set(a.blockId, a);
  }
  if (bestPerBlock.size === 0) return null;
  let earned = 0;
  let possible = 0;
  for (const a of bestPerBlock.values()) {
    earned += a.earned;
    possible += a.possible;
  }
  return Math.round((100 * earned) / possible);
}

/** The higher of two optional percentages; null only when both are. "Display
 * the best score, always" (docs/handoff.md, "Scoring and progress"). */
export function higherPercent(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}
