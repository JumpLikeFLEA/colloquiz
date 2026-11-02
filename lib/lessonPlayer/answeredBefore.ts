import type { ItemScoreResult } from "../items";
import type { LessonDocument } from "../lessons/parseLessonDocument";
import type { LessonSessionResults } from "./session";

/**
 * PLAY-019 (docs/decisions/0210) — the exercises of this lesson the learner
 * answered on an earlier visit, so the player's progress strip and completion
 * card count them the way the course page does (0143).
 *
 * The rule is the per-version half of `lesson_completion()`
 * (supabase/migrations/075_lesson_completion.sql, 0147 Decision 2): an
 * attempt counts only for the version it was made on, and only for a block
 * that version's document holds as an exercise. Here the version is the one
 * being played. Per block, the best attempt by earned / possible (the 050
 * order). Attempts come from the server (signed in) and the local attempt
 * store (anyone); the caller passes both and this takes the best.
 *
 * Pure, so it is unit-tested without a browser or a database.
 */

export type EarlierAttempt = { lessonVersionId: string; blockId: string; earned: number; possible: number };

export type EarlierAnswers = Readonly<Record<string, { earned: number; possible: number }>>;

function ratio(a: { earned: number; possible: number }): number {
  return a.possible > 0 ? a.earned / a.possible : 0;
}

export function earlierAnswers(
  document: LessonDocument,
  lessonVersionId: string,
  attempts: readonly EarlierAttempt[],
): EarlierAnswers {
  if (!lessonVersionId) return {};
  const exercises = new Set(document.filter((b) => b.kind === "practice").map((b) => b.id));
  const out: Record<string, { earned: number; possible: number }> = {};
  for (const a of attempts) {
    if (a.lessonVersionId !== lessonVersionId || !exercises.has(a.blockId) || a.possible <= 0) continue;
    const current = out[a.blockId];
    if (!current || ratio(a) > ratio(current)) out[a.blockId] = { earned: a.earned, possible: a.possible };
  }
  return out;
}

/**
 * This visit's results with the earlier answers folded in, best per block, in
 * the shape `sessionProgress` and `scoreSession` already take. An earlier
 * answer carries no sub-results: nothing renders them, and the answer review
 * reads this visit's results only.
 */
export function withEarlierAnswers(results: LessonSessionResults, earlier: EarlierAnswers): LessonSessionResults {
  const merged: Record<string, ItemScoreResult> = {};
  for (const [id, prior] of Object.entries(earlier)) merged[id] = { earned: prior.earned, possible: prior.possible, subResults: [] };
  for (const [id, now] of Object.entries(results)) {
    const prior = merged[id];
    if (!prior || ratio(now) >= ratio(prior)) merged[id] = now;
  }
  return merged;
}
