# 0131 — PLAY-015: a wrong sub-part names the right answer

## Context
A wrong True/False row, matching pair, typed or dragged gap, or ordering row
showed ✗ and "Why?" only. The sort renderer already showed "Correct: <bucket>"
(0060).

## Decisions (made unattended)
1. Same style everywhere: a `text-xs text-muted-foreground` line under the
   wrong sub-part, "Correct: <answer>" (`player.correctAnswerPrefix`, already
   in copy.ts). Ordering gets one new string, `player.correctPositionPrefix`
   ("Correct position: N"). Existing tokens only.
2. Typed and dragged gaps share `GapExplanations`, which now lists every wrong
   gap as "Gap N: Correct: <acceptedAnswers[0]>", whether or not the gap has
   an explanation (before, a wrong gap with no explanation showed nothing).
   Only the first accepted answer is shown, the one a drag chip carries
   (SlotsRenderer header). The learner's own answer is already in the gap.
3. True/False marks the correct choice as text ("Correct: True"), not by
   re-styling a button: the learner's pick stays visible as picked.
4. Matching renders the right side through `MatchingContentView` (inline), so
   an image pair shows the image, unlike the sort renderer's text-only note.
5. Ordering position comes from the element's index in `payload.elements`,
   which is authored in the correct order (lib/items/ordering.ts).

## Revisit if
Authors want every accepted answer listed, or the marked-button True/False
look is preferred.

## Verification
`WrongAnswerNotes.test.tsx` (grid, typed gaps), plus a wrong-state test in
MatchingRenderer and OrderingRenderer tests; each asserts the note is absent
before Check and for correct sub-parts. `npm run budget`: applied-practice
289.3 KB of 290 (289.2 before); `true-or-false` is 261.4 KB of 260 both with
and without this change (checked by `git stash -u`), so the overage predates it.
