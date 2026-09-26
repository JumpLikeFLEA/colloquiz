# 0058 — PLAY-007: lesson completion screen

## Context

PLAY-007's acceptance asks for a completion screen that shows the lesson
score, an explanation review, a next-lesson link, a slot for the ANON-004
registration offer, and Russian chrome — plus a specific concern: the
per-type `next/dynamic()` renderers PLAY-012/0057 introduced are all
`ssr: true` with no `loading` fallback, so an in-app navigation to the next
lesson (via this screen's own link) could show a blank practice block if its
chunk isn't already cached client-side.

Three things needed a call that the issue body left open.

## Decision 1 — the completion screen is an unconditional footer, not a gated "finished" state

`LessonPlayer` renders every block of a lesson on one scrolling page — it is
not a stepper/wizard, and there is no existing signal for "the learner has
reached the end." Building one (e.g. an IntersectionObserver on the last
block, or a synthetic "last block attempted" check) would be new state
serving no other purpose, and would sit awkwardly next to
docs/handoff.md's "no locks and no forced order" / "one attempt is
sufficient" — there is no single "the lesson is done" moment when a learner
may skip freely and revisit later.

`LessonCompletion` is therefore rendered unconditionally after the last
authored block, the same way the existing progress banner above it already
updates live rather than appearing at a discrete "done" moment. Its score
line only renders once `scoreSession(...).status === "scored"` (i.e. at
least one item has been attempted); its review section only renders once at
least one wrong sub-part exists. Nothing is hidden behind a completion
gate — an unattempted lesson's footer is just the heading plus, once one
exists, the next-lesson link.

**What would make us revisit it:** if a future card turns the player into a
real multi-screen flow (e.g. one block per screen), a genuine "reached the
end" event would exist and the footer could move behind it instead.

## Decision 2 — the review section duplicates inline explanation text, and that's fine

`explanationsForSession` (lib/lessonPlayer/session.ts) and each per-type
renderer's own inline `resolveExplanations` call (0053) resolve the exact
same underlying data — a wrong sub-part's explanation is therefore now
shown twice: once behind its own collapsed inline "Why?" (0053, unchanged),
and once, always visible, in the completion footer's consolidated review.
This is deliberate, not incidental: the value of an end-of-lesson review is
precisely that it doesn't require re-scrolling and re-opening every row's
own disclosure. `LessonPlayer.test.tsx`'s five existing inline-explanation
tests were scoped to a new `data-testid="lesson-blocks"` wrapper (a
`display: contents` div around the authored-block map, chosen so it adds no
extra flex child and therefore doesn't disturb `LESSON_COLUMN_CLASS`'s
`gap-4`) so they keep asserting only about the inline copy and aren't
confused by the second one.

**What would make us revisit it:** if a partner/learner review finds the
duplication confusing in practice, the review section could instead link
back to each wrong block (scroll-to) rather than repeating the text.

## Decision 3 — the PLAY-012/0057 chunk-flash concern: `loading` fallback, not a measured prefetch verification

The issue offered two options: (a) give the five `dynamic()` calls in
`app/components/lesson-player/practice/index.tsx` a height-reserving
`loading` fallback, or (b) verify, on a throttled network with a printed
result, that `<Link>` prefetch already fetches the next lesson's renderer
chunk(s) before the tap.

(a) was picked. (b) would require a real throttled-network measurement
harness (devtools protocol network throttling + a printed before/after) that
0057's own addendum explicitly did not build ("outside this issue's
SSR-cold-load acceptance and not measured here") — and even a favorable
measurement would only show prefetch usually wins the race, not that it
always does (slow connections, a `<Link>` that scrolls past viewport before
prefetch fires, back/forward navigation that skips prefetch entirely). A
`loading` fallback is unconditionally correct rather than probabilistically
likely, and is a two-line change per renderer.

The fallback (`PracticeRendererLoading` in `practice/index.tsx`) is a plain
pulsing box with no text — not `PracticeBlockPlaceholder` (which reads
"Practice item (…) — renderer not yet available" in English), since that
copy is meant for a genuinely-missing renderer, not a loading flash on a
Russian-chrome surface where any visible English would be a copy bug
mid-transition.

**What would make us revisit it:** if a future measurement shows `<Link>`
prefetch reliably wins in practice, the `loading` fallback still costs
nothing to keep (it never displays on a warm cache) — there's no ROI case
for removing it.

## Also touched

`lib/publicLesson.ts` gained `ordinal`/`courseId` on the `"ok"` variant and a
new `getNextLesson(courseId, afterOrdinal)`, deliberately NOT calling
`can_read_lesson` — the next-lesson link is metadata-only (title/slug), same
privacy level as the title/description `getPublicLesson` already shows for a
paid, un-entitled lesson's `"not_available"` state. Entitlement for the
*destination* lesson is still decided exactly once, by that lesson's own
page load — this link does not pre-decide it.

## Proposed new card

`LessonPlayerBody`'s progress banner ("Progress: X% (…)") is hardcoded
English on a surface whose whole learner-facing chrome is specified as
Russian (docs/handoff.md, 2026-09-24 delta). Found while building this
card's Russian score line right below it; left as-is since fixing it wasn't
in PLAY-007's acceptance and it predates this card. Proposed: a small card to
move that banner's copy into `lib/alliengll/copy.ts` (a `player.progress`
or similar key already partially covered by the unused `player.*` group).
