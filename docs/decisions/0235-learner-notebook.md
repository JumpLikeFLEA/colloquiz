# 0235 — The learner notebook

Status: decided by the owner in a chat session on 2026-11-24, with rulings the
same day on a Phase 1 audit and a Phase 2 review of the cards. Nothing is built.
The work is M4 cards PROG-011..020 and OPS-043 (`scripts/board/backlog.mjs`),
scoped from `prompts/notebook-backlog.md` (commit `9ca6280`). Where this file and
that prompt differ, this file wins.

## Context

AI feedback on a voice take (0156) is drawn in the lesson and listed on `/my`
(0191). It goes with the audio after 6 months (0195), and nothing collects what
the learner said, what was corrected, or what they want to remember. The bar
every card is judged against: a signed-in learner has one place, `/my/notebook`,
that shows what they can say and what they have saved: phrases said out loud,
fixes, phrases to try, their own notes, the latest AI summary and a short record
of their study. The text outlives the 6-month audio purge. A linked teacher
reads the part that comes from lessons they can already read.

## Settled inputs (owner, 2026-11-24)

1. **Name and place.** "Notebook" / «Блокнот» at `/my/notebook`, signed-in only,
   guarded exactly like `/my`.
2. **What it shows.**
   - Summary: the newest recording's AI summary and its next step (or the goal,
     for a first take), copied from the analysis. A take with neither has its own
     state (0156 Decision 10). No new AI call of any kind.
   - Record: four numbers, see "The record numbers".
   - Phrases: expressions the learner said out loud, with their own quote
     (`exact: false` is shown as "close"), plus own notes, in one list.
   - Fixes: the main error of each recording as "You said / Better".
   - To try: see "To try". Derived on read, never stored.
   - Recordings: each with its "kept until" date; after the purge, "audio
     deleted, notes kept". Download only, plus "Listen in the lesson".
3. **Layout: compact.** One list under three tabs (Phrases, Fixes, To try),
   filtered by course chips (All courses plus one per course with entries). Not
   grouped by course. The four numbers in one row under the summary card.
   Recordings fold into one row. "Download notebook" is an icon in the top bar.
   Said phrases and own notes share the Phrases tab and are told apart by an icon
   (microphone / pencil).
4. **Retention: keep the text, delete the audio.** The notebook keeps its own
   copies: the phrase, the learner's quote, the fix (said / better), each
   recording's summary and next step or goal, the date, the course and lesson.
   They stay until the learner deletes them or the account, with the exceptions
   under "When copies go".
5. **Visibility.** See "The teacher's view". A course author who is not the
   linked teacher does not see the notebook.
6. **Own notes.** A phrase with an optional note, from any lesson (text-only
   courses included) and from the notebook page. The source course and lesson are
   recorded automatically. How a learner saves from inside a lesson is PROG-017,
   a decision card.
7. **Signed-out learners.** A phrase saved while signed out is kept in browser
   storage and moves to the account at sign-in. PROG-017 compares that with hiding
   save for signed-out visitors, with the cost of both; PROG-018 is dropped if the
   owner picks hiding. PROG-018 ranks last.
8. **Empty state.** An invitation to study and one button, "Choose a course", to
   `/#catalogue`. No starter-lesson logic.
9. **Downloads.** Each recording, by its owner only, and the whole notebook as one
   text file.
10. **Out of scope.** Stickers and achievements, streaks and weekly goals,
    reminders, any new AI call, spaced repetition, a teacher writing into a
    student's notebook.
11. The chat project's sessions never write to the repo; implementation arrives as
    prompts for Claude Code.

## Rulings on the audit (owner, 2026-11-24)

### This overrides 0156 Decision 7, for the copies only

0156 Decision 7 lists "Rejected: keeping the analysis after the audio is purged".
Input 4 overrides that **deliberately, for the notebook's copies only**. The
analysis row itself (transcript and full result) is still purged with the audio,
by `voice_mark_removed` (098), unchanged (0195 Decision 2).

### When copies go

- **Replacing a take removes the entries copied from it** (this reverses the
  prompt's assumed decision D).
- **Hiding an analysis removes the entries copied from it** (assumed C). There is
  no unhide today (no function clears `hidden_at`; checked in Phase 1).
- **Only the retention purge leaves copies behind.** After the purge the analysis
  row is gone, so an author can no longer hide anything, and **only the learner
  can remove the entries**.
- The learner can delete entries (assumed E); copied text is never edited.
- Account deletion deletes the rows by an explicit `DELETE`: the `profiles` row
  survives erasure, so `ON DELETE CASCADE` from it never fires (109's own comment).

`submit_voice_recording` (096) deletes the replaced `voice_submissions` row and
the purge keeps that row (098), so a copied row that references
`voice_submissions` `ON DELETE CASCADE` gets both rules from one key. It must not
reference `voice_analyses`, which the purge deletes.

`voice_analysis_finish` (096:293) is the only writer of `status = 'done'` (Phase 1
listed every statement in `supabase/migrations` that writes `voice_analyses`).

### The record numbers

Lessons completed (from the learner's completion rows, not limited to published
lessons), recordings sent (tasks recorded: one `voice_submissions` row per slot,
not sends), phrases said out loud, notes saved. "Courses finished" and "days with
English" are dropped from v1, and assumed decision F is withdrawn.

They **do not fall with time**. What can lower them:

- the learner replacing a take, including a capped cohort send, which gets no
  analysis (0185, "Surprises"), so its phrases go and nothing replaces them;
- an author hiding an analysis;
- an exercise added to a lesson that had none: a lesson with no exercises is
  complete through `by_open`, which needs the current version to have none
  (075:138-140);
- the learner deleting entries.

Why the two were dropped: "courses finished" falls when a lesson is added, because
`isCourseComplete` needs every listed lesson (`lib/courseCompletion.ts`). "Days with
English" falls when a replaced take takes its `submitted_at` with it, and attempts
made while signed out are dated when they upload (074 sets no `created_at`).

### To try

Listen-for phrases (0186) of the voice tasks in courses the learner has started,
minus the ones already said. 0156 Decision 8 hides a `before` task's list so the
baseline is honest, and 0186 Decision 4 copies that list into the `after` task, so
leaving `before` tasks out of the list is not enough.

- In a course with a `before` voice task, To try shows nothing until the learner's
  `before` take exists.
- Lists are read under the learner's own session, never the service role.
- A session read cannot see a `before` task in a lesson the learner cannot open.
  PROG-011 therefore evaluates a SECURITY DEFINER function, callable by
  authenticated users, that returns only a boolean: "this course's published
  lessons contain a `before` voice task" (no list, no lesson ids, no content).
  True: nothing until the take exists. False: phrases from lessons readable under
  the session only.
- If PROG-011 finds the boolean itself leaks something, the fallback is fail-closed:
  show a course's list only if its `before` task is readable and taken, or if every
  published lesson is readable and none has one. That was not the first choice: a
  learner on a paid course's free sample would never see To try.

### The teacher's view

- A linked teacher sees entries from lessons in `_teacher_readable_lessons`
  (080:530) only, per lesson: courses they edit, and lessons or courses they
  assigned this student. For a single assigned lesson, that lesson only. 078's
  narrower rule was superseded by 080; Phase 1 cited 078 by mistake.
- **Own notes stay private to the learner**, whatever their source lesson.
- The link statement (`lib/teacherLinks.ts`) gains one EN/RU bullet for notebook
  entries from lessons the teacher can read. The same edit adds the missing bullet
  for written answers, which privacy policy 1.12 section 5 lists and the statement
  does not. Statement and policy change together (the comment above `linkStatement`
  says so): the bullets land in PROG-020, the policy text in OPS-043.
- The statement's "anything else in your account" stays true because own notes are
  excluded.
- The sentence the prompt calls "the 0170 rule" ("A teacher sees your answers and
  scores while you are linked") is not in 0170; it is UI copy,
  `app/(english)/my/myCopy.ts:167`.

### Playback and downloads

No `SignedAudio` on `/my/notebook`; 0120 Decision 3 stands. A recording downloads
through a route handler that checks the take's owner before it signs a URL with a
download filename: the storage policy also lets an editor of the course sign (060).

### Handoff

`Fixes` is a record, not practice: no drills, resurfacing or scheduling come with
it, so "Spaced repetition and mistake-based review" stays out of scope
(`docs/handoff.md`, "Deliberately out of scope for v1").

### Other rulings

- The backfill runs once inside the migration, before any deletion UI exists; no
  tombstones. The gate re-applies the file, so it is guarded (PROG-012).
- With `VOICE_ANALYSIS_MODE` off the notebook still shows existing copies.
- Copy recovery is PROG-011's. The owner's lean: `voice_analysis_sweep` re-runs the
  copy, idempotently, for done, non-hidden analyses that have no copied summary.
  PROG-011 must square it with learner deletions, because there are no tombstones.
- `/my`'s AI feedback list is laid out by PROG-011 as an option for the owner. The
  lean: the notebook's recording rows link to each lesson's full feedback, so the
  list can go and `/my` keeps only the notebook link.
- No card raises a budget; that is the owner's decision.
- M4 stays the milestone; ranks 3390-3490. The cards keep M4 active ahead of M5 and
  M6, MIG-001 included; the owner accepted that.
- Production has only test accounts (owner, 2026-11-24), so 0095 needs no notice.

## Amended by 0236 (owner, 2026-11-25)

- **To try, "returns only a boolean".** The function takes no course id. It returns, for the caller's own
  started courses only, `(course_id, has_before, before_taken)`. `before_taken` is the caller's own data.
  `has_before` is TRUE for a started course that is no longer published or entitled to the caller
  (fail-closed). The started set (an open, an attempt or a take) cannot be forged: 056, 074 and 096 check that
  the lesson is readable before writing, and no client role can insert into those tables (0236 section 6).
  The fail-closed fallback is not needed.
- **The teacher's view** includes AI summaries. A final or interim one is returned only when the teacher can
  also read its baseline's lesson, stored at copy time; with none stored, never. The link statement and privacy
  section 5 name AI summaries.
- **Copy recovery** goes by a `notebook_copied_at` marker, not by a missing summary.
- **`/my`'s AI feedback list** is dropped once the notebook is live (PROG-015).

## Assumed decisions, as they now stand

Marked as assumed by the prompt; the owner overrode some.

| | Assumption | Now |
|---|---|---|
| A | Milestone M4, epic PROG (OPS-043 in OPS); M5 is active | Kept, except that M4 is active, not M5 (`next-card.mjs`, 2026-11-24) |
| B | Copy at completion, same transaction, idempotent, one backfill | Kept; where the copy runs is PROG-011's |
| C | Hiding removes; an unhide copies again | Removal kept; there is no unhide |
| D | Replacing keeps | **Reversed** |
| E | The learner deletes, never edits, copied text | Kept |
| F | A day with English | **Withdrawn** |
| G | To try compares trimmed, case-insensitively | Kept; PROG-013's tests fix it |
| H | PROG-012's hosted apply only after OPS-043 is published | Kept, enforced by a dependency |

## Facts, re-checked against the tree at `9ca6280`

- **12. Analysis shape.** `lib/voice/analysis/schema.ts` holds the model's raw shape;
  what is stored is the camelCase `StoredAnalysis` (`expressionsUsed`, `mainError`,
  `goal`, `nextStep`), read through `parseStored.ts`.
- **13. Purge.** `voice_purge_due` (094): cohort `ends_at + 6 months`, self-paced
  `submitted_at + 6 months`. `voice_mark_removed` (098:80) deletes the analysis.
- **14. Lifecycle.** `submit_voice_recording` (096:366), `voice_analysis_claim`,
  `_advance`, `_pause`, `_sweep` (097), `voice_analysis_finish` (096:293), `_fail`
  (096:336), `hide_voice_analysis` (096:235), `voice_mark_removed` (098:80),
  `delete_my_account` (109:584).
- **15. Listen-for lists.** At most 24 (`lib/lessons/taskBlocks.ts`). In the local
  `authored/courses` files, not hosted: 12 files, 11 courses, have a list. Future
  Imperfect has no voice task; Present Perfect has three and no list.
- **16.** `LEARNER_ANALYSIS_LIMIT` is 12 (`lib/voice/analysis/learnerList.ts`), and the
  list is empty with the mode off (`learnerRead.ts`).
- **17.** `_teacher_linked` (076:152) is revoked from client roles.
- **18.** `my_voice_analyses_export` (098:44); export format version 17
  (`lib/accountExport.ts`).
- **19.** Playback is signed under the caller's session (`lib/voice/storage.ts`).
- **20.** `TZ_COOKIE` (`lib/calendar/calendar.ts`). No longer used by this feature.
- **21.** Privacy policy 1.12: lines 124, 214, 254, 283-285 and 361-362.
- **22.** At write time: latest decision 0234, latest migration 111, highest keys
  PROG-010 and OPS-042, highest rank 4240.

Anonymous attempts move at sign-in by `uploadPendingAttempts` (same browser, inside
`LessonPlayer` only) or `pending_claims` (049, cross-browser). The second holds an
array of attempts of at most 16,384 bytes and is skipped when there are none, so it
cannot carry notes as it is.

**Budget, 2026-11-24** (`scripts/budget.ts --url`, local stack, one `next start` over
the 21 November 12:12 build, voice mode on): `/my` 175.2 KB of 180 and of 182,
`/courses/future-imperfect/true-or-false` 259.9 KB of 260. Not a fresh build: the
non-test `app/` and `lib/` changes between the last commit before that build and
`9ca6280` are in Studio and authoring files, none of them in `/my`. The same lesson
printed 261.0 KB in the run OPS-042's notes record. The environment is named beside
every figure.

## What would make us revisit this

- PROG-011 finds the boolean leaks, or that no copy recovery is compatible with
  learner deletions.
- Real accounts exist before OPS-043 is published: 0095's notice is then owed, and
  the in-app banner does not exist (0184).
- An author needs to withdraw copied text after the purge, or after a learner has
  replaced the take it came from.
- Teachers ask to see own notes, or learners ask to share one.
- Learners read a number that fell as a loss ("Nothing demotivates the learner").
- M6 starts (0226) while the notebook is half built: its tables join the move.
