import { shuffleOptions } from "../shuffleOptions";

/**
 * Seeded shuffling for item PRESENTATION — option order, pair order, and the
 * initial scramble for ordering items. Reuses lib/shuffleOptions (xmur3 +
 * mulberry32) rather than a second PRNG; see docs/decisions/0007-item-shuffle-seed.md.
 *
 * Seed convention: ONE SEED PER ATTEMPT + ITEM (`${attemptId}:${itemId}`).
 * attemptId scopes it per learner-attempt, not per learner or per lesson —
 * re-rendering the same item mid-attempt (navigating back and forth, a
 * remount) reproduces the same scramble, but a fresh attempt (a retry) gets
 * a new attemptId and therefore a new scramble.
 *
 * These functions only ever touch PRESENTATION order. Scoring
 * (ItemTypeModule.score in lib/items/types.ts) takes the unshuffled `item`
 * and a `response` that must reference item identity (ids), never array
 * position — see the "no scoring depends on presentation order" test below
 * for the concrete shape that invariant takes.
 */
export function itemShuffleSeed(attemptId: string, itemId: string): string {
  return `${attemptId}:${itemId}`;
}

/**
 * Shuffle options/pairs for presentation (selection choices, matching
 * pairs). Thin wrapper so every item type shares one PRNG and one seed
 * convention instead of each re-deriving its own seed string.
 */
export function shuffleForItem<T>(options: T[], attemptId: string, itemId: string): T[] {
  return shuffleOptions(options, itemShuffleSeed(attemptId, itemId));
}

function isIdentityOrder(indices: readonly number[]): boolean {
  return indices.every((v, i) => v === i);
}

/**
 * Shuffle an ordering item's N elements for presentation, returning a
 * permutation of INDICES [0..n-1] — not the elements themselves — so items
 * whose displayed values repeat (e.g. two identical words in a sequencing
 * exercise) are still distinguished by position, not value equality. The
 * caller renders `elements[shuffled[i]]` at presented slot `i`.
 *
 * THE GUARANTEE: the result is never the identity permutation, i.e. never
 * the authored (correct) order. A naive shuffle lands on identity with
 * probability 1/n!, which is 50% for a 2-element item — a coin flip giving
 * away the answer. If the underlying shuffle happens to produce identity,
 * swap the first two presented slots: identity has them strictly ascending
 * and distinct, so the swap always differs from identity, requires no
 * reshuffle loop (bounded, still deterministic per seed), and is only ever
 * applied in the identity case so it doesn't bias the distribution for n>=3
 * beyond avoiding the one forbidden outcome.
 */
export function shuffleOrderingIndices(n: number, attemptId: string, itemId: string): number[] {
  const identity = Array.from({ length: n }, (_, i) => i);
  if (n <= 1) return identity;
  const shuffled = shuffleOptions(identity, itemShuffleSeed(attemptId, itemId));
  if (!isIdentityOrder(shuffled)) return shuffled;
  const fixed = shuffled.slice();
  [fixed[0], fixed[1]] = [fixed[1], fixed[0]];
  return fixed;
}
