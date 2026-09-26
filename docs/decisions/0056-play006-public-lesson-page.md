# 0056 — PLAY-006's public lesson read: RLS/can_read_lesson only, no app-level entitlement logic

## Context

PLAY-006 (issue #95) replaces SHELL-007's data-free placeholder at
`/courses/[courseSlug]/[lessonSlug]` with the first genuinely public,
anon-key, no-session read of a published lesson. The plan was approved with
six changes on top of the initial proposal; this file records what each one
resolved to, since none of them are visible from the diff alone.

## Decision

**1. `can_read_lesson()` is called explicitly; nothing is inferred from a
null `lesson_versions` read.** `lib/publicLesson.ts`'s `getPublicLesson()`
calls the RPC directly and branches on its boolean result. If it returns
`true` but the matching `lesson_versions` row is still empty, that is treated
as an invariant break and thrown, not returned as `not_available` — RLS
grants that exact row whenever `can_read_lesson` is true (migration 041 §8:
`id = lessons.published_version_id AND can_read_lesson(...)`), so the two
disagreeing means something is actually broken. Any Supabase `error` (as
opposed to a legitimate empty `data`) is also thrown, never swallowed. This
lets `app/(english)/error.tsx` (new, this card — the surface had no error
boundary yet) catch a real bug loudly instead of a learner seeing a
misleadingly calm "not available" screen.

**2. `published_version_id IS NULL` is checked directly in app code, not left
to RLS, and applies to every caller including editors.** RLS's "editor read"
policies (migration 041/044) would otherwise surface an unpublished draft on
this public URL too, for the lesson's own editor. This route only ever
serves published content — the author's path to a draft is the AUTH-005
preview screen, not this one. Verified over real HTTP with a real editor
session (see Verification): the editor's own draft lesson still 404s here.

**3. Archived-lesson behaviour, checked rather than assumed.** Migration 044
excludes an archived lesson from "lessons: published read" for everyone
*except* an entitled buyer (`has_course_entitlement()` bypasses both
`c.status` and `l.archived_at` — the purchaser-keeps-access promise,
docs/handoff.md) or an editor (their own separate RLS policy, unconditional).
So the public behaviour for an archived, previously-published lesson is:
**404 for anon and signed-in-non-entitled visitors** (the metadata row itself
is invisible to them under RLS — this route can't tell "archived" apart from
"never existed" for that population, which is fine, since there's nothing to
preview once archived and unbought), and **still playable for the entitled
buyer and for an editor**. This is not a bug and not app logic of this card's
own — it falls out of RLS unchanged. Confirmed both in the SQL matrix and
over real HTTP (see Verification).

**4. Verification matrix: {anon, signed-in, entitled, editor} × {free, paid,
draft, archived}, 16 cells, gotrue kept running.** Local
`supabase start` excluded only `storage-api, realtime, imgproxy,
edge-runtime, logflare, vector, studio, mailpit, supavisor` — nothing this
card's read path needs — and kept `gotrue` up so signed-in/entitled/editor
sessions could be real, not simulated. Three real auth users were created via
the local GoTrue admin API. All 16 cells were checked twice: once directly in
SQL (`SET ROLE` + `SET request.jwt.claim.sub`, mirroring CNT-010's own
verification precedent) against `lessons.published_version_id IS NOT NULL`
and `can_read_lesson()`, and — per the review note — the signed-in, entitled
and editor rows were *also* driven through the real page over HTTP with a
real session cookie obtained by actually signing in through `/login` against
a `next build && next start` server pointed at the local stack. Every result
printed; none of the 16 (or the additional 4 over-HTTP rows) came back empty.
Full result:

| caller | free | paid | draft | archived |
|---|---|---|---|---|
| anon | playable | not_available | 404 | 404 |
| signed-in | playable | not_available | 404 | 404 |
| entitled | playable | playable | 404 | playable |
| editor | playable | playable | 404 | playable |

An additional fixture lesson (`broken-lesson`, in the free sample, with a
`lesson_versions.document` containing an unrecognizable block) confirmed the
"invalid stored document → visible author error, not a crash" acceptance
line: HTTP 200, `LessonPlayerError`'s "cannot be played" text rendered, no
500. The invariant-throw path from Decision 1 (`can_read_lesson` true but no
readable version row) was not live-triggered — the FK from
`lessons.published_version_id` to `lesson_versions` is `ON DELETE SET NULL`,
so there is no way to produce that exact state without directly violating
the schema's own consistency guarantee. It stays a defensive, code-reviewed
branch, not a demonstrated one.

**5. `npm run budget` already hard-fails, never green, on a non-2xx route** —
`measureRoute()`'s `!response.ok()` check (pre-existing, OPS-006) returns
`{ ok: false, reason: "navigation returned <status>" }`, which `main()`
prints as `FAIL` and folds into `anyFailed`, exiting 1. No code change was
needed to satisfy "asserts HTTP 200... never green"; a separate
`SKIPPED: <status>` outcome (the review note's other named option) was
considered and **not** added — a soft-skip state would let this route's real
cold-load number quietly stop being checked whenever the fixture data is
absent, which is the opposite of what a budget guard is for. The
`ROUTES` entry now points at `play-006-smoke`/`free-lesson`, fixture slugs
that exist only on a local seeded stack; this is accepted, per the review
note ("seeded local slugs are fine") — the same route already 404s against
hosted today regardless, since hosted has no published course yet. `budgetKB`
was corrected from the 260 KB placeholder to **280 KB**, re-derived from a
real run against the local seed: 272.7 KB measured, no forbidden-signature
leak. This run also confirms the OPS-013 carry-over: `lucide-react`'s base
`Icon` reaches this route (via `CalloutBlock`, `VideoBlock` and all five
practice renderers, which already imported it before this card), so it is
now **expected** cost on English routes that mount a real `LessonPlayer`, not
a leak — consistent with what OPS-013's own acceptance line 1 anticipated.

**6. The route is dynamic; correct for now.** `lib/publicLesson.ts` reads
`next/headers` cookies via `lib/supabase/server.ts`'s `createClient()`, which
makes `next build` mark this route `ƒ` (server-rendered on demand), confirmed
in the build output. This is the right behaviour today: the same code path
serves anon, signed-in and entitled callers, and a per-caller entitlement
result must never be cached across callers. If this route is ever made
static or ISR'd for performance, that caching may only ever apply to the
free-sample case (`in_free_sample = true`, no session-dependent branch) — a
paid or not-yet-entitled response must never be served from a shared cache
key, or a purchaser's session-scoped content could leak into another
visitor's cached response for the same URL.

## What would make us revisit it

- If a future card needs this route to be static/ISR'd for the free-sample
  case specifically (Decision 6), that's a deliberate follow-up card, not a
  silent change to `lib/publicLesson.ts`.
- If OPS-010 publishes the real launch course, `scripts/budget.ts`'s
  `ROUTES` entry should move from the `play-006-smoke` fixture slugs to that
  real course/lesson, and the 280 KB figure re-measured against it.
- If a future migration changes what `can_read_lesson` bypasses for archived
  lessons, Decision 3's matrix needs re-running — its four-way split is a
  direct read of migration 044, not an independent design choice this card
  made.
