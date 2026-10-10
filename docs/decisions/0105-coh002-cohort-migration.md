# 0105 — COH-002: the cohort migration (058)

Status: **decided unattended** (COH-002 ran `--no-approval`). Each decision
below fills a gap that 0093 (COH-001) or 0094 (CNT-011) leaves open. None of
them changes a rule either file states.

## Context

`supabase/migrations/058_cohort_schema.sql` writes 0093's schema sketch:
`courses.format`, `courses.how_to_join_url`, `lessons.week`,
`course_entitlements.revoked_at`, and the `course_runs`, `run_enrolments`
and `run_calls` tables. It also adds `_lesson_access_at(lesson, user, now)`
with no grants, re-emits `has_course_entitlement`, `can_read_lesson`,
`course_lesson_states`, `set_lesson_access_level`, `create_lesson`,
`publish_course`, `publish_lesson` and the account-delete RPC, adds the
editor functions for runs, weeks and calls, and adds triggers as backstops.

## Decision 1 — the week has its own RPC, `set_lesson_week`

0093 says the freeze is "enforced in `update_lesson` and `update_run`".
`update_lesson` (044:276) is a four-argument full replace with one caller
(`EditLessonDialog`). Adding a week argument changes its signature, which
needs a DROP, and breaks that caller until AUTH-010 ships. The level already
has its own RPC (`set_lesson_access_level`, 0018 Decision 4: "explicit action,
not a side effect"), and the week is the same kind of attribute. So
`set_lesson_week(lesson, week)` carries the freeze, and `update_lesson` is
untouched. The trigger backstop covers every write path either way.

Revisit if AUTH-010's form wants one save for title, description and week:
it can call both RPCs. Merging them is not needed for that.

## Decision 2 — an `entitled` cohort lesson with no week

0093 makes a week "required at publish" and says nothing about what the
schedule does without one. Two places enforce the requirement:
`publish_lesson` refuses (`week_required`), and so do `set_lesson_week`
(clearing a published entitled lesson's week) and `set_lesson_access_level`
(raising a published weekless lesson of a cohort course to `entitled`).
Two paths still produce the state: a course switched to `cohort` with
published weekless entitled lessons, and a direct write. For those, the
access function opens the lesson at the run's END. It fails closed: a missing
week never opens paid content early. For the same reason the freeze treats
week → NULL as an increase.

Revisit if the partner switches a published self-paced course to cohort:
`set_course_format` could refuse while weekless entitled lessons exist.

## Decision 3 — who can read `course_runs`

0093 lists what a non-enrolled visitor sees, "the next run's start date"
included, but names no read path. `course_runs` is readable through three
OR'd policies: a published course (dates and titles are not secret), an
editor of the course (AUTH-010), and the caller's own enrolment, revoked
included (the export embeds the run on a revoked row). The enrolment policy
calls a SECURITY DEFINER predicate, `is_enrolled_in_run(run)`. The first
protocol run used an `EXISTS` over `run_enrolments` inside the policy, and
every anonymous read of `course_runs` failed with "permission denied for
table run_enrolments". A policy runs as the caller, and anon has no grant on
that table. This is the 044 mistake again (docs/decisions/0025 Decision 4).
`run_calls` has no grants; `course_calls(course)` is its only reader.

## Decision 4 — the new state is `scheduled`

0093 calls it "the `opens_at` state" and leaves state names to CNT-011.
CNT-011 named the others after what the caller still needs
(`needs_sign_in`, `needs_entitlement`). `scheduled` fits that: the caller has
access, and it has not started yet. `opens_at` carries the moment. It is the
earliest unlock over the caller's non-revoked runs, so a learner in an
upcoming run sees that run's start (matrix cell 3).

TypeScript is not changed here (COH-004 renders the state). Until then
`lib/publicLesson.ts` would treat `scheduled` like `open`, find no readable
version, and throw. That can only happen on a cohort course with a run, and
no editor UI can create one before AUTH-010.

## Decision 5 — `course_lesson_states` becomes SECURITY DEFINER

It has to call `_lesson_access_at`, which has no grants. Inheriting RLS is
therefore no longer possible, so the row rule states the policy itself: a
published lesson that is listed, or whose course the caller has
`has_course_entitlement` on (the "lessons: published read" policy, 044:183),
or that the caller can open (an editor's archived lesson, 0099 Decision 5).
The `has_course_entitlement` clause is new. Without it, an enrolled
learner's archived future-week lesson would have a metadata row and no state
row, and `lib/publicLesson.ts` throws on that mismatch.

## Decision 6 — `anyone` / `signed_in` lessons and enrolled learners

0094 Decision 4: the schedule governs `entitled` lessons only. In the
enrolment branch an `anyone` or `signed_in` lesson therefore unlocks
immediately. An enrolled learner keeps reading it when it is archived or the
course is unpublished, the same bypass every entitled learner has (0025).

## Decision 7 — the unstarted run with no scheduled lesson left

`create_run` refuses when no entitled lesson has a week
(`no_scheduled_lessons`, 0093 a). If edits later clear every week while a run
has not started, the trigger cannot refuse: that would block the edit. It
sets `ends_at` to `starts_at + 7 days` instead, so the CHECK holds. Nothing
is scheduled, so nothing can open early. The next week that is set
recomputes it.

## Decision 8 — run lifecycle RPCs: `close_run` and `delete_run`

AUTH-010 says "create, edit and close runs". Closing an upcoming run has no
meaning under 0093 (an end before the start), so there are two functions.
`close_run(run, ends_at = now())` works on a started run and only moves the
end earlier. `delete_run` works on a run that has not started and has never
had an enrolment, revoked rows included, because they are roster history
(0093 Decision 3).

## Decision 9 — the enrolment guard

The schema has no claim writer (COH-003 writes enrolments). Three rules are
enforced by a trigger, so COH-003 gets them for free:

- no claim into an ended run (0093 "Run lifecycle", matrix cell 17);
- `run_id` and `user_id` are immutable;
- a revocation is never undone (0093 c: re-enrolling adds a row).

`tier` stays editable in place (0093 "Tier change").

## Decision 10 — export and deletion of `course_entitlements`

The card requires both. The export adds `course_entitlements` (revoked rows
included) and `cohort_enrolments`, and `EXPORT_FORMAT_VERSION` moves 4 → 5.
`delete_my_account` deletes both kinds of row. The privacy policy already
lists enrolments in the export (§8) and in erasure (§9). It does not mention
grants (`course_entitlements`) in either. A grant is a comp or a test account
today, and no purchase exists yet. The legal text is reviewed copy, so it is
not edited here; a follow-up card is proposed.

## Revisit if

- COH-004 renders `scheduled` (Decision 4's interim throw goes away).
- A course is switched to cohort with published content (Decision 2).
- Self-serve purchases arrive. Deleting a purchase record on account
  deletion may then conflict with a retention duty (Decision 10).
