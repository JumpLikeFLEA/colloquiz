# 0119 — AUTH-013: the learner page

Status: **decided unattended** (AUTH-013 ran `--no-approval`), except
Decision 1's migration, which the owner approved on 2026-10-11 (#178).
Open to correction.

## Context

AUTH-013 gives the partner one page per learner at
`/studio/learners/[userId]`, opened from the roster (AUTH-011, 0116). It
covers the roster's columns per lesson, every recording with its feedback,
and before/after side by side (0109 Decisions 8 and 13). What an author may
see is `privacy-policy.md` section 5, "Course authors" (lines 188–195), and
"Voice recordings are heard by you and the course author" (line 197).

Per-lesson activity reads `lesson_opens` (056), `lesson_attempts` (048) and
`run_enrolments` (058), which are all owner-read only. `learner_roster()`
(063) returns totals only. `review_queue()` (062) leaves out revoked
enrolments, so it would hide some recordings.

## Decision 1 — two read RPCs, migration 064 (owner-approved)

`learner_lessons(user)` and `learner_recordings(user)` are STABLE and
SECURITY DEFINER. They return rows only for courses where
`can_edit_course(course, auth.uid())` is true, and EXECUTE goes to
`authenticated` only. There is no table and no table grant, and no access
function is touched, so `delete_my_account` is not re-emitted.
`learner_lessons` also requires the account to be a learner of the course
by 063's definition (0116 Decision 2), so it lists nobody else's lessons.
`learner_recordings` keys on the take itself.

Rejected: the service-role client with the editor check in TypeScript. That
would move the access decision out of SQL, which no Studio page does.

## Decision 2 — per-lesson columns (*unattended*)

- **Lessons listed:** every published, non-archived lesson of the course,
  plus any lesson the learner has activity in. An archived lesson they
  worked on still shows, marked "No longer published". The course's "N of
  M" counts listed lessons only, so it matches the roster.
- **Opened:** 063's rule (an open, an attempt or a take). "Last opened"
  comes from `lesson_opens` and reads "not recorded" when the lesson counts
  as opened only through an attempt or a take.
- **Completed:** the first attempt's time.
- **Recordings:** sent and answered per lesson.
- **Not shown:** no score and no attempt count. `earned`/`possible` never
  reach an output column. The policy lists opened and completed, not "how
  many times".

## Decision 3 — recordings are read-only here; feedback is written in Reviews (*unattended*)

The page shows each take with its player, its feedback (draft or
published, labelled) and a Waiting / Draft / Answered pill in the review
queue's tokens. Each run's card links to `/studio/reviews` filtered to
that course and run with status "all". Feedback has one editor. A second
copy of the editor on this page would need its own refresh path, and it
would split the partner's attention across two queues (0109 Decision 7).

## Decision 4 — before/after pairing (*unattended*)

The slot comes from the block in the version the take was recorded
against (`block->>'compare'`). That is the version the learner answered,
so a later re-publish can't move a take between slots. A run with any
compare take gets a "Before and after" pair, `sm:grid-cols-2`, stacked on
a phone. A missing side reads "Not sent yet." If a direct write ever left
two takes in one slot, the earliest lesson wins (0115 Decision 3) and the
other is listed with the weekly takes, so nothing is hidden
(`lib/learners/detail.ts`, tested).

## Decision 5 — revoked enrolments included (*unattended*)

A revoked enrolment's takes are listed, under a "Revoked" pill. The review
queue leaves them out because they need no work (0114 D3). This page is
the learner's record, and the roster already shows revoked enrolments
(0116 D4).

## Decision 6 — 404 when nothing is visible (*unattended*)

A malformed id, or an id for which all three RPCs return nothing, gets
Studio's 404. That is the same page an unknown id gets, so an editor of
another course can't tell whether the account exists. The final comment
(061) is not on this page. It is not a recording; it stays in Reviews and
on the learner's before/after screen.

## What would make us revisit this

- Scores become visible to authors (needs a legal revision first, 0109 D8).
- The partner wants to answer from this page: move the editor here and
  drop the link.
- ANON-012 lands: the header gains the Telegram username, as the roster does.
