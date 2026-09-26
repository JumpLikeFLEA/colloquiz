# 0056 — PLAY-006's public lesson read: RLS/can_read_lesson only, no app-level entitlement logic

## Context

PLAY-006 (issue #95) replaces SHELL-007's data-free placeholder at
`/courses/[courseSlug]/[lessonSlug]` with the first genuinely public,
anon-key, no-session read of a published lesson. The plan was approved with
six changes on top of the initial proposal; this file records what each one
resolved to, since none of them are visible from the diff alone. Before
acceptance, a second review round asked for the local seed to be committed as
a script and for the 280 KB budget figure to be justified with a real
chunk-level itemization rather than accepted from one measurement — both are
folded into Decisions 5 and 7 below.

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
absent, which is the opposite of what a budget guard is for. At the time of
this decision the `ROUTES` entry pointed at `play-006-smoke`/`free-lesson`, a
synthetic fixture slug; **superseded by Decision 7's move to a real lesson**
below.

**7. The 280 KB figure from the first pass was not accepted as-is.** A full
chunk → size → content sweep of the route's downloaded scripts (Chrome
DevTools Protocol `Network.getResponseBody`, grepped for package-identifying
symbols) found `DndContext`/`useDraggable`/`useSortable`/
`sortableKeyboardCoordinates` present even though the seeded lesson's only
item type needs no drag interaction, and the same chunks carried all five
practice renderers' code together — `app/components/lesson-player/
practice/index.tsx`'s `practiceRenderer` statically imports all five
unconditionally, so every lesson's client bundle pays for dnd-kit and every
renderer regardless of which item types its own document actually uses.
Confirmed by an actual differential build (`practiceRenderer` temporarily
reduced to the two non-drag renderers, reverted immediately after): a real,
measured **22.1 KB saving**, not a grep-based estimate.

**This finding, the follow-up "measure against realistic content" request,
and the (a)-vs-(b) approach comparison the owner then asked for are all
resolved together in docs/decisions/0057 — read that file for the full
picture, not this one.** In short: `scripts/budget.ts`'s route moved from
the synthetic `play-006-smoke`/`free-lesson` fixture to
`/courses/future-imperfect/true-or-false` (a real authored lesson, seeded by
`scripts/seed-local-fixtures.ts` straight from
`authored/courses/future-imperfect.json` — Decision 8 below), which measured
**identically** (272.7 KB baseline, 250.6 KB after the same code-splitting
experiment) — confirming the saving is content-independent, not an artifact
of the synthetic fixture. 0057 also prototyped and measured a second
approach (near-viewport deferral) on this same real lesson and found it
makes that lesson's real number WORSE, not better, because its practice
block already sits above the fold. `budgetKB` stays at **260 KB** — the
actual target, not wherever the unsplit code happens to land:

```
/courses/future-imperfect/true-or-false | 272.7 KB | 260 KB  ⚠ OVER BUDGET
```

This is deliberately not raised to make the guard pass; staying red is the
correct state until PLAY-012 lands, and "a budget re-derived from the first
measurement alone isn't a budget." **PLAY-012 — per-type code-splitting for
practice renderers — see docs/decisions/0057 for its final scope and
acceptance.**

This run also confirms the OPS-013 carry-over: `lucide-react`'s base `Icon`
reaches this route (via `CalloutBlock`, `VideoBlock` and all five practice
renderers, which already imported it before this card), so it is now
**expected** cost on English routes that mount a real `LessonPlayer`, not a
leak — consistent with what OPS-013's own acceptance line 1 anticipated. This
holds regardless of PLAY-012's code-splitting: `lucide-react` is used inside
the renderers that stay in every lesson's bundle either way (0057).

**8. The local seed is committed as `scripts/seed-local-fixtures.ts`, not a
one-off psql/GoTrue-admin-API session.** Idempotent (upserts on natural keys —
`courses.slug`, `(course_id, slug)` on `lessons`, the composite PKs on
`course_editors`/`course_entitlements`; `lesson_versions` is append-only, so a
lesson already holding a `published_version_id` is left alone on a re-run
rather than growing a new version every time), and refuses to run unless
`NEXT_PUBLIC_SUPABASE_URL`'s host is `localhost`/`127.0.0.1` — the same class
of hosted-write mistake docs/decisions/0052 exists to prevent, now enforced in
code rather than only in a session's own discipline. Verified idempotent by
running it twice against a freshly reset local stack: identical ids, row
counts unchanged (1 course, 5 lessons, 4 versions — `draft-lesson` has none by
design, 1 entitlement, 1 editor grant) on the second run. `npm run seed:local`
added to `package.json`; `scripts/budget.ts`'s header now states its lesson
route entry depends on it having been run first. This script was extended
again in docs/decisions/0057 to also seed a real authored lesson (a second,
separate course) — see that file. ANON-003/005/006 (attempt recording) are
expected to reuse this same fixture set — see "What would make us revisit
it".

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
- If OPS-010 publishes `future-imperfect` for real, `scripts/budget.ts`'s
  route already matches it (docs/decisions/0057) — confirm the number still
  holds rather than assuming it does.
- If a future migration changes what `can_read_lesson` bypasses for archived
  lessons, Decision 3's matrix needs re-running — its four-way split is a
  direct read of migration 044, not an independent design choice this card
  made.
- See docs/decisions/0057 for PLAY-012's own revisit conditions.
- ANON-003/005/006 should extend `scripts/seed-local-fixtures.ts` (Decision
  8, extended further in 0057) in place rather than each writing a parallel
  seed script — if a card finds the fixture set doesn't cover what it needs,
  that's a reason to add to this file, not fork it.
