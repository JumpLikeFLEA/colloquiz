# 0067 — ANON-005: signed-in recording and the course-page best-score read

## Context

ANON-005 (issue #102) is the first card to actually WIRE anything into the
live lesson player: ANON-002 (`lib/lessonPlayer/attemptStore.ts`) and ANON-003
(`lesson_attempts` + `record_lesson_attempts`) both landed already-tested but
uncalled — nothing in the app invoked either before this card. Its own
acceptance line is one sentence: a signed-in learner's completed lesson
writes a `lesson_attempts` row, and the course page shows their best score
from the server. Both halves needed a design decision this card is the first
to make.

## Decisions

**1. `LessonPlayer` reuses the existing `attemptStore`/`uploadPendingAttempts`
pair for the signed-in direct-record path, rather than calling
`record_lesson_attempts` straight from the component.** `uploadPendingAttempts`
already implements exactly "record locally, then upload if a session exists,
clear on success, leave in place on failure" (0063) — reusing it gets
idempotent retry for free: a failed upload after one scored block simply
leaves that attempt in local storage, and the very next scored block's
upload call retries the whole pending batch, not just the new item. Calling
the RPC directly from `LessonPlayer` would have needed to reimplement that
retry behaviour from scratch for no benefit.

**2. The Supabase browser client is imported dynamically, gated on
`isSignedIn`, not statically.** `docs/handoff.md`'s performance boundary is
explicit: an anonymous visitor must not download `@supabase/ssr` client JS on
the critical path. `attemptStore.ts` itself has zero runtime Supabase
dependency (only an `import type { SupabaseClient }`, erased at compile
time), so it's safe to import unconditionally; only `lib/supabase/client.ts`
(which imports `createBrowserClient` from `@supabase/ssr`) needs the dynamic
`import()` to keep its chunk out of an anonymous learner's download entirely.
`isSignedIn` is resolved server-side (`lib/publicLesson.ts`, via
`authUserFrom` — see Decision 4) and passed down as a plain boolean prop, so
the client component never has to probe for a session itself before
deciding whether to load the chunk.

**3. Recording happens per scored block, not once at lesson completion.**
`lesson_attempts` is keyed `(lesson_version_id, block_id)` (0048 Decision 4);
recording as each block scores means a learner who closes the tab before
finishing the lesson still keeps whatever they've done so far, matching
"every attempt is stored" (docs/handoff.md) rather than only the attempts
that happened to precede a full completion.

**4. `isSignedIn` uses `lib/auth.ts`'s `authUserFrom` (JWT signature
verification via `getClaims()`), not `supabase.auth.getUser()`.** Same
reasoning as every other server-side identity check in this app (see that
module's own doc comment): `getUser()` costs a Supabase Auth network round
trip (~80-120ms) on every request, and this lesson route in particular must
stay fast for an anonymous visitor. Used in both `lib/publicLesson.ts` (the
lesson page) and `lib/courseAttempts.ts` (the course page).

**5. The course page's best-score-per-lesson read is a new SECURITY DEFINER
SQL function, `get_course_attempt_summary` (migration 050), not a plain
PostgREST embed.** A straightforward
`lesson_attempts.select("*, lesson_versions(lesson_id)")` looks like it should
work, but "lesson_versions: published content read" (migration 041 §8) only
lets a non-editor read the row that IS the lesson's CURRENT
`published_version_id`. The moment a lesson is republished, a learner's past
attempts point at a `lesson_versions` row RLS no longer lets them read, and
the embed silently drops those rows — undercounting a real best score exactly
in the "best across republished versions" case 0048 Decision 6 was written to
cover. A SECURITY DEFINER function (same shape as `can_read_lesson`) is the
only way to join through `lesson_versions` regardless of which version is
current, while still scoping strictly to `auth.uid()` (never a caller-supplied
user id) so it grants no broader read than the caller already has via
`lesson_attempts`' own owner-read RLS.

**6. Best-per-block is selected by ratio (`earned/possible` DESC), not by
`earned` alone**, via `DISTINCT ON (lesson_version_id, block_id) ... ORDER BY
... (earned/possible) DESC`. Within one version+block, `possible` should
already be constant (same authored item), so this is equivalent to ordering
by `earned` alone today — but ratio is the general "best" definition this
whole feature already uses (`attemptStore.ts`'s `percentOf`), so the function
stays correct even if that invariant is ever loosened rather than silently
picking the wrong "best" attempt.

**7. `lessons.slug` is unique per course, not globally** (migration 043's own
comment), so `get_course_attempt_summary` takes `p_course_id` and returns
`lesson_slug` scoped to that course — a caller matching by bare slug across
two different courses would otherwise risk collision.

## What would make us revisit this

- If a future card needs the local attempt store to ALSO record for an
  anonymous learner (the ANON-004/006 claim flow's own eventual wiring), it
  reuses the exact same `attemptStore` instance shape this card establishes —
  if that turns out to need a different local-store lifecycle than one
  instance per `LessonPlayer` mount, this decision's "reuse as-is" call should
  be revisited alongside it.
- If `lesson_attempts` ever grows a column whose value could differ between
  attempts of the same block without `possible` changing (Decision 6's
  "should already be constant" assumption breaking), re-verify the
  ratio-vs-`earned`-alone question directly rather than assuming ratio still
  gives the intended answer.
