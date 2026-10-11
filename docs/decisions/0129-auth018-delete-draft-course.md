# 0129 — AUTH-018: deleting a draft course

Status: decided unattended while working AUTH-018 (`--no-approval`), inside
0125 Decision 8. 0125 sets the rule: a draft that no learner data
references can be deleted by any editor of the course. This file records
what the card left open.

## Decision 1: which referencing tables block, and which are the course itself

The card says a row in "any table that references the course, its lessons,
versions or runs" blocks. Read literally, that includes `lessons` itself and
the creator's own `course_editors` row (067). No course would ever be
deletable. So the referencing tables are split:

- **The course's own authoring structure, deleted with it:** `lessons`,
  `lesson_versions`, `lessons.published_version_id`, `course_editors`,
  `course_runs` and `run_calls`. None of them holds a learner's row. An
  upcoming run with calls and no enrolment or invite has reached nobody.
  `delete_run` (058) already deletes such a run.
- **Blockers:** `course_entitlements`, `run_enrolments`, `run_invites`,
  `voice_submissions`, `run_final_comments`, `lesson_attempts`,
  `lesson_opens` and `signup_acquisitions` (053's `SET NULL`). Any row
  blocks, revoked or not.

The list comes from `rg` over the migrations, and `pg_constraint` on the
local stack returned the same 21 constraints. Both are in #186's evidence
and in 068's header. `voice_feedback` references `voice_submissions`, not
the course, and its parent row is already a blocker.

- Rejected: making `run_calls` a blocker as well. The author would have to
  delete each call before deleting a test cohort course, and no learner
  could have seen a call without an enrolment, which blocks anyway.

## Decision 2: an unexpired pending claim blocks too

`pending_claims` (049) has no FK. Its JSON payload holds an anonymous
learner's attempts, keyed by `lesson_version_id`, waiting for their sign-up
to claim them. While the claim is unexpired, it is learner data about this
course, so it blocks (`pending_claims`). An expired claim does not; the
protocol tests both. This is the one blocker that `delete_course`'s row
locks do not cover (Decision 3). A claim created in the milliseconds
between the re-check and the delete would fail to save its attempts for
that course's versions. It cannot take any other data with it.

## Decision 3: how "locks the course row" closes the race

`FOR UPDATE` on the course row alone does not stop a learner inserting a
`lesson_opens` row, because that FK points at `lessons`, not `courses`. So
`delete_course` also takes `FOR UPDATE` on the course's lessons, versions
and runs before it re-checks. Every insert that would create a blocker row
takes `FOR KEY SHARE` on the row its FK names, and `FOR KEY SHARE`
conflicts with `FOR UPDATE`. The insert waits, then fails its FK check once
the row is gone.

This was checked on the local stack with two sessions. With a lesson row
held `FOR UPDATE`, a `lesson_opens` insert timed out on `FOR KEY SHARE OF
x` in relation `lessons`. With no lock held, the same insert succeeded.

## Decision 4: runs are deleted before the course

`lessons_recompute_run_ends` (058) is an `AFTER DELETE` trigger on
`lessons` that updates the course's upcoming runs. `delete_course` deletes
the runs first, so the cascade's lesson deletes find no run to update. The
alternative was to rely on the order in which the cascade's RI triggers
fire. The protocol's test courses each have an upcoming run with a call,
and the clean delete succeeds.

## Decision 5: blocker codes, copy and the confirm title

- `course_delete_blockers` returns `{ ok, blockers[] }` in a fixed order,
  with `published` first because the author can fix it. The editor shows
  one muted line naming the first blocker (`lib/courseDelete.ts`).
- The confirm title is compared after trimming and is case-sensitive, in
  SQL and in the dialog.
- A refusal from the route is a 409 carrying the same sentence and the
  codes.

## Decision 6: the image purge is best-effort, after the RPC

As in the account-delete precedent, SQL runs first and the objects are
removed second, with the service-role client.

- `courseImageObjectPaths` throws unless the course id is a bare UUID. It
  returns only `<courseId>/<file>` paths and skips any name containing a
  slash or a dot segment. Tested in `courseDelete.test.ts`.
- If the list or remove fails, the error is logged and the route still
  returns ok, because the course is already gone. The objects are left as
  orphans, which `scripts/sweep-lesson-images.ts` reports.
- No voice recordings exist to purge: a recording is a blocker.

## Decision 7: the page hides the section if the blocker call fails

If `course_delete_blockers` errors (for example, before 068 is applied),
the editor page renders without the section instead of failing.

## What would make us revisit this

- A new table with an FK into `courses`, `lessons`, `lesson_versions` or
  `course_runs`: add it to `course_delete_blockers` or to 068's
  own-structure list, and re-run `supabase/verify/068_delete_course.sql`.
  Nothing enforces this automatically.
- A run's calls turning out to reach someone without an enrolment (Decision
  1).
- Orphaned images from failed purges showing up in the sweep's report
  (Decision 6).
