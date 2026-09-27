# 0070 — SHELL-010: landing page, catalogue read, and hero one-tap path

## Context

SHELL-010 gives `/` a real page: a hero section, then a catalogue of course
cards. It removes SHELL-013's temporary `/` → `/app` 307. The card is the
"built once, late" landing-page exception in docs/handoff.md's "Visual work"
§3 — visual quality is the whole point of this page — but the copy for it
(`lib/alliengll/copy.ts`'s `landing`/`catalogue` blocks) was already in
place before this card started, so the "depends on the partner's copy"
external dependency the issue names was already satisfied; this card is the
first thing that reads it.

Three things needed a decision this issue didn't spell out.

## Decision 1 — where the catalogue-listing query lives

`lib/courseCatalogue.ts` already existed, holding `COURSE_SUBTITLE_MAX_LENGTH`
and imported into a Client Component (`CourseDetailView.tsx`, the authoring
editor). Adding the new `getPublishedCourses()` query directly into that file
broke `next build`: it imports `@/lib/supabase/server`, which depends on
`next/headers`, and having any importer of that chain reachable from a
Client Component is a hard Turbopack build error, confirmed by a real
`next build` run, not assumed. `getPublishedCourses()` was moved into a new
`lib/publicCatalogue.ts`; `lib/courseCatalogue.ts` stays a pure
constants/types module. `getPublicCourse` (lib/coursePage.ts) already keeps
this same separation for the single-course read — this just extends it to
the listing.

Unlike `getPublicCourse` (a single row read by a slug the caller chose
deliberately), `getPublishedCourses` filters `status = 'published'`
explicitly rather than relying on RLS alone: migration 035's "courses:
editor read" policy grants a signed-in editor SELECT on their own draft
courses, which would leak that editor's own drafts into their own view of
the public catalogue if this listing query didn't filter itself. The
published-read policy (028) still applies underneath; the filter is
belt-and-braces, not a second source of truth.

## Decision 2 — the hero CTA skips the catalogue

Acceptance: "From the bio link to the first free lesson takes at most one
tap after / loads." A hero that links to `#catalogue`, requiring a second
tap into a course card and (per SHELL-008) a third tap to the first free
lesson, would not satisfy this. The hero's primary CTA
(`alliengllCopy.landing.ctaPrimary`, "Начать бесплатно") instead links
straight to the first published course's first free-sample lesson, reusing
SHELL-008's own `firstFreeLesson()` helper — the same one the course page's
"one tap" CTA already calls. "First published course" is
`getPublishedCourses()`'s `created_at` order; at one-course-today
(docs/handoff.md, "Launch bar: one finished course") there's no real
ordering decision being made, only a default for when a second course
exists. If no course has a free-sample lesson, the CTA falls back to
`#catalogue` rather than a dead link.

## Decision 3 — budget target for `/`

Added to `scripts/budget.ts`'s `ROUTES`. Measured against the hosted
project (no local-Supabase-seed dependency, unlike the three pre-existing
`/courses/future-imperfect/*` entries, which still FAIL in this environment
for the same reason documented in decisions 0060/0062 — `seed-local-fixtures.ts`
refuses to run against anything but a local Supabase URL, and none exists
here) at **172.0 KB**. Budget set to **180 KB** (+~4.5% headroom, the
PLAY-012/SHELL-008 precedent from 0057/0059) — re-derive both from a real
`npm run budget` run before raising it.

## Surprise, not a decision: what's actually published

Querying the hosted project directly (anon key, read-only) during this card
found exactly one published course: `auth003-smoke-test` ("AUTH-003/005
smoke test") — not `future-imperfect`, the real content docs/handoff.md's
"Launch bar" describes. The catalogue and hero CTA built here correctly
render whatever is actually published, so this isn't a bug in this card,
but it means the live `/` today shows a smoke-test course to a real visitor.
Publishing the real course is a content/authoring action outside this
card's scope (and not a schema, migration, or code change) — flagging it
here rather than silently working around it.

## What would make us revisit it

- A second and third course actually publishing: re-check that `created_at`
  ordering still reads as sensible, and that "the first course" is still
  the right thing for the hero CTA to feature (a manual "featured course"
  flag might be needed instead).
- `future-imperfect` getting published for real on the hosted project — the
  budget guard's existing FAIL for those three routes should then resolve on
  its own, per 0057/0059's own note.
- The `auth003-smoke-test` course being unpublished or deleted — the
  catalogue will then correctly show the empty state
  (`alliengllCopy.catalogue.empty`) until a real course is published.
