# 0016 — Lesson scoring aggregate: shape and rounding

## Context

ITEM-008 (issue #56) rolls the per-item `ItemScoreResult`s the five type
modules already produce (`lib/items/index.ts`'s `scoreItem`) into one lesson
result. `docs/handoff.md` already fixes the formula — "Lesson score is
`Σearned / Σpossible`… The denominator is constant because English lessons
are fixed authored sequences" — so this card is not free to pick a different
one; what it has to decide is the result shape, the zero-item/zero-possible
case, and the rounding rule, each named explicitly in the issue's acceptance.

## Decisions

**1. Aggregation takes already-computed results, not items+responses.**
`aggregateLessonScore(itemInputs: { itemId: string; result: ItemScoreResult
}[])` — it does not call `scoreItem` itself. The caller (the lesson-player
submit path, not yet built) already has one `ItemScoreResult` per authored
item after scoring each response; this module's only job is the sum, kept
separate from response validation and from persistence.

**2. `itemId` is threaded in by the caller, not read off the result.**
`ItemScoreResult` has no item-level id — only `SubResult.id`, which for a
single-part type (`selection`) is `item.id` but for a multi-part type
(`selection_grid`/`matching`/`slots`) is a row/pair/gap id (0009). There is
no way to recover "which item" from a multi-part `ItemScoreResult` alone, so
`LessonItemInput` pairs each result with the id explicitly.

**3. Unscored is a named status, not a 0/0 computation.** `possible === 0`
— true for a lesson with no items, and (defensively) for a lesson where every
item scored `possible: 0` — returns `{ status: "unscored", percent: null,
... }` instead of dividing. No item type can currently author itself into
`possible: 0` (each type's own validation requires at least one scorable,
gradeable part — e.g. `selection`'s "at least one option must be incorrect"
check), so the all-zero-possible case is speculative today. It is handled
anyway because the acceptance line names it explicitly and because the
zero-items case (an empty lesson, or a lesson every one of whose items failed
to parse) is not speculative — the aggregate must not crash on it.

**4. Rounding: `Math.round(earned / possible * 100)`, decided once, here.**
This is the same function already used at every point in the app that turns
a fraction into a displayed percentage (`lib/subjectStats.ts`,
`lib/progressStats.ts`, `lib/courses.ts`, `QuizResultsTable.tsx`,
`results/[id]/page.tsx`, `CheckPlayer.tsx`) — picked for consistency with
that existing convention, not re-derived. `Math.round` rounds a `.5` toward
positive infinity, so **79.5% displays as 80%** (asserted directly in
`lessonScore.test.ts`, `159/200 = 79.5% -> 80`). `percent` is computed once
here and carried on the result; no surface downstream should recompute it
from `earned`/`possible` itself, or the two could round differently.

**5. The result carries every subResult, not just the totals.** `items:
LessonItemScore[]` — each entry keeps `itemId`, `earned`, `possible` and the
full `subResults` array verbatim (same array reference; the aggregate copies
nothing). This is what acceptance line 4 ("the result shape carries
everything the explanations UI needs without a second pass over the items")
requires: an explanations screen reads `lesson.items[i].subResults[j]` for
its `explanationRef`, `correct` and per-row id without re-walking the
original items or re-calling `scoreItem`.

## What would make us revisit this

- If a future item type can legitimately author `possible: 0` for a single
  item inside an otherwise-scorable lesson (not all-zero), the "every item
  has `possible: 0`" unscored condition would need to change from
  `Σpossible === 0` to something that also flags a partially-degenerate
  lesson — not needed today since no type can produce that.
- If a surface needs a rounding rule other than nearest-integer (e.g. a
  progress bar wanting one decimal place), that surface computes its own
  presentation from `earned`/`possible`, not by changing this module's
  `percent` — two rounding rules under one field name is the failure mode
  this decision exists to prevent.
