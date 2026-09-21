import type { ItemScoreResult, SubResult } from "./types";

/**
 * `aggregateLessonScore` — ITEM-008. Rolls the `ItemScoreResult`s already
 * produced by `scoreItem` (lib/items/index.ts) into one lesson result, per
 * the aggregate rule in docs/handoff.md: "Lesson score is `Σearned /
 * Σpossible`. The denominator is constant because English lessons are fixed
 * authored sequences." See docs/decisions/0016-lesson-score-aggregate.md for
 * why the shape and the rounding rule are what they are.
 *
 * This module does not call `scoreItem` itself — it takes results the caller
 * already has (one per authored item, paired with that item's id) and sums
 * them. Nothing here re-derives a score from a response.
 */

/** One item's contribution to the lesson, with its own id restored — an
 * `ItemScoreResult` alone does not carry it (a multi-part item's subResults
 * are identified by row/pair/gap id, not by the item's id; see
 * docs/decisions/0009-subresult-identity.md). */
export interface LessonItemScore {
  itemId: string;
  earned: number;
  possible: number;
  subResults: SubResult[];
}

export type LessonScoreStatus = "scored" | "unscored";

/**
 * `status: "unscored"` — Σpossible is 0, which happens for a lesson with no
 * items, or (defensively) one where every item scored `possible: 0`. No
 * current item type can author itself into the latter (each type's own
 * validation rejects an item with no wrong answer / no scorable part — see
 * e.g. `selection`'s "at least one option must be incorrect" check), but the
 * aggregate does not assume that holds forever; it names the state instead
 * of computing 0/0.
 *
 * `percent` is `null` exactly when `status` is `"unscored"` — there is no
 * percentage of nothing.
 */
export interface LessonScoreResult {
  status: LessonScoreStatus;
  earned: number;
  possible: number;
  /** Rounded to the nearest integer 0-100; see docs/decisions/0016 for the
   * rounding rule (Math.round, so 79.5 displays as 80). `null` when unscored. */
  percent: number | null;
  items: LessonItemScore[];
}

/** One authored item's id paired with the `ItemScoreResult` `scoreItem`
 * produced for it. Order is preserved into `LessonScoreResult.items`. */
export interface LessonItemInput {
  itemId: string;
  result: ItemScoreResult;
}

export function aggregateLessonScore(itemInputs: readonly LessonItemInput[]): LessonScoreResult {
  const items: LessonItemScore[] = itemInputs.map(({ itemId, result }) => ({
    itemId,
    earned: result.earned,
    possible: result.possible,
    subResults: result.subResults,
  }));

  const earned = items.reduce((sum, item) => sum + item.earned, 0);
  const possible = items.reduce((sum, item) => sum + item.possible, 0);

  if (possible === 0) {
    return { status: "unscored", earned, possible, percent: null, items };
  }

  return { status: "scored", earned, possible, percent: Math.round((earned / possible) * 100), items };
}
