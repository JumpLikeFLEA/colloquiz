# 0043 — Lesson player: adaptive content width on wide screens

## Context

`LessonPlayer.tsx` capped the whole player at `max-w-xl` (576px) regardless of
viewport, so on a 2560px screen roughly 70% of the width sat empty and
`TableBlockView` had to scroll a vocabulary table sideways inside that column
(`overflow-x-auto` + `min-w-max`, `TableBlock.tsx`). PLAY-010 already named
this cap as a problem for matching-item layout specifically; this was an
ad-hoc task (no board card) to widen the column itself, without touching any
practice-block layout — that redesign stays PLAY-010's job.

The preview screen (`PreviewClient.tsx`) and the internal demo page
(`lesson-player-demo/page.tsx`) each repeated `max-w-xl` by hand for their own
headers, so all three needed to move together or the preview's promise of
"exactly what a learner sees" would drift from the player's real column width.

## Options considered

- **Widen the whole column uniformly, no per-block distinction** — rejected:
  a wide viewport with a single long theory paragraph stretched to ~1024px
  reads badly; text measure has a comfort ceiling independent of screen width.
- **Three widths, decided per block type: "reading" (prose measure), "wide"
  (full column) and "fit" (content-sized, clamped)** — chosen. `image` and
  `video` get the full column ("wide") — that's exactly the content that was
  wasting space at a fixed intrinsic aspect ratio, so "wide" always helps.
  `table` got "wide" in the first pass of this decision, then was moved to
  its own "fit" band (owner review, 2026-09-26): a wide `table` always
  claiming the full column made even a small 2-column table stretch
  edge-to-edge, and the resulting "breakout" (table wider than the reading
  text on both sides) was more jarring for a small table than a large one.
  "fit" sizes the table to its own content instead, clamped between the
  reading floor and the column ceiling — see `FIT_WIDTH_CLASS` below. Every
  other theory block, every practice block, the progress banner and the
  per-block explanation lines stay at reading width, centred inside the
  column.
- **Where the per-block decision lives** — a block stays width-agnostic
  (no width class inside `ProseBlockView`, `TableBlockView`, etc.); a new pure
  function, `lessonBlockWidth(block)` in `lib/lessonPlayer/blockWidth.ts`,
  maps a `LessonBlock` to `"reading" | "wide" | "fit"`, exhaustive over the
  union with a `never` fallback (same shape as `TheoryBlockRenderer`'s
  dispatch), unit tested per type. `LessonPlayer.tsx` reads that function's
  result and adds the width wrapper class — the block components themselves
  never know their own width. `heading` is a "reading"-width block per this
  function, but `LessonPlayer.tsx`'s own `widthClassFor()` special-cases it
  to a dedicated `HEADING_WIDTH_CLASS` instead — see below.
- **Where the class strings live** — one small module,
  `app/components/lesson-player/columnLayout.ts`, exporting full literal Tailwind
  class strings (`LESSON_COLUMN_CLASS`, `LESSON_HEADER_COLUMN_CLASS`,
  `READING_WIDTH_CLASS`, `HEADING_WIDTH_CLASS`, `FIT_WIDTH_CLASS`,
  `THEORY_BODY_TEXT_CLASS`) rather than composing
  classes at runtime — Tailwind only picks up complete class names from
  source. First named `layout.ts`; `tsc` failed
  (`.next/dev/types/validator.ts`, "Property 'default' is missing... required
  in type `LayoutConfig`") because Next's App Router treats any file named
  exactly `layout.{js,jsx,ts,tsx}` anywhere under `app/` as a route-layout
  convention file, not just inside a route segment — renamed to
  `columnLayout.ts` to get out of that reserved name entirely. `PreviewClient`
  and the demo page both import
  `LESSON_HEADER_COLUMN_CLASS` (re-exported from the `lesson-player` barrel)
  for their headers instead of repeating the literal, so the three surfaces
  cannot drift apart again the way `max-w-xl` had.
- **`w-full` on the reading wrapper** — required, not cosmetic: the player
  column is `flex-col`, and a non-stretched flex child with `lg:mx-auto`
  shrinks to its content width instead of filling the row, which would leave
  a short block (a heading, a short callout, a practice card) left-aligned at
  content width instead of centred like the rest of the reading column.
  `READING_WIDTH_CLASS` is `"w-full lg:max-w-2xl lg:mx-auto"`.
- **A `text-sm` → `text-sm lg:text-base` experiment on theory body text** —
  included per instruction, isolated to one constant
  (`THEORY_BODY_TEXT_CLASS`) precisely so it can be reverted in one line
  without touching six files again if it reads wrong in the browser. Applied
  to every theory block's body text (`ProseBlockView`, `ListBlockView`,
  `CalloutBlockView`, `ExampleBlockView`, `TableBlockView`,
  `SelfCheckBlockView`'s prompt, checklist rows and model-answer box) but not
  to captions (`text-xs`, unchanged) or to `SelfCheckBlockView`'s response
  `<input>`/`<textarea>` (left at `text-sm` on purpose, so the block isn't a
  mix of a text-base prompt and a text-base-but-not-quite input; the inputs
  are form controls, not read content, and were excluded from the ask).
- **Heading centred at `lg`+, deliberately, via a dedicated wrapper class** —
  a left-aligned heading sitting directly above/below a wide block read as
  oddly offset (hanging over roughly the first third of the wider block below
  it), so a heading centres as a section title. The FIRST pass put
  `lg:text-center` directly on `HeadingBlockView`'s `<Tag>`; owner review
  (2026-09-26) moved it to the wrapper instead —
  `HEADING_WIDTH_CLASS = "w-full lg:max-w-2xl lg:mx-auto lg:text-center"` in
  `columnLayout.ts`, applied only to `heading` blocks by
  `LessonPlayer.tsx`'s `widthClassFor()`. This is not cosmetic reshuffling:
  centring the width DECISION at the same layer as every other width
  decision keeps `HeadingBlockView` width-agnostic like every other block
  component (the "blocks stay width-agnostic" rule this task started with),
  and it documents that the centring is deliberate policy for `heading`
  specifically, not something a future session could plausibly mistake for
  Tailwind's own shrink-to-fit text wrapping and "fix" away. `w-full` is
  required for the same multi-line reason as `READING_WIDTH_CLASS`: without
  it, a heading that wraps to two lines centres the BOX to its longest line's
  width rather than centring every line independently within the full
  reading measure.
- **`FIT_WIDTH_CLASS` for `table`** —
  `"lg:mx-auto lg:w-fit lg:min-w-[42rem] lg:max-w-full"`. `42rem` is
  deliberately the same figure as `READING_WIDTH_CLASS`'s `max-w-2xl` floor,
  so a sparse table (few short columns) sits at reading width like the prose
  around it, and a table that needs more room grows — up to the column's own
  ceiling (`max-w-full`, relative to the already-capped `lg:max-w-5xl`
  column) — before `TableBlockView`'s own `overflow-x-auto` + `min-w-max`
  (unchanged) takes over and it scrolls. No `w-full` on this one (unlike
  `READING_WIDTH_CLASS`/`HEADING_WIDTH_CLASS`): `w-fit` is the point — it's
  what makes the box size to its own content instead of stretching.
- **Practice blocks stay at reading width and unchanged internally** —
  PLAY-010's job is to redesign matching/practice layout for wide screens;
  giving it the wide column here (without a layout redesign to fill it) would
  just stretch the existing narrow-designed practice cards, which is worse
  than leaving them at reading width until PLAY-010 lands.
- **`ImageBlockView`'s `next/image` `sizes`** — updated from
  `"(max-width: 640px) 100vw, 640px"` to `"(max-width: 1024px) 100vw,
  1024px"` to match the new wide-block ceiling (the column's `lg:max-w-5xl` is
  1024px); left as an approximation of the column's true rendered width minus
  padding, not a pixel-exact measurement — flagged on the DevTools checklist
  for a check against upscaling.
- **No new `overflow` on any ancestor between the matching bank and the page
  scroller** — the width wrappers introduced here are plain `div`s with only
  `max-width`/`margin` classes, per docs/decisions/0039 Decision 5's
  requirement that nothing between `matching`'s sticky bank and the page
  scroller sets `overflow` to anything other than `visible`/`clip`.

## Decision

Three widths, decided per block type by `lessonBlockWidth()` and applied as a
wrapper class in `LessonPlayer.tsx`, never inside a block component. Wide
(no wrapper class, full column): `image`, `video`. Fit (content-sized,
clamped between reading width and the column):  `table`. Reading
(`w-full lg:max-w-2xl lg:mx-auto`, centred): everything else, including every
practice block. `heading` is reading-width by `lessonBlockWidth()`'s own
report, but gets a dedicated `HEADING_WIDTH_CLASS` (reading width plus
`lg:text-center`, deliberately, not a side effect) from `LessonPlayer.tsx`'s
own `widthClassFor()` wrapper. The player's own column grows `max-w-xl` →
`lg:max-w-5xl`; `PreviewClient` and the demo page align their headers to that
same column width via a shared constant. Below `lg` (1024px) every new class
is `lg:`-prefixed, so rendered output at 360px is unchanged from pre-change
master. A `text-sm lg:text-base` experiment on theory body text is included,
isolated to `THEORY_BODY_TEXT_CLASS` for a one-line revert.

## What would make us revisit it

- PLAY-010 giving practice blocks (especially `matching`) their own wide
  layout — at that point `lessonBlockWidth()` gains a case (or a per-item-type
  distinction) rather than practice staying uniformly "reading".
- The owner rejecting the `text-base` experiment in the browser — revert
  `THEORY_BODY_TEXT_CLASS` to `"text-sm"` in `columnLayout.ts`, no other file
  changes.
- The `image`/`video` breakout look (a wide image/video sticking out past the
  reading column on both sides) reading as broken rather than intended once
  seen in a real browser — `table` already moved off "wide" onto "fit" for
  exactly this reason; the same move (or a visual treatment such as a rule or
  background tint) would apply to `image`/`video` if they read the same way.
