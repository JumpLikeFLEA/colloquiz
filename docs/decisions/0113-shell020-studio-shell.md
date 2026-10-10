# 0113 — SHELL-020: the Studio shell and the move of course authoring

Status: decided unattended (SHELL-020, `--no-approval`), 2026-10-10. Builds
docs/decisions/0109 Decisions 1–3, 5 and 11; open to correction.

## Context

0109 settles that course authoring leaves the Colloquiz shell for `/studio`,
with its own root layout. This card does the move and builds the shell. The
decisions below are the ones 0109 and the issue left open.

## Decision 1 — the gate lives in a nested layout, and answers with 404

`app/(studio)/layout.tsx` is the root layout (html/body, ThemeProvider,
Toaster). The gate is one level down, in `app/(studio)/studio/layout.tsx`:
`getCourseAccess()`, and `notFound()` for a user who is neither an admin nor
holds a `course_editors` grant. A `notFound()` thrown in a layout is caught
by the parent segment's `not-found.tsx`
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`),
so the gate can't sit in the root layout itself; `app/(studio)/not-found.tsx`
is the boundary that catches it. Measured: a signed-in learner gets HTTP 404
on every Studio path (protocol run below).

The per-course "Forbidden" screens inside the moved pages are kept
unchanged (the acceptance says "moves … unchanged"). An editor of course A
opening course B's page therefore still sees "Forbidden" with a 200, as
before the move. The list page's own Forbidden branch is now unreachable
(the layout 404s first) and is left in place for the same reason.

Options considered: a 404 page per route, or keeping "Forbidden" for
non-editors. Rejected: the issue asks for a 404, and a learner should not
learn that the workspace exists.

## Decision 2 — the root layout loads Geist Mono, unpreloaded

The issue says "Geist Sans". The moved pages use `font-mono` (course and
lesson slugs, the visitor view's path); without the `--font-geist-mono`
variable that token resolves to nothing and those strings would change
font, so the pages would not move "unchanged". Geist Mono is loaded with
`preload: false`, the Colloquiz root's setting, so it costs nothing until a
mono element renders.

## Decision 3 — the admin link goes to /app/admin/review

0109 Decision 11 gives admins a link to `/app/admin`. `/app/admin` has no
index page (`ls app/(colloquiz)/(main)/app/admin/*.tsx` finds none), so a
link to it is a 404. It points at the review queue, the first Admin entry
of AppSidebar that stays in Colloquiz.

## Decision 4 — sign-out is the English surface's form POST

The Studio nav signs out with a plain form POST to `/auth/sign-out`
(SHELL-019, docs/decisions/0086), `next=/`, not a browser Supabase client.
`/` because Studio is gated: returning to the Studio page signed out would
only bounce to `/login`.

## Decision 5 — the nav is offcanvas, with a top bar trigger

The Studio sidebar uses `ui/sidebar`'s default `offcanvas` collapse, not
AppSidebar's `icon` rail: Studio has one work entry today, and an icon rail
would be a second design to maintain. Below `md` the sidebar is a Sheet,
opened from the `SidebarTrigger` in a small top bar. Verified at 360px.

## Decision 6 — "only the redirect rule remains" is scoped to code

`/app/admin/courses` still appears in `docs/decisions/**`, migrations'
comments, `docs/ui-decisions.md`'s older entries, `prompts/` and
`backlog.mjs`'s acceptance text. Those are historical records of what was
true when written (and `backlog.mjs` must stay reconcilable with the issue
bodies), so they are not rewritten. The before/after count is over code:
`git grep "/app/admin/courses" -- app lib proxy.ts next.config.ts scripts
':!scripts/board/backlog.mjs'`.

## Revisit if

- The inbox (AUTH-012) lands: `/studio`'s redirect to `/studio/courses`
  goes.
- A second work entry joins Courses and the nav gets crowded at 360px.
- `/app/admin` gets an index page: point the admin link at it.
