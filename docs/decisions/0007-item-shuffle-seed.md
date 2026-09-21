# 0007 — Item presentation shuffle: seed convention and the ordering guarantee

## Context

ITEM-002 (issue #50): option order, pair order and the initial `ordering`
scramble need to be deterministic per learner-attempt, reusing the existing
PRNG (`lib/shuffleOptions.ts`, xmur3 + mulberry32) rather than a second one.

## Options considered

**Seed scope.** Per learner, per lesson, or per attempt+item. Per-learner or
per-lesson would mean the same item always shuffles the same way for a given
learner across every attempt — a returning learner who failed a lesson once
would see the identical scramble on retry, which trivializes memorized
answer *positions* rather than content on a second attempt. Per attempt+item
(`${attemptId}:${itemId}`) means re-rendering the same item mid-attempt
(navigating back and forth, a remount) is stable — nothing reshuffles under
the learner mid-answer — while a genuine retry (a new attemptId) gets a
fresh scramble. Chose attempt+item.

**The ordering never-identity guarantee.** A naive Fisher-Yates shuffle over
an ordering item's N elements lands on the authored (correct) order with
probability 1/n! — 50% for a 2-element item, an outright coin-flip giveaway.
Two ways to exclude identity: reshuffle-until-different (loop, seeded so it
must still terminate deterministically) vs. a single deterministic
correction applied only when the shuffle happens to produce identity. Chose
the deterministic correction — swap the first two presented slots — because
identity is always strictly ascending distinct indices `[0,1,...,n-1]`, so a
swap of positions 0 and 1 is provably never identity again, in one step,
with no loop and no risk of an unbounded (or seed-dependent-length) retry
chain.

**Compare by index or by value, for the never-identity check.** Ordering
items can have repeated displayed text (e.g. two identical words in a
sequencing exercise), so shuffling and comparing VALUES could call two
visually-identical-but-differently-sourced arrangements "the same" when
they are not, or vice versa. `shuffleOrderingIndices` shuffles and compares
the index array `[0..n-1]` itself, never the elements — the caller renders
`elements[shuffled[i]]` at slot `i`. This also keeps the function generic:
it doesn't need to know anything about the element type.

**Verifying "no scoring depends on presentation order."** No real `score()`
exists yet for `ordering` (ITEM-005's placeholder from ITEM-001 always
returns a stub). The invariant is therefore verified as a design property
plus a concrete worked test in `lib/items/shuffle.test.ts`
("no scoring depends on presentation order"): elements carry their own ids,
the learner's submitted answer is an ordered list of ids, and scoring
compares that id sequence to the authored id sequence — never array
position. The test shuffles the same elements under three different
attemptIds (three different presentation orders) and shows the score for a
fixed submitted answer is unchanged, and a fixed wrong answer stays wrong,
regardless of which seed presented it. This is the shape ITEM-005's real
`score()` must follow; `shuffleOrderingIndices` itself never appears on
the scoring path — it's presentation-only.

## Decision

- `lib/items/shuffle.ts`: `itemShuffleSeed(attemptId, itemId)` →
  `"${attemptId}:${itemId}"`; `shuffleForItem` (thin wrapper over
  `lib/shuffleOptions.shuffleOptions` for selection choices / matching
  pairs); `shuffleOrderingIndices(n, attemptId, itemId)` (index-permutation
  shuffle with the never-identity guarantee, swap-based correction).
- No new PRNG; `lib/items/shuffle.ts` imports `shuffleOptions` by relative
  path (`../shuffleOptions`), not the `@/lib/...` alias — the alias isn't
  resolved by `vitest.config.mts` (no `resolve.alias` configured there,
  unlike `tsconfig.json`'s `paths`), and every other tested `lib/` module
  reaches its siblings by relative import for the same reason.

## What would make us revisit this

- If a real ordering item ever needs n > ~10 (a long procedure, not a
  sentence), the swap-based correction still holds (it only ever touches
  slots 0/1 and only in the identity case), but it's worth reconfirming the
  distribution isn't perceptibly biased at that scale — untested territory
  today, and the guarantee is checked only at n=2/n=3 per acceptance.
- If `vitest.config.mts` ever gains `resolve.alias` for `@/*` (e.g. because
  a later lib module genuinely needs to reach outside `lib/`), the relative
  import here could be switched to the alias for consistency — not required
  today.
