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
- **Two widths, decided per block type: "reading" (prose measure) and "wide"
  (full column)** — chosen. `table`, `image` and `video` get the full column
  (that's exactly the content that was clipping or wasting space); every other
  theory block, every practice block, the progress banner and the per-block
  explanation lines stay at reading width, centred inside the column. This
  keeps the "breakout" look of a wide table sitting past the text edges on
  either side, which is deliberate here — pending a look in an actual browser
  (see the DevTools checklist handed to the user for this task).
- **Where the per-block decision lives** — a block stays width-agnostic
  (no width class inside `ProseBlockView`, `TableBlockView`, etc.); a new pure
  function, `lessonBlockWidth(block)` in `lib/lessonPlayer/blockWidth.ts`,
  maps a `LessonBlock` to `"reading" | "wide"`, exhaustive over the union with
  a `never` fallback (same shape as `TheoryBlockRenderer`'s dispatch), unit
  tested per type. `LessonPlayer.tsx` reads that function's result and adds
  the width wrapper class — the block components themselves never know their
  own width.
- **Where the class strings live** — one small module,
  `app/components/lesson-player/layout.ts`, exporting full literal Tailwind
  class strings (`LESSON_COLUMN_CLASS`, `LESSON_HEADER_COLUMN_CLASS`,
  `READING_WIDTH_CLASS`, `THEORY_BODY_TEXT_CLASS`) rather than composing
  classes at runtime — Tailwind only picks up complete class names from
  source. `PreviewClient` and the demo page both import
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

Two widths, decided per block type by `lessonBlockWidth()` and applied as a
wrapper class in `LessonPlayer.tsx`, never inside a block component. Wide:
`table`, `image`, `video`. Reading (`w-full lg:max-w-2xl lg:mx-auto`):
everything else, including every practice block. The player's own column
grows `max-w-xl` → `lg:max-w-5xl`; `PreviewClient` and the demo page align
their headers to that same column width via a shared constant. Below `lg`
(1024px) every new class is `lg:`-prefixed, so rendered output at 360px is
unchanged from pre-change master. A `text-sm lg:text-base` experiment on
theory body text is included, isolated to `THEORY_BODY_TEXT_CLASS` for a
one-line revert.

## What would make us revisit it

- PLAY-010 giving practice blocks (especially `matching`) their own wide
  layout — at that point `lessonBlockWidth()` gains a case (or a per-item-type
  distinction) rather than practice staying uniformly "reading".
- The owner rejecting the `text-base` experiment in the browser — revert
  `THEORY_BODY_TEXT_CLASS` to `"text-sm"` in `layout.ts`, no other file
  changes.
- The breakout look (wide blocks sticking out past the reading column on both
  sides) reading as broken rather than intended once seen in a real browser —
  would need either a wide-block max-width narrower than the full column, or
  a visual treatment (a rule, a background tint) that makes the breakout read
  as deliberate.
