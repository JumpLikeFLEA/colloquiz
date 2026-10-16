# 0150 — TCH-003: a linked student's answers and scores in Studio

Status: built; migration 078 written, **not applied**; its verify script
(`supabase/verify/078_linked_student_answers.sql`) written, **not run** (no
database reachable from the session). Decided unattended under
`--no-approval`; each call below is one the owner can overturn.

## Context

docs/decisions/0141 Decision 6: for a linked student the teacher sees every
attempt's answer per exercise and the best lesson score, superseding 0109
Decision 8 (no scores) for linked students only. 0146 Decision 5 left read
access to the owner only; this card adds the teacher path. Privacy 1.5 §5
(0144) already lists answers and scores among what a linked teacher sees, so
no legal change is needed.

## Decisions

1. **Two SECURITY DEFINER readers, no grant change.** `lesson_attempts` stays
   owner-read. `linked_student_attempts(p_student)` and
   `linked_student_lesson_scores(p_student)` return rows only when
   `_teacher_linked(auth.uid(), p_student)` (076 Decision 6: active link only)
   and `can_edit_course(course, auth.uid())`. Otherwise they return nothing,
   not an error, so the caller learns nothing about an unlinked student. The
   gate is inside the function; the page also skips the calls for a student
   who is not in `teacher_linked_students()`, which is a cost choice, not the
   boundary.
2. **The block comes from the attempt's own version.** Each attempt row
   carries the practice block from `lesson_versions.document` of
   `lesson_version_id` (the 064 `learner_recordings` pattern). An answer is
   read against what the learner saw, even after the lesson was edited. An
   exercise is keyed `(version, block)`, so the same block id in two versions
   is two exercises.
3. **"Best" is `lesson_completion()`'s, not a new definition.**
   `linked_student_lesson_scores` calls it (075) over the courses the caller
   edits and passes `best_percent` through. A lesson not yet complete shows
   "N of M answered" instead of a percent, as the course page does (0147).
4. **Rendering is a pure module.** `lib/learners/answerText.ts`: one function
   per item type, input is the block JSON and the stored response, output is
   lines of text. States: `ok`, `no_response` (the attempt stored no answer:
   older than 074, over the 4096-byte cap of 0146 D2, or sent without one),
   `unreadable` (block missing from the version, fails `parseItem`, or the
   response has the wrong shape). Unreadable is not shown as "no answer": the
   two have different causes. An option or element removed from a later
   version cannot occur (the block is the attempt's own version), but a
   dangling id is named, not dropped.
5. **Marking is not repeated.** Right and wrong is the row's earned/possible
   (e.g. "1 of 2 (50%)"); the text shows what was answered, not the key.
   Showing the correct answer to the teacher was not asked for.
6. **Grouping.** Exercises are numbered per lesson by the time of their first
   attempt, because the SQL result has no document order. The number is a
   label for reading, not the learner's "Exercise N of M".
7. **Non-linked page unchanged.** No call, no section, no scores. The roster
   and lesson activity card still say "No scores" for those learners.

Revisit: if teachers want the key beside the answer; if the first-attempt
numbering confuses (return the block's index in the document from SQL then);
if 4096 bytes drops answers that matter (0146's NULL-rate check).
