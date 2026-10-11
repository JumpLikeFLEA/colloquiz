# 0126 — AUTH-015: editors create courses

Status: **decided unattended** (AUTH-015 ran `--no-approval`), open to
correction. Implements 0125 Decisions 2 and 4; the choices below are the
ones 0125 left open.

## Decision 1: the gate allows a non-admin with any `course_editors` row

`create_course` (067) refuses a caller with no `auth.uid()` or with neither
`is_admin` nor a `course_editors` row, and otherwise behaves as in 044. A
non-admin creator gets `course_editors (new course, self, granted_by =
self)` in the same call. An admin gets none. This is 0125 D2 as written.

The Studio courses page already has this gate (`getCourseAccess`:
admin, or at least one editable course), so the "New course" button is
shown to everyone who reaches the page, and the `isAdmin` prop of
`CoursesListView` is gone.

## Decision 2: a slug race returns `slug_taken`, not a 500

044 pre-checked the slug with `EXISTS` and then inserted. Two concurrent
creates with the same slug both pass the pre-check, and the second
INSERT hit `courses_slug_key` and raised, which the route turned into a
500. 067 catches `unique_violation` around the INSERT and returns
`slug_taken`. Measured on the local stack: session 1 created
`race-auth015` and held its transaction 4 s; session 2, started 1.5 s
later, blocked on the unique index and returned
`{"ok": false, "error": "slug_taken"}` after session 1 committed.

- Option rejected: leave it. The acceptance asks for `slug_taken` inline,
  and opening course creation to authors makes a duplicate more likely,
  not less.

## Decision 3: the route returns the RPC's error code beside the message

`POST /api/admin/courses` returns `{ error, code }` on a refusal. The
dialog puts `slug_taken` and `invalid_slug` under the slug field and
everything else in its general error box. The shared
`courseAuthoringErrorResponse` is unchanged; only this route adds `code`.

- Option rejected: match on the HTTP status (409). `invalid_slug` is a 400,
  like `invalid_title`, so the status can't place it.

## Decision 4: clearing the slug field hands it back to the title

0125 D4: the slug follows the title until the author edits the slug
field. If the author then empties the slug field, it refills from the
title and follows it again. An empty slug can't be submitted anyway, so
the only effect is that an author who wants the automatic slug back can
get it without retyping the title.

## Decision 5: the protocol lives in `supabase/verify/`

The rollback-wrapped protocol for the owner is
`supabase/verify/067_editor_create_course.sql`. It is not in
`supabase/migrations/`, so nothing applies it by accident, and it seeds
its own users and course, so it needs nothing from the hosted data. It
raises `AUTH-015 FAIL: …` on the first failed case and ends in
`ROLLBACK`. This is the first file in that folder; previous cards put
their protocol output in the issue comment only.

## Note on 0124's inventory

0124 lists `create_course` as admin-only. After 067 it is editor-callable.
It writes `courses` and `course_editors` for a new course only, so it
removes nobody's access and 0124's invariant still holds.

## What would make us revisit this

- A second partner, or an editor who should not create courses: 0125 D2's
  revisit line (an explicit creator permission).
- More protocol files appear and nobody runs them: fold
  `supabase/verify/` back into issue comments.
