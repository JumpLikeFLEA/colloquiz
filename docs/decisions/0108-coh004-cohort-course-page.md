# 0108 — COH-004: the cohort course page and the schedule states

Status: **decided unattended** (COH-004 ran `--no-approval`). Every state
comes from SQL (`course_lesson_states` / `lesson_state`, `course_calls`,
058); the decisions below are about arranging and showing it, not about who
may open what.

## Context

058 (docs/decisions/0105 Decision 4) added the `scheduled` state with
`opens_at`, and left rendering it to this card; until now
`lib/publicLesson.ts` would have thrown on it. 0093 lists what a
non-enrolled visitor sees on a cohort course ("Non-enrolled visitor") and
who sees calls ("Calls"). This card renders both on `/courses/[courseSlug]`
and the lesson page.

What was built:

- `lib/cohortCoursePage.ts` (pure, tested): `groupLessonsByWeek`,
  `splitCalls`, `nextUpcomingRun`, `cohortAudience`, `callsForAudience`.
- `lib/cohortView.ts`: the cohort reads (runs, the caller's own active
  enrolments, `course_calls`), in parallel, only for a `cohort` course.
- Course page: `CohortLessonList` (week groups) and `CohortInfo` (calls or
  the visitor block), Server Components. Lesson page: `LessonUnavailable`
  gains `access: "scheduled"`.
- `app/(english)/LocalDateTime.tsx`, the one client leaf.

## Decision 1 — a call keeps its Join link for 120 minutes after its start

A call has a start and no end (`run_calls`, 058). "Next one first" needs a
line between upcoming and past. If that line were the start time itself, a
learner five minutes late would find the link gone. So a call counts as
upcoming, with its link, until `CALL_JOINABLE_MINUTES` (120) after it
starts. Past calls follow, most recent first, muted, with no link (0093
"Run lifecycle": past calls without a Join link).

Revisit if calls get a stored end, or the partner runs calls longer than
two hours.

## Decision 2 — the page lists only the calls of the caller's own extended runs

`course_calls` returns every run's calls to an editor, and only that run's
calls to an extended enrolee. The page filters the rows to the runs the
caller holds an active `extended` enrolment in. For a learner this drops
nothing (verified: ext gets 3 rows from SQL, and 3 render). For an editor
with no enrolment it drops everything, so the public page never mixes
several runs' calls. The editor's view of calls is the runs page
(AUTH-010). The filter only ever narrows what SQL returned, so it cannot
serve anything SQL refused. A basic learner and a visitor get zero rows
from SQL in the first place.

## Decision 3 — local time through one client leaf, UTC in the server HTML

The acceptance asks for "opens on <date>" in the learner's local time, and
for the states to render as Server Components. The server does not know
the viewer's timezone. Options:

- (a) a timezone cookie: wrong on the first visit, which is the visit that
  matters for a link from Telegram;
- (b) an inline script that rewrites the text: React does not run scripts
  in rendered components, and it would not run on a client navigation;
- (c) **chosen**: `LocalDateTime`, a client leaf. Its
  `useSyncExternalStore` server snapshot formats in UTC ("… 18:33 UTC"),
  so the server HTML is readable without JS and hydration matches. The
  client snapshot then shows the viewer's zone with its name ("… 20:33
  CEST"), the format 0093 "Calls" asks for (`timeZoneName: "short"`).
  Which state a lesson is in, and whether a call shows at all, stays in
  Server Components.

**Cost (measured, `npm run budget` before → after):** `/` 177.6 → 177.6,
`/login` 285.5 → 285.5, `/invite/…` 175.3 → 175.3,
`/courses/future-imperfect` 171.3 → 171.5,
`/courses/future-imperfect/true-or-false` 257.8 → 258.0,
`/courses/future-imperfect/applied-practice` 285.0 → 285.1. So the free
course and lesson routes are NOT byte-identical. The +0.1–0.2 KB is
attributed to `LocalDateTime`: its code is in the build
(`timeZoneName:"short"` in `.next/static/chunks`), and both routes import
it through `CohortLessonList` / `LessonUnavailable`. That attribution is
inferred from the chunk and the import graph, not isolated by a bisect
build. Next 16 does not code-split a client component that a Server
Component imports dynamically
(`node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md:60`), so
`next/dynamic` cannot remove it. **This is the owner's call** (COH-004's
budget line is left unticked): accept ~0.2 KB, or render the date in UTC
only, which would fail the "local time" line.

## Decision 4 — the cohort block, by audience

`cohortAudience` reads the caller's active enrolments and the SQL states:

- `extended` (any active extended enrolment): the calls section.
- `basic` (enrolled, none extended): nothing about calls, not even an empty
  section.
- `visitor` (no enrolment, and some lesson is `needs_entitlement`): the
  0093 preview: the next run's start, the two tiers, and `how_to_join_url`
  as a plain link. The tier copy mentions the weekly call; that is the
  offer, not a call's date or URL.
- `none` (no enrolment and nothing locked: an editor, a comp grant): no
  block. A learner with full access is not shown "How to join".

The block sits above the lesson list. For a learner, the next call is
time-sensitive and short. For a visitor, the start date and the tiers
belong before eight lesson rows.

"Next start" is the earliest run that has not started. A run in progress
is not offered: joining is by the partner's invite, and the page cannot say
whether she still takes late joiners. When there is no upcoming run, the
page says the date isn't announced yet.

## Decision 5 — CTA label and target on a cohort course

`allOpen` is false for an enrolled learner whose later weeks are
`scheduled`, so the 0102 rule would label their course "Start the first
free lesson". An enrolled learner (basic or extended) gets "Start the
course"; the target is still `firstOpenLesson`. A visitor with no open
lesson and a `how_to_join_url` gets "How to join" as the hero CTA, linking
out; with an open taster, the taster stays the CTA (one tap to a playable
lesson, docs/handoff.md).

## Decision 6 — grouping and numbering

Weekless lessons (a cohort course's `anyone`/`signed_in` taster, 0094
Decision 4) form an "Open lessons" group first, then Week 1, 2, … A row's
number is its place in the whole ordinal-ordered list, not within its
week, so it matches the lesson page's "Lesson N of M" (0079 D5). When a
whole week is `scheduled` for one moment, the date sits in the week header
once; otherwise each scheduled row carries it. A scheduled row stays a
link: the lesson page shows the same state (acceptance), and there is no
lock icon (the no-lock rule of 0079).

## Decision 7 — `scheduled` on the lesson page

`getPublicLesson` returns `not_available` / `access: "scheduled"` with
`opensAt`, and throws if 058 ever returns `scheduled` with no `opens_at`
(the function breaking its own contract, the 0102 Decision 3 precedent).
`LessonUnavailable` renders the paid card's frame: "This lesson isn't open
yet", "It opens on <date>.", "Back to course". English, like all lesson
chrome (0080 Decision 5). The strings sit in `signInCopy.ts` beside the
sign-in ones, a module only Server Components import.

## Revisit if

- The owner rejects the ~0.2 KB on free routes (Decision 3).
- The partner wants a run in progress offered to visitors (Decision 4).
- Calls get an end time (Decision 1).
- A learner may sit in two runs of one course at once and needs the runs
  told apart on the page (calls are listed together today).
