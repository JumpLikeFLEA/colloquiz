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
 * `clearMatchingPair` therefore never look at what else currently points at
 * a right id.
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

export function buildMatchingResponse(pairs: ReadonlyMap<string, string>): MatchingResponse {
  return [...pairs.entries()].map(([left, right]) => ({ left, right }));
}
