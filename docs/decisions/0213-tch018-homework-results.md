# 0213 — TCH-018: homework results by exercise

Status: built; migration 106 applied to the local stack only (twice, to show
it re-applies), verify `supabase/verify/106_homework_results.sql` prints
`TCH-018 PASS`. Not applied to hosted. Decided unattended under `--no-approval`.

## Context

`/studio/homework` showed Done, lessons done and best score per student.
Per-exercise answers existed only on each learner's page (TCH-003, 0150), so
"who missed exercise 4" took one visit per student.

## Decisions

1. **A new read-only RPC, `homework_results(p_assignment)` (106).** The
   existing readers (`linked_student_attempts`, 078/080) return only exercises a
   student attempted, and for a lesson the teacher does not edit the lesson
   document is not readable, so unanswered exercises could not become columns.
   The function returns one row per (current recipient, exercise) with the best
   attempt's earned/possible/response, or NULLs. The acceptance line already
   named a migration for this case; no table, column or grant changed.
2. **Gate = the assignment's own teacher and `_homework_recipients()`** (080:
   active link, not deleted). Anyone else, an ended link or another teacher's
   assignment returns no rows, not an error. Verified with a positive control
   beside each denial (verify §3, §4).
3. **Exercises are the practice blocks of the lesson's published version, in
   document order**, matching 075's scope. A cell counts attempts on that
   version only: an attempt on an older version shows as "—" (0210 Decision 3
   made the same call for resume). "Best" is the highest earned/possible, the
   latest on a tie. The block rides along so the page renders the answer with
   TCH-003's `answerText`, never the answer key.
4. **Page, not an inline panel:** `/studio/homework/[id]/results`, a Server
   Component, no client JS. The grid is a real `<table>` in its own horizontal
   scroller, student column sticky (the review queue's status table). A cell is
   a link (`?s=&e=`) and the chosen answer renders under the grid. A
   whole-course assignment gets one column group per lesson.
5. **The page needs the assignment in the caller's own list** (`loadHomeworkViews`),
   so another teacher's id is a 404 before any results call.

Revisit: if a course assignment grows past ~8 lessons (columns get long; the
fix is a lesson filter); if teachers want attempts per cell, not just the best.
