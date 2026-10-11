# 0124 — CNT-013: purchased access survives every editor action

Status: **decided unattended** (CNT-013 ran `--no-approval`), open to
correction.

## Context

0025 ("What would make us revisit this") proposed a card: gate
`set_lesson_archived` / `unpublish_course` on `is_admin` before
`course_entitlements` has rows to lose. 0041 Decision 3 inherited it. The
owner's call (2026-10-07, in #158's body) replaced that with an invariant:
**no editor-callable function removes access from an entitled learner,
except the deliberate revoke.** Archive and unpublish stay editor-gated.

## The inventory

Every function in the latest migration bodies (through 066) that both calls
`can_edit_course(` and writes a row: 26. The same 26 come back from the
local catalog (functions `authenticated` may EXECUTE whose body writes
`lessons`, `courses`, `lesson_versions`, `course_runs`, `run_enrolments`,
`course_entitlements`, `run_invites` or `course_editors`). The catalog
query also returns, outside the editor set: `create_course`,
`grant_course_editor` and `revoke_course_editor` (admin-only),
`claim_run_invite` (the learner) and `delete_my_account` (the learner's own
rows).

| Group | Functions |
|---|---|
| Visibility | `set_lesson_archived`, `unpublish_course`, `publish_course`, `publish_lesson` |
| Access level, schedule | `set_lesson_access_level`, `set_lesson_week`, `set_course_format`, `update_run`, `close_run`, `delete_run`, `create_run` |
| Content and metadata | `create_lesson`, `save_lesson_version`, `update_lesson`, `update_lesson_slug`, `reorder_lessons`, `update_course`, `set_course_how_to_join_url` |
| Calls | `create_call`, `update_call`, `delete_call` |
| Enrolment | `create_run_invite`, `revoke_run_invite`, `set_enrolment_tier` |
| Feedback | `save_voice_feedback`, `save_final_comment` |

The card's named categories that have **no function at all**, by `rg` over
`supabase/migrations`:

- `DELETE FROM lessons|courses|lesson_versions` in 041 or later: no match.
  The only course delete is 040's one-off cleanup of retired rows, which is
  not a function.
- `published_version_id` set to `NULL`: no match. Nothing un-publishes a
  lesson; `publish_lesson` only replaces the version.
- Direct table writes: `lessons`, `courses`, `lesson_versions`,
  `course_entitlements`, `course_runs` and `run_enrolments` have
  `REVOKE ALL ... FROM anon, authenticated` (041:126/147/178, 028:76,
  058:188–189), with SELECT re-granted only. The RPCs are the only write
  path.
- No function writes `course_entitlements` except `delete_my_account`.
  Grants are added and revoked by hand (docs/handoff.md, "Payments").

## Why the entitled branches hold (from the code, then the run)

`_lesson_access_at` (058:273) opens a lesson to a grant holder on
`published AND has_grant`, and to an enrollee on
`published AND unlock_at <= now`. Neither reads `archived_at`,
`courses.status` or (for a grant) the level or week. So archive and
unpublish cannot reach them. For an enrollee, `unlock_at` is
`LEAST(start + 7 × (week − 1), ends_at)`, or `-infinity` for a lesson below
`entitled`. Two guards keep it from moving later:

- while a run is in progress, the 058 freeze (week increase, raise to
  `entitled`);
- after a run has ended, the stored `ends_at` cap (0093 a).

## The run

Local stack migrated through 066, one transaction, rolled back. The script
was printed by a generator kept outside the repo; its full output is in
#158's evidence comment. The seed:

- editor E, on three courses;
- G: a grant on a self-paced course S AND on a cohort course C;
- B: basic in C's run R1, in progress at day 10 (weeks 1–3, so week 3 is
  scheduled: the snapshot's positive control);
- L3: enrolled in an ended run R3 of a second cohort course D;
- U4: enrolled in D's upcoming run R4.

Before and after each of 49 calls, `can_read_lesson` is printed for every
learner × lesson pair (22 cells), called with the learner's JWT claims.
Errors: 0. After rollback: 0 seeded courses left.

Across the 49 steps, only two cells were lost:

- **Step 49, `revoke_run_invite`**: B loses c2 and c3 and keeps c0
  (`anyone`) and c1 (lowered to `signed_in` in step 9). The named exception.
- **Step 14, `set_lesson_access_level(d1, 'entitled')`**, no run of D in
  progress: U4 loses d1. Step 13 had lowered d1 to `signed_in`, which
  gained it. A probe of `_lesson_access_at(d1, U4)` before step 13 and after
  step 14 prints the same row: `scheduled`, the same `opens_at`, level
  `entitled`. L3 (ended run) keeps d1.

Every other call printed `lost: none`, including archive (s2, c1),
unpublish (S, C, D), the week moved 1→3 and 3→30 between runs, a run's start
moved later, a format change on a course with a grant, and a lesson
republished with a new version.

## Decision 1 — no function is fixed or made admin-only

The run found nothing that removes entitlement-derived access, so the
card's third acceptance line has nothing to fix. No migration.

## Decision 2 — the access-level raise is the second named exception

0094 Decision 5 already names raising a lesson to `entitled` as an intended
exception: an author action that takes away access the LEVEL gave. The
loss in step 14 is that case. U4's purchased state for d1 (`scheduled`
until R4's week 1) is unchanged by the raise; what goes is the early,
public access the `signed_in` level gave.

0094 Decision 5 justified this with "the entitled branch bypasses level".
That holds for a grant, not for an enrollee whose week hasn't opened. For an
enrollee of an upcoming run, a lesson open to anyone or to anyone signed in
can be raised and stops opening until its week. During a run in progress,
the 058 freeze refuses the same raise (step 10: `access_level_frozen`).
That limit is the owner's (0094 Decision 4: "its cohort limit is Decision
4's"), so it is recorded, not changed.

## Decision 3 — the 0025/0041 card is closed by this one

The invariant replaces "gate on `is_admin`". 0025 and 0041 now point here.

## What would make us revisit this

- A new editor function, or a re-emitted one, that writes `lessons`,
  `courses`, `course_runs`, `run_enrolments` or `course_entitlements`: re-run
  the inventory and the before/after protocol. Nothing enforces this
  automatically (see the proposed card in #158).
- A function that deletes a lesson, a course or a version, or sets
  `published_version_id` to NULL. None exists, and the entitled branches
  require `published_version_id IS NOT NULL`, so one would revoke access.
- The owner deciding that an enrollee of an upcoming run must keep early
  access to a lesson raised to `entitled` (Decision 2). The fix would be
  extending the freeze in `set_lesson_access_level` and
  `_lessons_schedule_guard` to "a run of the course with a non-revoked
  enrolment that has not ended".
- `_lesson_access_at` gaining a check on `archived_at` or `courses.status`
  in its entitled branches.
