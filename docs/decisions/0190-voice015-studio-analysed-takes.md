# 0190 — VOICE-015: Studio shows analysed takes, and can hide one

Status: written 2026-10-22 (VOICE-015, #240). No migration. `VOICE_ANALYSIS_MODE` is still `off` in
production; with it off no analysis row survives a send (097 pauses it), so the new page is empty there.

## Context

0156 Decision 9: the author sees every analysed take on her courses with the audio, self-paced
ones included, and can hide a wrong analysis; self-paced takes never enter the waiting queue or the
inbox. 096 already holds the pieces: an editor read policy on `voice_analyses` (hidden rows too) and
`hide_voice_analysis` (can_edit_course, then `_studio_can_write` from 083, only a `done` analysis, and
it un-counts the send). This card is the pages.

## Decisions

1. **No migration.** The list needs a learner's contact label and, for a final, its baseline take id.
   A SECURITY DEFINER list function would have been a schema change (on the `--no-approval` stop
   list). Instead (the 0189 Decision 1 pattern): every row is read under the author's own session,
   and two service-role reads run only after that, on those rows' own ids, each returning one value:
   `learner_contact_label` (073; the service role can execute it, shown by the run below) and
   `baseline_submission_id` (ungranted). Revisit if a third such read appears: then a definer
   function is the cleaner shape.
2. **Scope is applied twice.** RLS lets a caller read their OWN takes through the owner policy, so an
   author who is also a learner on someone else's course would see that take in a list scoped by RLS
   alone. `listAnalysedTakes` therefore filters `course_id` to the caller's editable courses (all
   courses for an admin) explicitly, and the detail page checks `can_edit_course` on the take's
   course. Verified with the author's own take as the denial and another editor's read of it as the
   control (below).
3. **Detail reuses the learner's renderer.** `/studio/voice/[submissionId]` draws `AnalysisResult`
   (VOICE-014) read-only, with the task's full `listenFor` (an author is not the baseline the list is
   hidden from). A hidden analysis stays visible to the author, marked Withdrawn, with no Hide.
   Two foreign keys run from `voice_analyses` to `voice_submissions` (the take and the baseline), which
   made the PostgREST embed ambiguous; the list names the column (`voice_submissions!submission_id`).
   The first run found it (the page threw), not inspection.
4. **Hide** asks in an AlertDialog and says what happens, including that it cannot be undone. The
   route (`/api/studio/voice/hide`) is a thin call to `hide_voice_analysis`; `not_done` got a message.
   The button sits in `WriteArea`, so a lapsed seat sees it disabled; the RPC refuses regardless.
5. **The review card** shows the analysis in a collapsed `<details>` beside the written-feedback
   editor (`lg`) or under it. It only reads: `review_queue`, the inbox and the published-feedback lock
   are not touched. A cohort take whose daily cap stopped its analysis simply has none.
6. **Nav:** "AI feedback" (`Sparkles`, the learner's label) after Reviews.

## Evidence (local stack, `scripts/voice-studio-local-run.ts`, no AI provider called)

`check` against `next dev` (mode on): `VOICE-015 PASS: list, detail, hide and the queue boundary`, 38
cells, each denial beside its control:

- list: the editor sees the four self-paced takes and the cohort take; not their own take on a
  course they do not edit (the other editor, who edits it, sees it); `?course=` narrows to one row; a
  course the caller does not edit shows nothing; the learner gets 404; signed out gets no list.
- detail: audio is a signed Storage URL; a final shows "Day 1 feedback"; 404 for the editor's own
  take on a foreign course, for another course's editor, and for a malformed id; a lapsed seat reads
  the page with Hide disabled (`<fieldset disabled>`); a failed analysis offers no Hide.
- hide: signed out 401; the learner 403; another course's editor 403; a lapsed seat 403 with the
  seat message; none of those changed a row; a failed analysis 409 (`not_done`); the editor hides a
  finished one (200), counted analyses for the learner go 4 → 3, the ledger row reads
  `counted = false, uncounted_reason = hidden`, the learner's status route reads `withdrawn`, hiding
  again is `already_hidden`, and the list and detail read Withdrawn.
- queue: `review_queue()` holds the cohort take (control, also under `waiting`, which is what the
  inbox and its badge read) and none of the five self-paced takes; the Inbox badge in the screenshot
  read 1, the cohort take only. The review card has the analysis; only that one card does.
- Cleanup: 6 takes, 6 ledger rows, 3 seats and 3 courses before, 0 after.
- 360px (`npm run viewport360`, signed in as the editor): `scrollWidth/innerWidth` 360/360 on
  `/studio/voice`, a done final, a withdrawn take, a failed take, and `/studio/reviews?status=all`;
  with the Hide confirm open (dialog x 22, w 315) and the review card's analysis opened 360/360; at
  1280px 1280/1280 in the same two states. Not measured: the lapsed-seat banner on these pages, a
  list with the pager showing (25+ rows), dark mode.
- `npm run check` exit 0; `npm test` 154 files, 1,831 tests.

## Not here

- Export, erasure and the purge of analyses: VOICE-016.
- Un-hiding: not offered (096 has no function for it).

## Revisit when

- A list function in SQL is wanted (Decision 1), or an author needs to filter by status or learner.
- Real analyses make the card's half-width column too narrow.
