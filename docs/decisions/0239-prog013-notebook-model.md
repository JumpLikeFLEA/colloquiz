# 0239 — PROG-013: the notebook's pure model

Status: built 2026-11-25 (#330), `lib/notebook/`. It implements 0235 and 0236 sections 1, 4 and 6. No
migration, no UI. Below is what the card left open and was decided unattended.

## Decisions

1. **Merge by the stored `phrase_key`, compare To try by a TypeScript mirror.** Deleting a merged phrase
   deletes by the stored key (112), so merging by it means a row on screen is exactly what one delete removes.
   Listed phrases have no stored key, so both sides of the To try comparison go through `phraseKey`.
   The 12 inputs in `phraseKey.test.ts` were run through 112's expression on the local stack: 12 of 12 equal.
   Characters whose lower case differs between JavaScript and Postgres were not searched for.
2. **Filter scope.** The tab and the course chip filter the list and its per-tab counts only. The summary
   card, the record and the recordings are the whole notebook.
3. **Chips.** A course gets a chip when it has a stored entry or a To try row. 0235 says "entries"; without
   this a started course with nothing said yet could not be filtered to. Order: stored entries' courses newest
   first, then To try's. A row with no course is under All courses only.
4. **"The whole notebook is empty"** means no entry, no summary, no recording and no To try row. Completed
   lessons alone do not count: the record can show them above the invitation.
5. **Three empty states:** `notebook`, `course` (the tab has rows, not in this course), `tab` (none in any
   course, filter or not). To try hidden by the before gate reads as `tab`, with no reason given.
6. **To try also hides on a `before` task the session itself can see** while the gate says there is none, the
   case of a publish between the two reads. It only shows less. Archived lessons neither list nor hide, as in 112.
7. **A cohort take whose run cannot be read has no kept-until date.** Falling back to `submitted_at` would
   name a date that is too early.
8. **"Audio deleted, notes kept"** is two facts: `audio.state` and `hasNotes` (any entry or summary copied from
   that take is left). A capped, hidden or cleared take has none, and the page must not say "kept" then.
9. **A summary with no text and no follow-up draws nothing,** and the next newest is used. 112 can store an
   empty summary from a malformed result (`COALESCE(…, '')`). A blank goal or next step reads as absent.
10. **`my_notebook()` in any shape but the two lists is null,** a failed read, never an empty notebook. One bad
    row is dropped and reported.
11. **`?course=` is a course id,** not a slug: a course that is no longer readable still has a chip and no slug.

## Evidence

`keptUntil`'s month arithmetic against the local Postgres (timezone UTC): 4 of 4 dates equal, two of them cut to
the end of February. The hosted session timezone was not read; UTC there is an assumption.

A local learner's real `my_notebook()` and `notebook_try_gate()` output through the modules: 3 entries and 2
summaries read, 0 dropped, every stored `phrase_key` equal to `phraseKey(phrase)`. Five mutations (the gate, the
per-course match, the cohort date, the per-course merge, the follow-up choice) each failed a test.

## For PROG-014

- **Lessons completed** comes from `get_course_attempt_summary` (075), which takes a course id and filters
  neither on published nor archived. `notebook_try_gate()` returns every started course, so its ids cover
  unpublished ones too; reading only published courses, as `/my` does, would lower the number.
- `takes` needs `user_id = me` (an editor's policies return other learners' takes) and the run's `ends_at`.
- A take's audio can be past its date and not yet purged (the purge is a daily cron): `until` is then in the past.

## What would make us revisit this

- The teacher's JSON (112, PROG-020) has no `submission_id`, so `parseNotebook` refuses it by design; PROG-020
  needs its own reader.
- A learner reports a phrase they said still in To try.
