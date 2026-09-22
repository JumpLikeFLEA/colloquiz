# 0025 — AUTH-001: course/lesson-list authoring RPCs and access gate

## Context

AUTH-001 ("the minimum screen set to manage courses and their lesson lists")
looked at first read like a pure UI card — its acceptance list calls out that
"course editor delegation works through the existing grant/revoke RPCs"
(029), implying reuse throughout. Checking the schema before writing any UI
found otherwise:

- `create_lesson` (041) never sets `lessons.slug`, but migration 043 made
  that column `NOT NULL` with no default — the RPC is broken for any real
  interactive caller today.
- No RPC exists to create a course, edit its title/description/level, or
  publish/unpublish it — only the offline importer (`scripts/import-
  lesson.ts`, service role) writes `courses` directly.
- No RPC exists to rename a lesson, edit its description/estimated_minutes,
  reorder lessons, or archive one, and `lessons` had no `archived_at` column.

This made AUTH-001 a schema change (CLAUDE.md: "a schema change... Stop and
ask" survives `--no-approval`), so three shape decisions were put to the
owner before writing migration 044.

Decided by the owner on 2026-09-22.

## Decision 1 — `create_course` is admin-only, not `can_edit_course`-gated

A course has no `course_editors` rows until after it exists, so gating
creation on `can_edit_course` (is_admin OR editor-of-this-course) is
circular for a not-yet-created course. `create_course` is gated on
`is_admin` alone, matching `grant_course_editor`'s existing admin-only gate
(029): an admin creates the course, then delegates editing via the existing
grant RPC. Every other new RPC in migration 044 (`update_course`,
`publish_course`, `unpublish_course`, `update_lesson`, `set_lesson_
archived`, `reorder_lessons`) is `can_edit_course`-gated as usual.

Consequence for the UI: `/app/admin/courses/**` is gated on `role = 'admin'`
in the page component, the same check `/app/admin/review` and `/app/admin/
feedback` already use — not opened to a delegated non-admin editor in this
card. A non-admin editor granted access to a course today has no screen to
use that access from; that is unbuilt scope for a future card, not a
decision made here.

## Decision 2 — `courses.author_id` is set to the creating admin

`author_id` (added nullable by 041, never written by any path until now) is
set to `auth.uid()` at `create_course` time. Nothing in AUTH-001's
acceptance list asks for attributing a course to a different profile (e.g.
the partner) at creation — adding an `p_author_email` parameter and the
lookup machinery it implies would be speculative scope for a column nothing
currently reads.

## Decision 3 — `publish_course` has no "at least one published lesson" guard

Not in AUTH-001's acceptance list. A published course with zero published
lessons is an odd but harmless state — consistent with the project's
absence of a forcing function (`docs/handoff.md`: "No forcing function").
Adding an unrequested guard would be scope creep.

## Decision 4 — an entitled purchaser's read access bypasses content-state gates

An earlier version of migration 044 excluded archived lessons from
`can_read_lesson` and the "lessons: published read" RLS policy
unconditionally — gating `archived_at IS NULL` ahead of the entitlement
check, for every caller including one holding a `course_entitlements` row.
That contradicted 044's own stated rationale for making archiving soft
rather than a hard delete (migration 044, lines 10-11): *"No hard delete,
because purchasers keep access to what they bought."* A purchaser's
`course_entitlements` row survived archiving untouched, but their read
access did not — indistinguishable, from their seat, from a hard delete of
the lesson they paid for.

This also conflicts with `docs/handoff.md`, "Content ownership": *"Anyone
who has paid keeps access to what they bought, indefinitely, regardless of
what happens to the partnership. This is a promise to customers, not an
internal arrangement, and it must survive any separation."* And with 0018
Decision 6, which designed `course_entitlements` with "no expiry column and
no app delete path, because purchasers keep access indefinitely" —
`archived_at`/`unpublish_course` reintroduced exactly the revocation path
that design deliberately omitted.

**Decided:** `can_read_lesson` (migration 044) is rewritten as three
independent branches:

1. **editor** — `can_edit_course`; sees drafts, archived and unpublished
   lessons alike, via the existing "lessons: editor read" policy.
2. **free-sample** — `course.status = 'published'` AND
   `published_version_id IS NOT NULL` AND `archived_at IS NULL` AND
   `in_free_sample`. An archived free-sample lesson stops being
   free-sample-readable — an anonymous or non-buying visitor hasn't bought
   anything, so there is no purchaser promise to protect there.
3. **entitled** — `published_version_id IS NOT NULL` AND a
   `course_entitlements` row for the caller. Bypasses BOTH `course.status`
   and `archived_at`: archiving a lesson or unpublishing its course no
   longer revokes a purchaser's access to it.

`published_version_id IS NOT NULL` is required in every non-editor branch
and is never bypassed — a lesson that was never published stays invisible
regardless of entitlement (0019 Decision 2's rule holds).

The "lessons: published read" RLS policy gets the matching entitled bypass,
so a purchaser can still `SELECT` the row (title/description/
`published_item_count`) to render the lesson page when the lesson is
archived or its course unpublished. This uncovered a second, independent
bug: that policy's `EXISTS` subquery against `course_entitlements` runs as
the CALLING role (unlike `can_read_lesson`, which is `SECURITY DEFINER` and
reads it as the function owner) — and Postgres checks table-level grants on
every relation a query plan touches before row-level filtering runs, so
merely referencing `course_entitlements` from a policy requires the caller
to hold a grant on it, or the ENTIRE `lessons` table becomes unreadable for
that role, not just the archived/unpublished rows. `anon` had no grant on
`course_entitlements` (correctly — it can never hold an entitlement), so
migration 044 now also does `GRANT SELECT ON TABLE course_entitlements TO
anon`. This is safe: `course_entitlements`'s own RLS
("course_entitlements: owner read", 041) is `user_id = auth.uid()`, and
`auth.uid()` is NULL for `anon`, which no row matches — the grant changes
who may ask the question, not what answer they get. Verified directly (see
"Verification" below).

**What this deliberately does not solve:** revocable purchaser access (a
chargeback, a refund) is still M3's `revoked_at` column, called out as
additive in 0018 Decision 6. Nothing here builds it — an entitled purchaser
keeps access unconditionally, exactly as `course_entitlements` was already
designed to guarantee.

### `set_lesson_archived` and `unpublish_course` are `can_edit_course`-gated, not admin-only

Decision 1 above only makes `create_course` admin-only; every other RPC in
migration 044 — including `set_lesson_archived` and `unpublish_course`, the
two RPCs that (before this decision) could revoke a purchaser's access —
is gated on `can_edit_course` (`is_admin` OR a `course_editors` row), same as
`update_course`/`update_lesson`/`reorder_lessons`. A delegated non-admin
editor granted via `grant_course_editor` (029) can call either directly via
RPC today, regardless of `/app/admin/courses/**`'s admin-only page gate
(Decision 1's "consequence for the UI") — that gate stops the page from
rendering for a non-admin, it does not stop the RPC call.

This is harmless right now: `course_entitlements` "stays empty until M3,
whose merchant-of-record webhook becomes its only writer" (0018 Decision 6)
— there is no purchaser to affect yet. It stops being harmless the moment
M3 starts writing real entitlement rows, at which point a delegated editor
would be able to mass-revoke a course's catalogue/free-sample visibility
(though, after this decision, never a purchaser's actual read access) without
being an admin. Not fixed here — proposed as its own card below (see "What
would make us revisit this").

## Other decisions made while implementing (not separately escalated)

- **`reorder_lessons` takes the full new order, not a single move.** The
  lesson-list UI already holds every row, so sending the complete
  permutation avoids inventing tie-breaking logic for the intentionally
  non-unique `(course_id, ordinal)` column (041 rejected uniqueness there
  specifically so reordering wouldn't need a swap). The RPC validates the
  input is exactly a permutation of the course's lesson ids (archived
  lessons included — they still occupy a position) before writing.
- **The lesson-list UI reorders with up/down buttons, not drag-and-drop.**
  No drag library exists in the repo; adding one for this screen would be
  an unrequested new npm dependency (the same class of decision AUTH-002's
  acceptance list explicitly flags as a stop). Up/down buttons call the
  same `reorder_lessons` endpoint with the full swapped order.
- **`create_lesson`'s slug generation lives in SQL**, not a TypeScript
  layer, so it runs under the same `FOR UPDATE` lock the function already
  takes on the parent course row — two concurrent creates with the same
  title must not race to the same slug. `lib/lessonSlug.ts` mirrors the
  base-slug algorithm in TypeScript for the create-lesson form's live
  preview only; it has no authority and never dedupes, the same "mirror,
  not source of truth" relationship `CEFR_LEVELS` has with `courses_level_
  check` (042).

## Verification (Decision 4)

`docs/handoff.md` names the entitlement function specifically as a check
that "proves nothing" on empty tables, so this was verified against seeded
non-empty data — a full local migration replay (`npx supabase db reset`,
migrations 001-044, local Docker Postgres only, never the hosted project),
seeded with two courses and five lessons covering every content-state, then
queried as each role with RLS actually enforced (`SET LOCAL ROLE`
anon/authenticated + `request.jwt.claims`), reading both `can_read_lesson()`
and the `lessons` row's real RLS visibility. Result (`can_read_lesson`/
`row_visible`):

| lesson                        | anon        | non-buyer   | buyer       | editor (course A only) | admin     |
|--------------------------------|-------------|-------------|-------------|-------------------------|-----------|
| free-sample                    | true/true   | true/true   | true/true   | true/true                | true/true |
| paid, not archived              | false/true  | false/true  | true/true   | true/true                | true/true |
| paid, **archived**              | false/false | false/false | **true/true** | true/true              | true/true |
| paid, **never published**       | false/false | false/false | **false/false** | true/true             | true/true |
| paid, **course unpublished** (B) | false/false | false/false | **true/true** | **false/false**        | true/true |

Confirms: an archived or unpublished-course lesson is invisible to
anon/non-buyers (catalogue/free-sample correctly hidden) but readable by an
entitled buyer (Decision 4 holds); a never-published lesson stays invisible
even to a buyer (0019 Decision 2 holds, entitlement never bypasses
`published_version_id`); the course-A-only editor sees nothing extra in
course B (per-course scoping holds, independent of Decision 4's bypass).
This run is also what surfaced the `course_entitlements` grant bug fixed
alongside Decision 4 — the first version of the policy rewrite made `anon`
unable to read ANY published lesson (a hard permission error, not just a
narrower result), caught only because the matrix includes a free-sample row
for `anon` and it came back `false` instead of `true`.

## What would make us revisit this

- A future card giving a delegated non-admin editor their own authoring
  screen would need Decision 1's admin-only page gate reopened — the RPCs
  underneath (`update_course`, `update_lesson`, etc.) already support it via
  `can_edit_course`; only the page-level role check would need to change.
- A need to attribute a course to someone other than its creating admin at
  creation time would revisit Decision 2.
- A real "accidentally published an empty course" incident would revisit
  Decision 3.
- M3 needing revocable purchaser access (a chargeback, a refund) would
  revisit Decision 4 — extend `course_entitlements` with `revoked_at`
  (0018 Decision 6) and have the entitled branch check it; don't fork a
  second entitlement check.
- **Proposed card (M3, alongside the merchant-of-record work):** *"Gate
  `set_lesson_archived`/`unpublish_course` (and any other RPC that changes a
  published lesson's or course's read-visibility) on `is_admin`, or design an
  explicit permission tier for delegated editors, before `course_entitlements`
  has real rows to lose."* Acceptance: a `course_editors`-only (non-admin)
  caller can no longer archive a lesson or unpublish a course it doesn't
  administer full-stop, OR an audited/notified path exists — the M3 owner's
  call at that time.
