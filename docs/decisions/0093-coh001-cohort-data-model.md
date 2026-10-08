# 0093 — COH-001: cohort data model, grant ownership and the unlock rule

Status: owner's answers 1–5 recorded 2026-10-08 and the file reviewed and
amended by the owner the same day; lines marked **Proposed** were mine and
were accepted in that review except where amended inline. Nothing here is built
or migrated. COH-002 builds it.

## Context

Runs repeat (partner, 2026-10-07, docs/handoff.md "Open questions"), so one
learner can sit in several runs of one course. `course_entitlements` has one
row per `(user_id, course_id)` (041:174) and its only reader is
`has_course_entitlement` (044:108-119), which both `can_read_lesson` (044:139)
and the "lessons: published read" policy call. The 0018 Decision 6 / 0025
Decision 4 promises still hold: purchasers keep access, and entitlement is
decided in one place.

## Decisions (owner)

1. **Enrolment lives in `run_enrolments` (option b).** With (a), joining run 2
   overwrites the `(user_id, course_id)` row, so run 1's submissions, final
   screen and roster entry lose the row they hang off. With (b) each hangs off
   its own enrolment id.
2. **Grant ownership: (c).** Cohort access derives from enrolments. A claim
   writes ONE `run_enrolments` row; a revoke sets that row's `revoked_at`;
   `course_entitlements` stays for comps and future self-serve sales.
   Compared: (i) a shared grant row needs refcounting across enrolments; (ii)
   a row per enrolment needs a new key on `course_entitlements`; (c) writes one
   row per claim, a revoke touches exactly that row, and a learner in a second
   run keeps that run's access untouched.
3. **Revocation is `revoked_at TIMESTAMPTZ NULL`** on enrolments (additive,
   0018 Decision 6; 0025 line 315). Rows are never deleted, so roster history
   survives.
4. **Unlock rule:** week N opens at `starts_at + 7*(N-1)` days; a late joiner
   sees every past week at once; a lesson is open if it is open in ANY of the
   learner's non-revoked runs; after the run everything stays open.
5. **No re-lock, scoped to runs in progress.** A run's `starts_at` is
   editable until that run starts and frozen after. Between runs, weeks are
   freely editable. Enforced in the editing RPCs.
   *Revised 2026-10-08 (owner, review of this file):* the first answer froze
   `lessons.week` outright while a run is in progress. Narrowed: only an
   INCREASE of `lessons.week` on a lesson that has a `published_version_id` is
   denied, while some run of the course is in progress. Re-locking needs a
   published lesson moved to a later week; drafts (never published) and
   decreases (which only unlock) are always allowed. Reason: the partner drafts
   next weeks' lessons during a run, and monthly runs leave almost no gap.

## Decisions (settled here, at the owner's request)

### a. When a run ends: an explicit `ends_at` column (not derived)

The derived form (`starts_at + 7 × highest week`) is stable during a run
because of 5, but not after it. Between runs weeks are editable (5), so
raising or lowering the course's highest week moves every PAST run's end. Case:
a run ended at day 28 (highest week 4); the partner adds a week-6 lesson; the
derived end becomes day 42; a run that finished two weeks ago is "in progress"
again, the week arithmetic applies to its learners again, and 5's freeze
switches on retroactively. That is the ordinal-derived-free-sample failure
mode (docs/handoff.md) in cohort form. A stored `ends_at` is a fact about the
run and cannot be moved by later edits to lessons.

- `create_run` sets `ends_at = starts_at + 7 days × max(week)` over the
  lessons the schedule applies to: entitlement-level lessons with a week
  (error if there are none). Publish state and archiving are NOT part of the
  population, because the schedule itself ignores them (an archived lesson is
  still readable by an entitled learner, 044:155-158). Drafts therefore count:
  a draft week-6 lesson lengthens an unstarted run now, so the run does not
  end before that lesson is published, and the recompute needs no hook on
  publish or archive.
- While the run has not started, a trigger on `lessons` (week, access level)
  and `update_run` recompute `ends_at` the same way, so it is right at the
  moment the run starts. After start, `ends_at` is frozen, except that it may
  be moved EARLIER (an early close: only ever unlocks, never re-locks).
  Extending a started run is denied.
- **In progress** = `starts_at <= now() AND now() < ends_at`. Used by 5.
- **After a run's end, the schedule check returns `open` for every lesson
  outright (`now() >= ends_at`), not via the week arithmetic.**
- Cost: a stale `ends_at` on an unstarted run would open content early. The
  trigger (not only the RPCs) does the recompute so no write path, the service
  role included, can skip it. COH-002 prints a seeded before/after.

### b. A `course_entitlements` grant on a cohort course ignores the schedule

It has no run, so it opens every lesson at once (comps, the partner's test
accounts, the OPS-020 dry run). The schedule applies only to access derived
from an enrolment.

### c. Re-enrolling a revoked learner in the same run

A partial unique index, not a plain UNIQUE:
`UNIQUE (run_id, user_id) WHERE revoked_at IS NULL`. The revoked row stays as
history and a new row is added. A plain UNIQUE would force clearing
`revoked_at`, erasing the fact that the revocation happened (and any
submissions hanging off the first enrolment id).

## Remaining acceptance lines — Proposed

- **Run lifecycle.** A run is upcoming (`now() < starts_at`), in progress, or
  ended (`now() >= ends_at`); there is no separate "closed" flag. Closing early
  = `ends_at` moved earlier (a). An ended run still shows: all lessons open,
  the roster, submissions and feedback, the before/after screen, and the call
  list read-only (past calls without a Join link). New claims into an ended run
  are rejected; into an upcoming or in-progress run (late joiner) they are
  accepted.
- **`courses.format`** `self_paced | cohort`, default `self_paced`; immutable
  once the course has a run. **`lessons.week`** `SMALLINT NULL CHECK (week >=
  1)`. A week is required at publish for a lesson that is at the entitlement
  level (CNT-011's term, still to be named there); open and sign-in lessons
  ignore the schedule and may have none. So **a cohort course may have open or
  sign-in lessons (a taster)**; the schedule applies only to entitlement-level
  lessons. If CNT-011 lands differently, this line follows it.
- **Freeze (owner-revised 5).** While a run of the course is in progress, an
  INCREASE of `lessons.week` on a lesson with a `published_version_id` is
  denied. Allowed always: any change to a never-published lesson, any decrease,
  creating a lesson with a week (nobody could open it before), and any edit
  when no run is in progress. Enforced in `update_lesson` and `update_run`
  with friendly errors, plus a BEFORE UPDATE trigger on `lessons.week` and
  `course_runs` (accepted by the owner) as a backstop so a direct write cannot
  bypass it. Tables carry no write grants for app roles.
- **Calls.** `run_calls(id, run_id, starts_at TIMESTAMPTZ, meet_url, title
  NULL)`. No grants; read only through a SECURITY DEFINER function that returns
  rows to editors of the course and to non-revoked `extended` enrolees of that
  run. A basic learner and a non-enrolled visitor get zero rows and no hint
  that calls exist. Stored in UTC; displayed in the viewer's local time with
  the zone named (Intl, `timeZoneName: "short"`).
- **Non-enrolled visitor on a cohort course page.** Same as any paid course:
  title, description, lesson list with item counts and the "Week N" label
  (preview, docs/handoff.md), the next run's start date and the tiers. No
  calls, no Meet URL. Optional `courses.how_to_join_url TEXT NULL`, https only,
  rendered as a plain link, no provider JS.
- **Invite contact labels are personal data.** A label the partner types per
  invite (a name or handle) identifies a person. Once claimed it is linked to
  the learner's account, so it joins the export (`lib/accountExport.ts`) and is
  nulled by account deletion (docs/adr/0002 anonymisation). Feeds OPS-019 /
  COH-003 text. The invites table itself is COH-003's.
  - **Enrolments.** The learner's `run_enrolments` rows are included in the
    export, and `delete_my_account` deletes them explicitly: ADR 0002
    anonymises the profile and never deletes it, so the `ON DELETE CASCADE`
    on `user_id` never fires. What hangs off an enrolment (voice submissions,
    recordings) is VOICE-004's.
  - **Carried to COH-003 and OPS-019:** an unclaimed invite's contact label
    belongs to someone who is not a user yet. Unclaimed invites are purged or
    deleted after expiry; COH-003 sets the period, OPS-019 words the notice.
- **Tier change** (basic → extended) updates `tier` in place; no tier history
  is kept. Flagged, not decided further.
- **`course_entitlements.revoked_at`** added in the same migration (additive,
  anticipated by 0018 D6 / 0025), so "revoked_at IS NULL" is the one rule
  everywhere. Strike if you would rather revoke grants by service-role delete
  as today.
- **State function.** Not this card's: CNT-012 defines the lesson-state
  function, in its single-lesson form and the per-course set-returning form
  (amendment 1); state names are CNT-011's and are not fixed here. COH-002
  extends both with the schedule branch, the `opens_at` state (carrying the
  timestamp), computed by `_lesson_access_at(lesson, user, now)`, which has NO
  grants, so tests can pass a user and a clock while a client cannot pass a
  future clock. The UI never computes any of it.

## Hazard the schema must not walk into

`can_read_lesson`'s entitled branch calls `has_course_entitlement(course)`
(044:157). Once that function is true for an enrolment, an enrolled learner
would read a week-4 lesson in week 1. So `has_course_entitlement` keeps its
meaning, "some course-level access exists" (grant, or non-revoked enrolment),
and is used ONLY for metadata visibility (title, description, item count,
archived/unpublished bypass). `can_read_lesson` and the `lesson_versions`
read policy switch to the schedule-aware `_lesson_access_at`. The matrix has a
cell that fails if they are not switched.

## Schema sketch (not a migration; COH-002 numbers it)

```sql
ALTER TABLE courses ADD COLUMN format TEXT NOT NULL DEFAULT 'self_paced'
  CHECK (format IN ('self_paced','cohort'));
ALTER TABLE courses ADD COLUMN how_to_join_url TEXT NULL
  CHECK (how_to_join_url IS NULL OR how_to_join_url ~ '^https://');
ALTER TABLE lessons ADD COLUMN week SMALLINT NULL CHECK (week >= 1);
ALTER TABLE course_entitlements ADD COLUMN revoked_at TIMESTAMPTZ NULL;

CREATE TABLE course_runs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id  UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title      TEXT,
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE run_enrolments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      UUID NOT NULL REFERENCES course_runs(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id)    ON DELETE CASCADE,
  tier        TEXT NOT NULL CHECK (tier IN ('basic','extended')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ NULL,
  source_ref  TEXT NULL            -- the invite, once COH-003 defines it
);
CREATE UNIQUE INDEX run_enrolments_one_active
  ON run_enrolments (run_id, user_id) WHERE revoked_at IS NULL;

CREATE TABLE run_calls (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id    UUID NOT NULL REFERENCES course_runs(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  meet_url  TEXT NOT NULL CHECK (meet_url ~ '^https://'),
  title     TEXT NULL
);
-- RLS on all three new tables, REVOKE ALL from anon/authenticated, no policies
-- except what a SECURITY DEFINER reader needs; writes only through RPCs.
```

Access, in words, for an entitlement-level lesson L of course C and caller U:

1. editor of C → open.
2. active `course_entitlements` row (U, C) → open, schedule ignored (b).
3. for each non-revoked enrolment of U in a run R of C: open if
   `now() >= R.ends_at`, else if `now() >= R.starts_at + 7*(L.week-1) days`.
   Open in any run → open.
4. otherwise `opens_at(min over U's non-ended runs of that start)` if U has any
   such run, else `not_entitled`.

## Protocol matrix COH-002 must print

Every denial row is paired with a positive control (CLAUDE.md: a check that
passes on an empty result is a failure). Each cell is run for
`can_read_lesson`, the `lesson_versions` read, and `lesson_access`, as the
named caller; times are seeded relative to `now()` and passed through
`_lesson_access_at`.

| # | Setup | Expect |
|---|---|---|
| 1 | active enrolment, week-1 lesson, run started | open (positive control) |
| 2 | same learner, week-2 lesson, day 3 of the run | not readable; `opens_at` = start + 7d; lesson metadata still visible |
| 3 | enrolled in an upcoming run, week-1 lesson | not readable; `opens_at` = `starts_at` |
| 4 | late joiner, day 20, weeks 1–3 | all open at once; week 4 opens at start + 21d |
| 5 | run ended | every lesson open, including one whose week arithmetic would still say locked |
| 6 | revoked enrolment, nothing else | not readable, `not_entitled`; control: same learner before revocation was open |
| 7 | revoked enrolment + a new active one, same run | open per schedule; one revoked and one active row exist; a second active insert is rejected by the partial index |
| 8 | two runs of one course, one revoked, one active | access follows the active run only |
| 9 | two runs both active, lesson open in run 2 but not run 1 | open |
| 10 | comp grant (`course_entitlements`) on a cohort course, before week 2 opens | week-2 lesson open; revoked grant → closed |
| 11 | learner of a finished run; the lesson's week is later moved to a later week (run not in progress, so allowed) | still open (no re-lock) |
| 12a | run in progress; week of a PUBLISHED lesson increased | denied; control: the same increase with no run in progress lands (and `ends_at` of an UNSTARTED run is recomputed, a started run's is not) |
| 12b | run in progress; week of a PUBLISHED lesson decreased | allowed; control: the learner who could open it before still can |
| 12c | run in progress; any week change on an UNPUBLISHED lesson (draft, `published_version_id` NULL) | allowed; control: publishing it afterwards and then increasing it is denied |
| 13 | editor changes `starts_at` of an in-progress run / of an upcoming run | denied / allowed; extending a started run's `ends_at` denied, shortening allowed |
| 14 | direct table write to `lessons.week` or `course_runs` as `authenticated` and as a non-editor | permission denied |
| 15 | `has_course_entitlement` true for an enrolled learner, week-4 lesson in week 1 | `can_read_lesson` false (the hazard above) |
| 16 | extended learner vs basic learner, same run | extended sees calls and URLs; basic sees zero rows; non-enrolled sees zero rows |
| 17 | claim into an ended run | rejected; upcoming and in-progress accepted |
| 18 | anonymous caller, cohort course | metadata visible, nothing else readable |

## Handoff delta (for the owner to commit)

Replace the "First paid course" paragraph under **Payments** with:

> **First paid course: payment outside the app (owner, 2026-10-07).** The
> partner collects payment through Patreon or a similar service. Access is
> recorded by hand: a claim of an invite link she sends writes one
> `run_enrolments` row (run, learner, tier); a refund or chargeback sets that
> row's `revoked_at`. `course_entitlements` (`source = 'grant'`) is kept for
> comps, test accounts and future self-serve sales, and a grant on a cohort
> course opens every lesson regardless of the schedule. No checkout, webhook or
> provider script ships for it. Russian-issued cards don't work on Patreon
> either, so the Russia-resident gap is unchanged. The merchant-of-record route
> above (Polar vs Paddle) is parked until self-serve sales of evergreen
> courses are wanted.

Add to **Entitlement and access**, under the cohort exception:

> A run has a start and a stored end. Week N of a run opens at its start plus
> 7 × (N−1) days; after the end every lesson is open. While a run of the
> course is in progress, a published lesson's week cannot be moved later, and a
> run's start cannot be changed once it has begun, so no edit can re-lock a
> lesson a learner could already open (docs/decisions/0093).

## Revisit if

- The partner needs to move a published lesson LATER during a run (the
  freeze would need an explicit, learner-visible exception).
- Tier history matters (e.g. refunds of an upgrade).
- Self-serve cohort sales arrive: enrolments would then need a payment
  reference beyond `source_ref`.

Feeds COH-002, COH-003 and CNT-013.
