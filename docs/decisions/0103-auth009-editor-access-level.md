# 0103 — AUTH-009: per-lesson access level in the course editor

Status: **decided unattended** (AUTH-009 ran `--no-approval`).

## Context

After CNT-012 (migration 055, docs/decisions/0099) and CNT-014
(docs/decisions/0102), the course editor still showed a "Free sample" switch.
That switch called `set_lesson_free_sample`, which 055 had turned into a
wrapper over `set_lesson_access_level`. AUTH-009 replaces the switch with the
three levels. The acceptance also asks the editor to render "the actual
denied-state component" for sign-in and purchase lessons, with no access
state computed in TypeScript.

## Decision 1 — the visitor view reads the public path as anon

The editor's own session always reads `open` (can_read_lesson's editor
branch), so it cannot simply ask SQL for its own state. Options:

- (a) Map the level to a screen in TS (`signed_in` → sign-in screen,
  `entitled` → purchase screen). This is a second copy of 055's CASE, and
  the acceptance rules it out.
- (b) A new SQL function: "state for an anonymous caller". That is a schema
  change, which is a `--no-approval` stop, and (c) gets the same answer
  without one.
- (c) **Chosen.** Read the lesson through the lesson page's own path
  (`readPublicLesson`, the body of `getPublicLesson`) with a session-less
  anon client (`lib/supabase/anon.ts`). RLS and `lesson_state` decide, and
  the result renders with the lesson page's own `LessonBand` and
  `LessonUnavailable`.

Consequence: a lesson visitors can't reach yet (draft, archived, or in an
unpublished course) shows "Visitors can't reach this lesson yet" instead of a
preview, because the public path returns `not_found` for it. That is what a
visitor gets, so the preview stays truthful. The view is anonymous only. A
signed-in non-buyer of a purchase lesson gets the same screen as anon today
(one `not_available` screen for both).

## Decision 2 — the visitor view is its own page

`/app/admin/courses/[id]/lessons/[lessonId]/visitor`, linked from an eye icon
on every row whose level is not `anyone`. The denied state is a full-width
band plus a card, so it does not fit inside a lesson row. The existing
lesson preview (AUTH-005) is already a page of its own, so this follows its
precedent. `LessonUnavailable` now renders a `<div>`, and the lesson page
wraps it in its `<main>`, because the Colloquiz shell already has a `<main>`.
`npm run budget` printed identical figures before (via `git stash -u`) and
after.

## Decision 3 — all three levels are offered

0094 Decision 2 floated hiding `signed_in` until ANON-012. The owner's
answer made waiting for ANON-012 operational guidance, "not an enforced rule;
nothing blocks it". So the select offers all three. Until ANON-011, the
visitor view of a sign-in lesson shows the purchase notice ("This lesson
opens when you buy the course"). That is the real current screen (CNT-012's
surprise). The preview shows it instead of hiding it.

## Decision 4 — the summary counts non-archived `anyone` lessons

The course-level summary ("Open to anyone: …") lists non-archived lessons at
level `anyone`, the same set 055's open-lesson rule counts
(docs/decisions/0099 Decision 3). It lists levels, which are data; it says
nothing about who may open what. When the list is empty, it says a course
needs one before it can be published. The RPC enforces that; the summary
only explains it.

## Decision 5 — the old RPC and route go now; the column does not

The free-sample route is deleted, and `057_drop_set_lesson_free_sample.sql`
drops the wrapper (0094 Decision 1, 0099 Decision 4). After this card, no app
code reads `in_free_sample`, but `scripts/seed-local-fixtures.ts` still writes
it under 055's mirror CHECK. Dropping the column and the CHECK is a separate
migration, proposed as its own card rather than absorbed here.

## Revisit if

- ANON-011 gives `needs_sign_in` its own screen: the visitor view picks it
  up with no change, since it renders `LessonUnavailable` with the `access`
  SQL returned.
- The partner wants a preview of a lesson before it is published: that needs
  (a) or (b) above, so it is a decision, not a tweak.
- COH-002 adds cohort courses: the summary's "needs one before it can be
  published" line applies to self-paced courses only.
