# 0041 — AUTH-007: opening course authoring to delegated editors

## Context

The owner granted two `course_editors` rows on the hosted database (via the
existing `grant_course_editor` RPC, 029) for the "Future Imperfect" course,
so a non-admin user could start correcting it ahead of CNT-006. Nothing in
the app let them reach that access: every `/app/admin/courses/**` page — the
courses list, a course's detail page, the lesson content editor, and the
lesson preview — was gated on `profile.role === 'admin'` at the page
component, a deliberate choice made by `docs/decisions/0025` Decision 1.

0025 named this exact gap in its own "what would make us revisit this":

> A future card giving a delegated non-admin editor their own authoring
> screen would need Decision 1's admin-only page gate reopened — the RPCs
> underneath (`update_course`, `update_lesson`, etc.) already support it via
> `can_edit_course`; only the page-level role check would need to change.

Verified before writing any code (read-only review of the four pages, the
RLS policies, and every RPC's authorization clause, migrations 029/035/041/
044/045):

- `can_edit_course(course_id, user_id)` (029) — `is_admin OR EXISTS a
  course_editors row` — already gates every authoring RPC except
  `create_course` and `grant_course_editor`/`revoke_course_editor`, which stay
  `is_admin`-only (044, 029). `set_lesson_free_sample` (041:437-451) is also
  `can_edit_course`-gated, not admin-only.
- RLS already scopes `courses`/`lessons`/`lesson_versions` reads correctly
  per caller: "courses: editor read" / "lessons: editor read" (035/041) admit
  a caller only for courses they administer or hold a grant for; "courses:
  published read" (028) separately admits any signed-in user to a published
  course's row regardless of authoring rights.
- `course_editors` RLS ("course_editors: admin read", 029) returns EVERY
  course's editor rows to an admin caller — a query for "my own editor rows"
  must filter `.eq("user_id", ...)` explicitly; RLS alone does not narrow it
  to the caller's own grants for an admin.

So no schema or RPC change was needed — only the page-level gate, and the UI
around it.

Decided by the owner in chat, 2026-09-24.

## Decision 1 — Reopen 0025 Decision 1: page gate becomes `can_edit_course`, not `role === 'admin'`

All four pages (`courses/page.tsx`, `courses/[id]/page.tsx`,
`courses/[id]/lessons/[lessonId]/page.tsx`, `.../preview/page.tsx`) now admit
an admin OR a `can_edit_course` editor of the course in the URL. The decision
is made by calling the SQL function itself (`lib/courseAccess.ts`'s
`canEditCourse`, via `supabase.rpc("can_edit_course", ...)`), not by
re-deriving the same logic in TypeScript from a locally-fetched list of
grants — the SQL function is the single place this logic is allowed to live,
per `can_edit_course`'s own header comment ("the authorization helper for
every authoring path").

The list page (`courses/page.tsx`) is the one place a full RPC-per-course
check would be wasteful (there's no single course id yet), so it instead
narrows the query itself: `lib/courseAccess.ts`'s `getCourseAccess()` returns
the caller's own `course_editors.course_id` rows (self-filtered, per the
`course_editors: admin read` finding above) and `listAuthoredCourses` is
given an optional `courseIds` filter. An admin still gets every course
(`courseIds` omitted); a non-admin editor's list is `.in("id", courseIds)`,
including the "granted nothing" case (`courseIds = []`, which correctly
returns zero rows rather than being treated as "no filter").

The lesson editor and preview pages already `notFound()` unless
`draft.courseId === courseId` (pre-existing code, unrelated to this card) —
that check is what makes gating on the URL's `id` param sound: a `lessonId`
belonging to a course the caller can't edit can't be substituted in to pass
the URL-course-id check and then reach a different course's content.

## Decision 2 — Free-sample toggle stays available to editors; the entitlement rule itself is untouched

`set_lesson_free_sample` is already `can_edit_course`-gated (041:437-451), so
no RPC change was made or needed for editors to flip a lesson's free-sample
flag. This is a narrower thing than it might look like: `docs/handoff.md`'s
entitlement rule — a single SQL function (`can_read_lesson`/
`has_course_entitlement`) decides what "free sample" or "entitled" actually
grants read access to — is completely unchanged by this card. What widens is
only *who may set the flag*, not what the flag means or what it unlocks.
Conflating "who can author" with "what authoring can do" would be the kind
of scope creep this file exists to catch; recorded explicitly so a future
session doesn't read "editors can toggle free-sample" as "the entitlement
model changed."

## Decision 3 — Archive and unpublish stay editable by editors; not fixed here

`set_lesson_archived` and `unpublish_course` were already `can_edit_course`-
gated by 0025 (0025's "Decision 4" section, "`set_lesson_archived` and
`unpublish_course` are `can_edit_course`-gated, not admin-only"), and this
card leaves that as-is — a delegated editor can archive a lesson or
unpublish a course from the UI now, where before they could only do it by
calling the RPC directly (0025 already established the RPC allowed it; only
the UI path is new here).

0025 already named the risk and proposed the fix as its own future card,
which still applies unchanged:

> Gate `set_lesson_archived`/`unpublish_course` ... on `is_admin`, or design
> an explicit permission tier for delegated editors, before
> `course_entitlements` has real rows to lose.

Not built here — `course_entitlements` is still empty pre-M3 (0018 Decision
6), so there is no purchaser-visibility risk yet. This card does not make
the risk any closer (it doesn't change who the RPCs admit, only who can
reach them through a page); it inherits 0025's existing revisit trigger
rather than creating a new one.

## Decision 4 — "New course" and the Editors (grant/revoke) section stay admin-only in the UI

`create_course` and `grant_course_editor`/`revoke_course_editor` are
`is_admin`-gated RPCs (Decision 1 above), unchanged by this card. Showing
their buttons to a non-admin editor would only produce a UI affordance that
always fails server-side, so `CoursesListView`'s "New course" button and
`CourseDetailView`'s `EditorsSection` are both hidden when `!isAdmin`.
Everything else on the course detail page — metadata edit, lesson list,
reorder, free-sample toggle, archive/restore, publish/unpublish — stays
visible, since the RPC underneath each one already admits an editor
(Decisions 2 and 3 above).

## Decision 5 — Sidebar: a separate "Course editing" section, not folded into Admin

A non-admin editor is not an admin, so putting their one entry under a
section literally labelled "Admin" would misdescribe their access. A new
"Course editing" section (`app/components/AppSidebar.tsx`) renders a single
"Courses" link for `isCourseEditor && !isAdmin` — mutually exclusive with
the Admin section's own "Courses" entry, so an admin who also happens to
hold an editor grant sees it once, under Admin. `isCourseEditor` is a
head+count query against the caller's own `course_editors` rows, streamed
through the same `sidebarPromise` as the duels badge and unread count
(`app/(main)/layout.tsx`) so it settles alongside them rather than adding a
new round trip the shell waits on. Recorded in `docs/ui-decisions.md` in the
same commit as the code, per the standing UI-decision rule.

## What would make us revisit this

- 0025's already-proposed M3 card — gating `set_lesson_archived`/
  `unpublish_course` before `course_entitlements` has real purchaser rows —
  still applies unchanged; this card does not resolve or replace it.
- A second non-admin delegated role with different scope (e.g. an editor who
  may NOT archive or unpublish) would need `can_edit_course` itself split
  into tiers, not a UI-only fix like this card.
- A course with editors who are not admins and not the partner (a second
  external collaborator) would still work under this design unchanged — the
  gate is per-course-per-user via `course_editors`, not partner-specific.
