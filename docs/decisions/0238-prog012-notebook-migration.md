# 0238 — PROG-012: the notebook migration

Status: built 2026-11-25 (migration 112, #329). It builds 0236 sections 1 to 6. Below is what the
card left open and was decided unattended.

## Decisions

1. **What cannot be copied raises.** `_notebook_copy` raises when the stored result is not an object
   with a known `kind` (the cases where `parseStoredAnalysis` returns null). `voice_analysis_finish`
   and the sweep catch it in a subtransaction, log a WARNING and leave `notebook_copied_at` NULL.
2. **`mainError` indexes the well-formed errors,** as in `parseStored.ts`, which drops malformed
   members before it reads the index. `scripts/notebook-parity-local-run.ts` compares the two.
3. **`phrase_key`** trims space, tab, LF, VT, FF, CR and U+00A0, lower-cases, and folds U+2018,
   U+2019 and U+02BC to `'`. 0236 says "the three typographic apostrophes" without naming them.
   PROG-013 mirrors this list.
4. **A note's lesson must be readable** (`can_read_lesson`, as `record_lesson_open` checks). Otherwise
   the title snapshot would reveal a draft lesson's title. Unknown and unreadable answer the same.
   A note with no lesson has no course either.
5. **Deleting a summary** is its own RPC, `notebook_delete_summary(submission)`: a summary is keyed by
   its take. `notebook_delete_entry` covers the three entry kinds.
6. **The teacher's JSON** leaves out `user_id`, `submission_id`, `note` and `baseline_lesson_id`.
   `my_notebook()` leaves out `user_id` and `baseline_lesson_id`.
7. **The export** maps every row and leaves out `phrase_key`, an index. The route fails, as for any
   section, when `my_notebook()` answers anything but the two lists.
8. **The sweep locks the stuck takes first too,** not only those it recovers, so 0236's lock order
   holds for its first statement as well. Its return value is unchanged.
9. **083's pinned list** of unguarded gate users gains `linked_student_notebook` (a read), in
   `supabase/verify/083_seat_freeze.sql`.

## Measured (local stack)

- **Locks,** two sessions on the real functions, a 3 s hold: finish first, then a replace: both
  succeeded; replace first, then a finish of the old take: the finish answered `false`. No deadlock;
  one take and one summary left. One run each way.
- **A deleted draft course with an own note.** In one transaction with the note's INSERT, `DELETE FROM
  courses` fails with 23503 on `notebook_entries_lesson_id_fkey`; with the note committed first it
  works and leaves NULL ids and both titles. So the verify script deletes the lesson first. The cause
  is an assumption (Postgres rechecks every key of a row inserted by the same transaction); only the
  two outcomes were observed.

## Hosted (2026-11-25)

Gate item 4 bans an UPDATE of existing rows without the owner's word per file. The card calls the
backfill insert-only, but the copy stamps `notebook_copied_at`, so the owner was asked and approved
the apply. Done, shown analyses before: 0; copied summaries after: 0. Nothing to copy, so this is
not evidence about the backfill; the local run (2 of 2) is.

## What would make us revisit this

- The sweep's WARNING repeats for more than one known row.
- A caller needs the note and the course deletion in one transaction.
- Anything in 0236 "What would make us revisit this".
