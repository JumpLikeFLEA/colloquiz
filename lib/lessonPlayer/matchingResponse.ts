import type { MatchingResponse } from "../items/matching";

/**
 * PLAY-003 — pure state-transition and response-building helpers behind the
 * `matching` renderer. Same jsdom-avoidance precedent as
 * lib/lessonPlayer/selectionResponse.ts / orderingResponse.ts.
 *
 * `pairs` is a Map keyed by `left` id (a left element pairs with at most one
 * right at a time in the UI, mirroring matching.ts's own `duplicate_id`
 * rule), one entry per paired left. The right side is a REUSABLE pool, never
 * consumed on pairing: matching.ts (docs/decisions/0013 Decision 2) makes
 * many-to-one legal both authored and answered, so disabling a right chip
 * after one use would make that legal case unrepresentable in this renderer
 * even though scoring still accepts it — the exact trade 0013's "what would
 * make us revisit" section warns against. `setMatchingPair`/
 * `clearMatchingPair`/`moveMatchingPair` therefore never look at what else
 * currently points at a right id.
 *
 * `moveMatchingPair`/`firstEmptyLeftId` were added for the row-slots-and-bank
 * rework (docs/decisions/0039): every state transition the renderer's tap
 * flow (select a slot, then a chip) and drag flow (chip-to-slot,
 * slot-to-bank, slot-to-slot) can produce still goes through one of the four
 * functions in this file, none of which are React/jsdom-dependent.
 */

export function setMatchingPair(
  pairs: ReadonlyMap<string, string>,
  leftId: string,
  rightId: string,
): Map<string, string> {
  const next = new Map(pairs);
  next.set(leftId, rightId);
  return next;
}

export function clearMatchingPair(pairs: ReadonlyMap<string, string>, leftId: string): Map<string, string> {
  const next = new Map(pairs);
  next.delete(leftId);
  return next;
}

/**
 * Moves whatever right id `fromLeftId` currently holds onto `toLeftId`,
 * vacating `fromLeftId` — the drag-a-placed-answer-onto-another-slot case.
 * `toLeftId`'s previous pairing (if any) is simply overwritten, never carried
 * anywhere: unlike `slotsResponse.ts`'s `moveChipToGap`, there is no bank
 * bookkeeping to preserve here, because the right side is a REUSABLE pool
 * (0013 Decision 2) — a right id displaced from `toLeftId` was never "used up"
 * to begin with, it is simply still available in the bank it never left.
 * A no-op (returns an equivalent copy) when `fromLeftId` holds nothing, or
 * when the two ids are the same slot.
 */
export function moveMatchingPair(
  pairs: ReadonlyMap<string, string>,
  fromLeftId: string,
  toLeftId: string,
): Map<string, string> {
  const rightId = pairs.get(fromLeftId);
  if (rightId === undefined || fromLeftId === toLeftId) return new Map(pairs);
  const next = new Map(pairs);
  next.delete(fromLeftId);
  next.set(toLeftId, rightId);
  return next;
}

/** The first left id (in authored `leftIds` order) with no pairing — "tapping
 * a chip with no slot selected fills the first empty slot", mirroring
 * `slotsResponse.ts`'s `firstEmptyGapId`. `null` when every slot is filled. */
export function firstEmptyLeftId(leftIds: readonly string[], pairs: ReadonlyMap<string, string>): string | null {
  return leftIds.find((leftId) => !pairs.has(leftId)) ?? null;
}

export function buildMatchingResponse(pairs: ReadonlyMap<string, string>): MatchingResponse {
  return [...pairs.entries()].map(([left, right]) => ({ left, right }));
}
