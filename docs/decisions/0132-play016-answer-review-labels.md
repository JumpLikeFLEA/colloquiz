# 0132 — PLAY-016: the answer review names its exercise and row

## Context
The completion card's "Answer review" listed bare explanations; on a long
lesson the learner could not tell which exercise or row one belonged to.

## Decisions (made unattended)
1. A pure `reviewEntriesForSession` (`lib/lessonPlayer/reviewEntries.ts`)
   replaces `explanationsForSession` as `LessonCompletion`'s input (renamed
   prop `review`). Same content rule as 0058 Decision 2: wrong sub-parts only,
   document order. `explanationsForSession` stays, still tested.
2. Heading is "Exercise N · k": N counts practice blocks (the "Exercise N of
   M" pill); k is the sub-part's 1-based index in the authored list (row,
   pair, element), "Gap k" for slots, none for `selection` (one sub-part,
   0009). For ordering k is the element's correct position, since the
   learner's own order is not part of the score result.
3. The line under the heading is the statement (grid), element text
   (ordering), left-side text or image alt (matching) or the prompt
   (selection, slots: a gap has no text of its own), one line, `truncate`.
4. The heading line links to `#exercise-<block id>`; the practice card gets
   that id and `scroll-mt-20` so the sticky progress strip does not cover it.
5. New string `completion.reviewExercise` ("Exercise"). Existing tokens only.

## Revisit if
Learners want the answer they gave shown in the review (not in the score
result today), or ordering's k should be the learner's position.

## Verification
`reviewEntries.test.ts` (labels, order, correct/unattempted omitted),
`LessonCompletion.test.tsx` (heading, statement, hrefs, order).
`npm run check` and the lesson-player tests pass.
