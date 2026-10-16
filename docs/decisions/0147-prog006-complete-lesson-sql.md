# 0147 — PROG-006: the complete-lesson rule in SQL

Status: implemented, migration 075 written and NOT applied. Implements 0143.

## Decisions

1. **One definition.** `lesson_completion(p_user_id, p_course_ids)` is the only
   place the rule lives. The four readers call it: `get_course_attempt_summary`,
   `learner_roster`, `learner_lessons`, `course_stats`. It is SECURITY DEFINER
   with EXECUTE revoked from everyone (the `learner_contact_label` precedent,
   073). NULL user / NULL courses mean "all", so each caller wraps its course
   list in `COALESCE(..., '{}')` and gates a NULL `auth.uid()`.
2. **Exercises** are `kind = 'practice'` blocks of the played version's own
   document, counted distinct by block id. An attempt on a block the version
   does not hold does not count (seeded: a `ghost` attempt).
3. **Which version.** Per learner and lesson: a complete version if any (highest
   score among them), else the furthest-along partial one. A partial retake on
   a newer version therefore cannot beat or hide an earlier completion.
4. **Zero-exercise.** Judged on the current published version: no practice
   blocks and a `lesson_opens` row. Not consulted for lessons with exercises.
5. **Score.** `best_percent` is NULL unless complete through its exercises, so
   an in-progress lesson shows no score and a zero-exercise lesson has none; the
   course average is over lessons with a score.
6. **Return-type changes** (DROP + CREATE, same grants): the summary gains
   `complete`, `exercises_answered`, `exercises_total`; `course_stats` renames
   `attempted_learners` to `completed_learners` and the Studio stats page label
   "Attempted" becomes "Completed" (0143 Decision 5).
7. **Roster** counts completed lessons over the same set as `lessons_total`
   (published), so completed cannot exceed total. `learner_lessons`'s
   `first/last_completed_at` are now NULL until complete: for an exercise
   lesson, when the last required exercise was first answered and the latest
   answer on that version; for a zero-exercise lesson, the open times.
8. **TypeScript** only reads the result (`attemptsFromSummaryRows`,
   `lessonRowProgress`, `courseProgress`). The copy keys `progressAttempted` /
   `attempted` keep their names; only the EN text changed.
9. **/my** has no per-lesson list, so it gets the corrected numbers and the
   "lessons completed" label but no in-progress tile; the tile is on the course
   page. Owner may want a course-level in-progress line on /my: not added.

## Verification (local, not hosted)

Migration 075 was run in a throwaway `postgres:16` container against stub
tables of the columns these functions read, with two seeded learners plus a
third who only opened a lesson. Printed results matched hand-derived values:
a lesson answered in full on a superseded version stays complete (67%, the
worse retake and the partial newer-version retake ignored); a 1-of-3 lesson is
excluded (1/3, no score); zero-exercise lessons complete only with an open row;
an attempt-only lesson with no open row completes; the opened-only learner gets
0 summary rows while others get rows (positive control); anonymous gets 0 rows.
The stubs are not the hosted schema: re-run after the owner applies 075.

## Revisit if

- A republish that REMOVES exercises should demote a learner partial on the old
  version (today the zero-exercise open rule completes it).
- Opening-only completion of theory lessons proves too weak (0143).
