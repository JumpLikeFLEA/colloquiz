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

## Other decisions made while implementing (not separately escalated)

- **Archived lessons are excluded from `can_read_lesson` and the "lessons:
  published read" RLS policy**, both updated by migration 044. An archived
  lesson is a content-management state, not a publish state — a buyer must
  not keep playing a lesson its editor archived. Editors still see it via
  the existing, unmodified "lessons: editor read" policy, since they need
  to be able to unarchive it.
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

## What would make us revisit this

- A future card giving a delegated non-admin editor their own authoring
  screen would need Decision 1's admin-only page gate reopened — the RPCs
  underneath (`update_course`, `update_lesson`, etc.) already support it via
  `can_edit_course`; only the page-level role check would need to change.
- A need to attribute a course to someone other than its creating admin at
  creation time would revisit Decision 2.
- A real "accidentally published an empty course" incident would revisit
  Decision 3.
