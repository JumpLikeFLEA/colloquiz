# 0057 — PLAY-012: per-type code-splitting, not near-viewport deferral

## Context

Before ranking PLAY-012 (docs/decisions/0056's proposed per-type
code-splitting card), the owner asked for the budget to be measured against
realistic content instead of a worst-case synthetic fixture, and for a real
printed comparison between two approaches before picking one:

- **(a) per-type code-splitting** — `practiceRenderer` only loads the
  renderer(s) a lesson's document actually uses, so a lesson with no
  `ordering`/`matching`/`slots` items never downloads their code or dnd-kit.
  Only helps lessons without drag items.
- **(b) near-viewport deferral** — defer loading ANY practice renderer until
  its block is about to enter the viewport (IntersectionObserver), with a
  height-reserving placeholder so nothing shifts. Helps every lesson's first
  screen, in theory, regardless of item type.

## What was measured

**Realistic content, not synthetic.** `scripts/seed-local-fixtures.ts`
(docs/decisions/0056 Decision 8) now also seeds `future-imperfect`'s actual
first lesson, `true-or-false`, read straight from
`authored/courses/future-imperfect.json` — never hand-copied. Its item type
is `selection_grid` (an 8-row true/false grid), the real first-lesson shape
CNT-004's importer would produce (the first lesson a course's `create_lesson`
RPC inserts is always the free sample, migration 044). `scripts/budget.ts`'s
route moved from the synthetic `play-006-smoke`/`free-lesson` fixture to
`/courses/future-imperfect/true-or-false`.

**Baseline, mobile viewport (390×844 — the audience arrives from a phone,
docs/handoff.md):** `next build && next start` against the local seed,
Chrome DevTools Protocol `Network.getResponseBody` on every downloaded
script, cross-referenced against source for package identity —

```
272.7 KB across 16 scripts
```

Identical to the synthetic fixture's own 272.7 KB measured for PLAY-006.
This is not a coincidence: the JS bundle's size is driven entirely by which
CODE modules a route's component tree pulls in, not by how much lesson TEXT
the document contains — the document itself streams down as RSC/HTML
payload bytes, which `scripts/budget.ts` deliberately does not count (it
sums `Network.loadingFinished` events typed `"Script"` only). A grep of the
downloaded chunks found `DndContext`/`useDraggable`/`useSortable`/
`sortableKeyboardCoordinates` present even though `true-or-false`'s only item
type, `selection_grid`, needs no drag interaction — `practiceRenderer`
(`app/components/lesson-player/practice/index.tsx`) statically imports all
five renderers unconditionally.

**(a) measured directly, not estimated from the grep.** `practiceRenderer`
temporarily rewritten to import only `SelectionRenderer`/
`SelectionGridRenderer` (the two types needing no drag interaction),
dropping `OrderingRenderer`/`MatchingRenderer`/`SlotsRenderer` and, with
them, dnd-kit — reverted immediately after measuring, `git status` clean
throughout both this pass and PLAY-006's earlier one. Rebuilt, re-measured
the same real route, same mobile viewport:

```
250.6 KB across 15 scripts   (-22.1 KB, -8.1%)
```

Identical saving to PLAY-006's own experiment on the synthetic fixture — for
the reason above (content-independent), this was expected once the first
number matched, and confirms the saving generalizes rather than being an
artifact of the synthetic content.

**(b) prototyped for real, not assumed to help.** A throwaway
`LazyPracticeSlot.tsx` wrapped the practice block in an
`IntersectionObserver` (`rootMargin: "0px"`) gating a `next/dynamic(() =>
import("./practice"), { ssr: false })` import, with a `minHeight: 200`
placeholder reserving space beforehand. Wired into `LessonPlayer.tsx`'s
practice-block call site, built, measured on the same real route and mobile
viewport, then fully reverted (`git status` clean, confirmed) —

```
276.3 KB across 18 scripts   (+3.6 KB, WORSE than baseline)
```

**Why it's worse, not merely unhelpful:** `true-or-false`'s practice block
is the THIRD of four blocks (heading, one short intro paragraph, the
practice grid, presumably a closing block) — short enough that it sits
within the initial viewport on a 390×844 phone screen with no scrolling.
The `IntersectionObserver` fires essentially immediately on paint, so the
`networkidle` wait this measurement (and any real user's initial page load)
depends on still includes the deferred import's network activity — nothing
was actually deferred, only routed through `next/dynamic`'s extra loader
machinery, which is why the total went up instead of down. **The one lesson
this measurement is actually about — a course's first, free-sample lesson,
which is the specific page a reel viewer opens (docs/handoff.md, "Audience
and language") — is exactly the shape where (b) cannot help**, because
short-theory-then-practice lessons put their first practice block above the
fold by construction (docs/handoff.md, "Structure inside a lesson is short
theory block, then a couple of exercises, repeated").

## Decision

**Pick (a) alone. Do not build (b).** Per-type code-splitting is a real,
measured, content-independent 22.1 KB saving with no observed downside.
Near-viewport deferral, prototyped and measured on the exact lesson this
budget exists to protect, made that lesson's real cold-load number WORSE,
not better — its theoretical benefit ("helps every lesson's first screen")
does not survive contact with how lessons in this catalogue are actually
structured. (a)+(b) together was on the table per the review note, but
there is nothing for (b) to add on top of (a) here: once dnd-kit and the
unused renderers are gone, this lesson has no further practice-renderer
weight left to defer.

**PLAY-012's acceptance is per-type code-splitting only:** `practiceRenderer`
dispatches to a lazy import per item type actually present in the parsed
document (not a blanket `next/dynamic` on the whole practice slot, which
Decision above shows can backfire), keyed off the document's own item types
so a lesson using `ordering`/`matching`/`slots` still loads correctly.
Acceptance: `/courses/future-imperfect/true-or-false` clears the 260 KB
target for real, proven with a printed `npm run budget` run; a second seeded
lesson that DOES use a drag item type (e.g. `future-imperfect`'s
`grammar-drilling` or `applied-practice`, both mixing `matching`/`ordering`/
`slots`) still renders and scores correctly with the split code loaded.

**Ranked immediately after the current Verify cards clear** (owner
instruction) — PLAY-012 is the top M2 pick once nothing is In Progress or in
Verify, ahead of PLAY-011/PLAY-007, since a permanently red `npm run budget`
trains sessions to stop reading it.

## What would make us revisit it

- If a future lesson shape puts practice content meaningfully below the
  fold (e.g. a long theory block before the first practice item, unlike
  every lesson sampled here), (b) may be worth re-measuring on THAT shape
  specifically — this decision is about the lessons that exist today, not a
  permanent verdict on deferred loading in general.
- If `next/dynamic`'s per-chunk overhead changes in a future Next version
  (the +3.6 KB here came partly from loader glue, not only from the failed
  deferral), the arithmetic in "Why it's worse" should be re-run before
  assuming it still holds.
- `scripts/seed-local-fixtures.ts`'s `future-imperfect` fixture is read
  live from `authored/courses/future-imperfect.json` — if that file's first
  lesson's item type or structure changes, re-run this measurement rather
  than trusting this file's numbers.
