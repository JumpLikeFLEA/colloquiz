# 0134 — PLAY-018: True/False buttons say which statement they answer

## Context
Each `selection_grid` row's buttons were named only "True" / "False", so a
screen reader heard the same two names for every row.

## Decisions (made unattended)
1. The True/False pair is `role="group"` with `aria-labelledby` pointing at the
   row's statement span (id from `useId` + row id). The accepted alternative in
   the card ("each button's accessible name includes the row number and
   statement") was not chosen: it would repeat the statement on every button
   and rename them "True" -> "1. ..., True", breaking name-based lookups
   (LessonPlayer.test.tsx finds buttons by exactly "True").
2. No visual change: no class changed. The button names stay "True"/"False".
3. The acceptance's test line asks for a button found by a name containing its
   statement; the test instead finds the GROUP by the statement and then the
   button inside it (SelectionGridRenderer.test.tsx). That follows from
   Decision 1 and is flagged for review.

## Revisit if
A screen-reader pass shows the group name is not announced on entering the
pair, in which case switch to per-button `aria-label`.

## Verification
SelectionGridRenderer.test.tsx; the existing LessonPlayer and
WrongAnswerNotes tests still pass unchanged. Not run with a real screen reader.
