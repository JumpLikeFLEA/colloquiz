# 0059 — SHELL-008: course page reads real RLS, progress reads an empty attempts map, and next.config's image protocol is derived

## Context

SHELL-008 (issue #97) is the page a catalogue card opens into. Its declared
dependencies (#92 route group, #93 catalogue columns) were both Done, but two
things surfaced during implementation that the issue itself doesn't mention:
the acceptance line "the learner's best score where one exists" assumes
attempt data that doesn't exist anywhere in this system yet, and verifying
the page's own `npm run budget` acceptance line against a local seeded stack
turned up a config gap and a bundle leak. All three are recorded here since
none are visible from the diff alone.

## Decision

**1. Course-wide progress and per-lesson best score are computed by pure
functions over an explicit attempts map (`lib/coursePageProgress.ts`), called
today with an empty map — not stubbed, the actually-correct current state.**
ANON-002 (localStorage attempt store) and ANON-003 (`lesson_attempts` table +
record RPC) are both still Ready, not Done (checked against `board-status.mjs`
and `gh issue view` for both — neither is Done, and neither appears in
SHELL-008's own "Depends on" line). No attempt is recorded anywhere in this
system today, for anyone, signed-in or anonymous. Given that, "0 attempted /
N lessons, no average yet" and "no best-score badge on any lesson row" are
the correct values to show right now, not a placeholder standing in for real
data — the alternative (querying a `lesson_attempts` table) isn't possible
because that table doesn't exist. `courseProgress()` and
`bestScoreForLesson()` take an `AttemptsByLessonSlug` map as a parameter for
exactly this reason: whichever of ANON-002/003 lands first only needs to
build that map and pass it in, not touch this page's rendering logic.
Verified with unit tests (`lib/coursePageProgress.test.ts`) covering the
empty-map case and the "average only the attempted lessons" rule
(docs/handoff.md, Scoring and progress).

**2. No entitlement check of its own — "lessons: published read" (migration
044) already does the row-level filtering this page needs.** A draft or
archived lesson is excluded by RLS before the query returns; a paid,
not-yet-entitled lesson's metadata (title/description/item count) IS
returned, matching "Preview, precisely" (docs/handoff.md). Verified over a
real HTTP request against a local seeded stack (`play-006-smoke`, which has
one lesson of each: free, paid, draft, archived, broken) — the rendered page
showed free/paid/broken (3 of 5) and correctly omitted draft/archived,
with progress reading `0/3` (matching the 3 visible lessons, not the 5
seeded ones).

**3. `next.config.ts`'s image `remotePatterns` protocol is now derived from
`NEXT_PUBLIC_SUPABASE_URL` instead of hardcoded `"https"`.** The course
page's cover image is the first thing in this codebase to actually exercise
`next/image` against a locally-seeded course row, and a local `supabase
start` stack serves over plain http — the hardcoded `"https"` made
`npm run budget` (and any local dev check of a course page) unrunnable
against local data, full stop, independent of anything this card built.
Since the hosted project's URL is always `https://...`, this changes nothing
in production; it only stops rejecting the one case (local dev) that used to
always fail. `scripts/seed-local-fixtures.ts`'s two `cover_image_url` values
were also fixed for the same reason — they were a hardcoded
`"https://example.com/cover.png"`, which isn't the configured Supabase host
at all (a second, independent way for the exact same 500 to fire) and would
have broken AUTH-008's admin cover preview too, if that had ever been
exercised against a local stack. Now `` `${url}/storage/v1/object/public/
lesson-images/fixture-cover.png` ``, matching the actual seeded host; the
object need not exist at that path, since `next/image` only validates the
URL's shape server-side, not that the file is fetchable.

**4. `npm run budget`'s course-page route imports
`LESSON_HEADER_COLUMN_CLASS` from `@/app/components/lesson-player/
columnLayout` directly, not the `@/app/components/lesson-player` barrel.**
First measurement came back at 274.3 KB against a 200 KB target — over
budget. The barrel also re-exports `LessonPlayer` and `practiceRenderer`
(PLAY-012's five per-type practice renderers plus dnd-kit), neither of which
this route uses or renders; importing only the one named export it needs
still pulled the whole graph into the bundle (unused-export tree-shaking
didn't eliminate it). Switching to the direct module path dropped the
measurement to 173.3 KB — a 101 KB difference from one import statement,
confirmed by a real before/after `npm run budget` run, not inferred.
`app/(colloquiz)/(main)/app/admin/lesson-player-demo/page.tsx` has the exact
same barrel-only-for-the-constant pattern and likely carries the same latent
weight, but it's a Colloquiz admin route outside the OPS-006 budget guard's
scope — left alone; not this card's job to fix silently.

**5. `scripts/budget.ts`'s new `/courses/future-imperfect` entry: 182 KB
(173.3 KB measured + ~4.5% headroom, the PLAY-012/docs/decisions/0057
precedent), `guardForbiddenSignatures: true`.** Full measured table from the
final run:

```
/login                                      | 283.3 KB | 380 KB
/courses/future-imperfect/true-or-false     | 256.5 KB | 260 KB
/courses/future-imperfect/applied-practice  | 282.7 KB | 290 KB
/courses/future-imperfect                   | 173.3 KB | 182 KB
All routes within budget.
```

## What would make us revisit it

- The moment either ANON-002 or ANON-003 lands, this page needs one change:
  build a real `AttemptsByLessonSlug` map and pass it to `courseProgress()`/
  `bestScoreForLesson()` instead of `{}`. If that turns out to need more than
  a call-site change, Decision 1's "pure function over an explicit map" shape
  was wrong and should be revisited then, not patched around.
- If `lesson-player-demo/page.tsx` (Decision 4) is ever touched for an
  unrelated reason, fix its barrel import too rather than leaving two
  instances of the same latent leak.
- If OPS-010 publishes `future-imperfect` for real, re-measure rather than
  assuming 182 KB still holds (same caveat 0056/0057 already state for the
  lesson-page budgets).
