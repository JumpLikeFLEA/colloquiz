# 0116 — AUTH-011: the learners page

Status: **decided unattended** (AUTH-011 ran `--no-approval`). Open to
correction.

## Context

AUTH-011 gives the partner a roster at `/studio/learners` (0109 Decisions
8 and 12): who her learners are, where they came from, and what they have
done. What an author may see is `privacy-policy.md` section 5, "Course
authors": email or Telegram username; the invite's contact label; how the
learner found the course (course + channel); lessons opened and completed,
recordings sent and answered, last activity. No scores (0109 Decision 8).

Every input is owner-read only: `run_enrolments` (058), `lesson_opens`
(056), `lesson_attempts` (048), `signup_acquisitions` (053), and
`auth.users` for the email. The acceptance names the read path: one
SECURITY DEFINER RPC.

## Decision 1 — `learner_roster(course?, run?)`, migration 063

STABLE, SECURITY DEFINER, rows only where `can_edit_course(course,
auth.uid())`, EXECUTE to `authenticated` only (anon: `permission denied`,
measured). No table, no grant on a table, no access function touched, so
`delete_my_account` is not re-emitted. The filter parameters exist for
the inbox (AUTH-012); the page calls it unfiltered (Decision 5).

## Decision 2 — who is a learner of a course (*unattended*)

An account with `profiles.deleted_at IS NULL` and any of these in the
course: a run enrolment (revoked or not), a lesson open, a lesson attempt,
a voice submission, or a signup acquisition naming the course. The policy
says "a course you take while signed in, free or paid", so free-course
learners with no enrolment are in. A deleted account is out: its activity
rows are purged by `delete_my_account`, but its enrolments are not, and
an anonymised account is nobody to contact. (Measured: the seeded deleted
account with only an acquisition in B is not listed for B's editor.)

`course_entitlements` grants are not a membership source: a grant with no
activity is a comp or a test account, not a learner. Revisit if paid
self-serve sales arrive.

## Decision 3 — the acquisition is shown only for a course the caller edits (*unattended*)

`signup_acquisitions` has one row per account. The first draft showed it
on every row of the learner, so course A's editor saw that a learner had
signed up from course B (measured: `acquisition_course_title = Voice B`
in edA's rows). That is B's data, not A's, even when the learner also
touched A. Now it is shown when it names no course (signed up from `/`)
or a course the caller edits, and NULL otherwise. With one author the
two read the same.

## Decision 4 — row grain and the counts (*unattended*)

- One row per (course, learner, enrolment). A learner with no enrolment in
  the course gets one row with the run columns NULL; one enrolled in two
  runs of a course (re-enrolment, 0093 c) gets a row per run. A revoked
  enrolment stays, marked "Revoked": the policy covers it and the partner
  needs to see refunds. The page counts people, not rows.
- **Opened** = distinct lessons with an open, an attempt or a voice take.
  An attempt uploaded from before sign-in (ANON-001) or a take proves the
  lesson was opened when `lesson_opens` has no row; without this the page
  showed "opened 0 of 2 · 1 sent" for a learner who had recorded (measured
  on the seeded data, fixed in the same step).
- **Completed** = distinct lessons with an attempt ("completed = attempted",
  docs/handoff.md). A voice take does not count: voice tasks are outside
  completion (handoff.md, "Item types").
- **Recordings** are per enrolment (submissions are keyed by enrolment);
  answered = feedback published. A row without an enrolment shows "—".
- **Last activity** = the latest open, attempt or take in the course. A
  signup acquisition alone is not activity.
- Order: last activity newest first, none last, then email.

## Decision 5 — the page (*unattended*)

- Same shape as the review queue (0114 Decision 4): one unfiltered RPC call,
  narrowed in TS by `lib/learners/roster.ts` (`parseLearnerFilters`,
  `scopeRoster`, `rosterFilterOptions`, `countLearners`, tested); filters
  in the URL, allow-listed; changing the course clears the run.
- One card per row, not a table: a table of seven columns doesn't fit
  360px, and the reviews page's table needed its own scroller.
  Measured at 360px: `scrollWidth/innerWidth 360/360`.
- Learner label: the invite's name, else the email (`learnerLabel`, 0114).
- Channel names: Instagram, Telegram, "Direct link"; "not recorded" when
  there is no acquisition row (GPC/DNT opt-out, an account older than 053,
  or Decision 3).
- Nav: "Learners" under Reviews (`Users` icon).

## Decision 6 — Telegram username is out of scope

ANON-012 (#166) is open, so there is no Telegram identity to show.

## What would make us revisit this

- ANON-012 lands: add the Telegram username column.
- A roster outgrows one unfiltered read: push the filters into the call.
- A second author joins with courses the partner doesn't edit: Decision 3
  starts to differ from "show it always", and is the reason it exists.
- Paid self-serve grants appear: reconsider Decision 2's exclusion of
  activity-less grants.
