# 0175 — VIS-005: living grid paper on computers (React Bits ShapeGrid, patched)

Status: built. The owner chose it on 2026-10-18 from the draft
https://claude.ai/artifact/7eYyjZAc9WBL6M3wm3em94 ("exactly as in the draft"); VIS-004
(0174) set the vendoring rule this card follows, and the owner told this session to treat
VIS-004 as done although its card is not closed.

## Context

The landing is grid paper (`.grid-paper`, 25px cells). On a computer the owner wants the
paper to drift slowly, light the cell under the cursor and ripple about eight cells out
from a click on empty paper. A phone keeps the still CSS grid and must not download any
of the code (0156, the performance boundary in `docs/handoff.md`).

## Decisions

1. **ShapeGrid is vendored like Counter and ClickSpark (0174 Decision 1 to 3), with exactly
   two patches.** `app/components/react-bits/ShapeGrid.tsx`, from
   `src/ts-tailwind/Backgrounds/ShapeGrid/ShapeGrid.tsx` at commit
   `310fc737fadcaa149a4e06fb088fc95332dc8bfb`, fetched from raw.githubusercontent.com. The
   folder is already unlinted and out of the hex guard; the file has no colour literal that
   we use (every colour is passed in). Unlike the other two it is not byte for byte: a
   header comment says so and each patch is marked `PATCH 1` / `PATCH 2`. A `diff -u`
   against the fetched upstream (pasted in the card's evidence) shows these and nothing
   else:
   - **Patch 1, `cascadeReach?: number`.** The ripple's radius in cells. Upstream sets a
     click's reach to the viewport diagonal in cells (about 70 at 1440x900), so a click
     rings the whole screen. When the prop is set, `onDown` uses it instead.
   - **Patch 2, `ignoreSelector?: string`.** A `pointermove` whose target is inside a match
     counts as the pointer leaving (`inside = false`, no glow). A `pointerdown` inside a
     match starts no ripple. ShapeGrid listens on `window`, so this is the only way for
     controls to stay quiet while the layer itself is `pointer-events: none`.
   Re-vendor from a new commit rather than editing further, and redo both patches.
2. **Settings are the draft's, verbatim:** square, `cellSize` 25 (one `.grid-paper` cell),
   `lineWidth` 1, diagonal, `speed` 0.18, `fillOpacity` 0.14, `trail` 0.5, `glow` 0.12,
   `radius` 1.4, `fade` 0, `clickCascade` on, `cascadeReach` 8, `intro` off, transparent
   canvas. Read from the draft's bundle, not retyped from the card.
3. **Colours.** `lineColor` is a new token `--grid-line-live` (`#e6e4f0` light, `#2c2844`
   dark, in `:root` and `.dark`); the still grid keeps `--grid-line`. `hoverColor` is the
   resolved `--brand-text`. A canvas cannot read a variable, so `PaperLayer` resolves both
   from `<html>` at mount and again when the scheme changes. The subscription
   (`prefers-color-scheme` plus `.dark` class changes on `<html>`) was `SparkCta`'s; it moved
   to `app/(english)/schemeStore.ts` and both use it, with no change to `SparkCta`'s
   behaviour. The ground is the layer's own `bg-paper` (`--paper`), not a canvas fill.
4. **Placement.** One `fixed inset-0 -z-10` layer with `pointer-events: none`, viewport
   sized, never document sized. For the page to show it, nothing painted on the page may
   cover it: while the layer is live the landing wrapper is transparent
   (`html[data-paper-live] .grid-paper[data-landing-paper]`), `page.tsx`'s `<main>` lost
   `bg-background` (redundant: `body` carries it, and it propagates to the canvas), and
   `FooterLayout`'s `<footer>` gained `bg-background` so the footer keeps its own ground.
   Nothing changes visually off the landing (`body` and the footer are the same colour).
5. **Quiet zones.** `ignoreSelector` is `a, button, input, select, textarea, label,
   summary, [role=button], [role=tab], [data-paper-quiet]`; `data-paper-quiet` is on the
   comic block (`ComicPanel`) and the closing card.
6. **The gate.** `LivePaper` renders `PaperLayer` only while
   `(min-width: 1024px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion:
   no-preference)` matches, through `next/dynamic` with `ssr: false`, so its chunk is not
   requested otherwise. Server render and first client render are both "off". The match is
   followed with `useSyncExternalStore`: leaving the range unmounts the layer, entering it
   fetches the chunk.
7. **Hand-over without a frame that shows both grids or neither.** The layer starts
   `invisible`. ShapeGrid's mount effect calls `resize()` and schedules a
   `requestAnimationFrame` whose callback draws; `PaperLayer`'s own effect runs after its
   child's, so the `requestAnimationFrame` it schedules runs after that draw, in the same
   frame. In that callback it removes `invisible` and sets `data-paper-live` on `<html>`
   (which makes the wrapper transparent). Both land in one style recalculation. A hidden
   tab runs no frame, so the still grid just stays. No third patch to ShapeGrid was needed
   to know when it had drawn.

## Measurements

Edge (Playwright, `channel: msedge`), a production build (`next build`, `next start`), the
hosted catalogue, 1440x900 unless stated. Scripts and screenshots (`handover-before.png`,
`handover-after.png`, `ripple-empty.png`, `press-*.png`, `glow-*.png`, `dark.png`) are
throwaway, in the session scratchpad, not committed.

- **A phone never downloads it.** Cold load of `/` at 390x844, `isMobile`, `hasTouch`:
  13 script chunks, 0 contain ShapeGrid (matched on the strings `hexagon` and
  `cascadeReach`); the page has 0 canvases, `scrollWidth/innerWidth` 390/390. At 1440x900:
  14 chunks, 1 contains it (`/_next/static/chunks/0uxdu25pogqhk.js`), 1 canvas. At 1440x900
  with `prefers-reduced-motion: reduce`: 13 chunks, 0 contain it, 0 canvases. At 1000x800:
  13 chunks, 0, 0 canvases.
- **Live gate.** At 1440 the layer is up (`data-paper-live`, 1 canvas); resized to 900x800
  it is gone with the still grid back (0 canvases, attribute absent, `backgroundImage`
  not `none`); back to 1440x900 it is up again.
- **Hand-over.** Every frame sampled from document start (179 frames, a `requestAnimationFrame`
  loop reading the layer's visibility and the wrapper's `backgroundImage`; the lazy chunk
  was delayed 2 s after `load` to give a real "before"): both grids 0 frames, neither 0
  frames, `data-paper-live` and layer visibility disagreeing 0 frames. The swap is between
  two consecutive samples (t 3120 and 3134 ms). Before/after screenshots: `handover-before.png`
  (still CSS grid, no canvas) and `handover-after.png`.
- **Clickable.** `elementFromPoint` at the centre of every link and button, scrolled into
  view: 12 of 12 hit the control (EN, RU, Log in, Courses, both Start for free, All courses,
  Instagram, YouTube, the course card, the footer's Colloquiz and Privacy links).
- **Quiet zones.** Counting canvas pixels that are lit (alpha 40 or more, not the pale line
  colour) within 45 px of the cursor, after parking the cursor on a quiet block for 3.3 s so
  trails fade and then jumping to the target: empty paper 63, over Courses 0, over Log in 0,
  over the comic block 0.
- **Ripple.** A click on empty paper: the farthest lit pixel over 1.5 s was 205 px = 8.2
  cells. Hovering without a click: 45 px = 1.8 cells. Pressing the hero "Start for free"
  and "All courses" (pointerdown, released elsewhere): 0 lit pixels, so sparks (VIS-004)
  and no ripple. Screenshots: `ripple-empty.png`, `press-hero-cta.png`, `press-all-courses.png`.
- **Dark.** A fresh load under `prefers-color-scheme: dark`: `.dark` on `<html>`, tokens
  `#2c2844` / `#a595ea` / `#17142a`, the layer's background `rgb(23, 20, 42)`; screenshot
  `dark.png`.
- **360px and 1440px.** `npm run viewport360` on `/`: 360/360. 1440/1440 in Edge. Nothing
  renders below 1024 except the `bg-background` changes, which paint what `body` already
  painted.
- **Cost, headed Edge on an NVIDIA GeForce GTX 1650 (`2d_canvas` and `gpu_compositing`
  enabled, read through `SystemInfo.getInfo`), context `deviceScaleFactor: 2`, so the
  canvas is 2850x1800 device px.** A Performance trace (`devtools.timeline`), 10 s idle
  and 10 s of mouse movement, counting `FireAnimationFrame` on the page's main thread
  (the only rAF user while nothing sparks):

  | window | calls | share of wall time | per call median / p95 / max |
  |---|---|---|---|
  | idle 10 s | 327 (32.6/s) | 1.5% | 0.44 / 0.75 / 1.27 ms |
  | mouse 10 s | 153 (15.3/s) | 1.5% | 0.96 / 1.44 / 1.75 ms |

  The main thread's total `RunTask` busy time was 4.3% idle and 4.9% with the mouse. The
  draw itself is on the GPU; the main thread pays for issuing it. The call rate is below
  60/s in this headed Playwright window; the cause was not investigated, so no claim is
  made about it. The mouse window also includes Playwright's own `mouse.move` round trips.
- **Hidden tab.** Playwright does not let a page become `visibilityState: hidden`
  (focus emulation keeps it `visible`, also with another tab brought to front), so a truly
  hidden tab was not measured. What was measured: with the window minimised the page ran
  5 and 6 frame callbacks in two 5 s windows (about 1 per second, the browser's occluded
  throttle; the trace counted 5 over 5 s), against 32.6 per second visible. ShapeGrid
  schedules only through `requestAnimationFrame` (read in the vendored source: no timer,
  no worker), and a hidden tab runs no `requestAnimationFrame` callbacks, so it draws
  nothing there; that second half is the browser's documented behaviour, not measured here.
- **Budget, `npm run budget`, same machine and tree except this change.** `/` 184.5 KB
  before (VIS-004's figure re-measured) to **192.6 KB** after, +8.1 KB gzip, where the card
  expected about +5. Every other route is unchanged (`/login` 287.9, the free lesson 257.2,
  the drag lesson 285.1, the course page 173.8, `/invite/...` and `/join/...` 177.0). The
  four seed-dependent routes FAIL before and after, as in 0174, for want of the local stack
  and its fixtures (no Docker on this machine). `/` is over its 180 KB budget until
  OPS-028 re-derives it, as the card allows; with this card it is 12.6 KB over. The file is
  vendored whole (eight shapes, tilt, rainbow, twinkle, none of which the landing uses), so
  the way to lower the figure is a smaller component, not trimming upstream; that is a
  decision for OPS-028 or a new card, not this one.

## What would make us revisit this

- The owner finds the layer heavy on a slower machine. `speed` 0 stops the drift, after
  which the grid redraws only when the cursor moves or a ripple plays (the card's own
  note); that is the owner's call.
- The call rate in the trace (32.6/s idle) turns out to be a throttle the owner's browser
  does not have, or the main-thread share is higher on another machine.
- A new upstream commit changes ShapeGrid: re-vendor, redo both patches, redo the quiet-zone
  and ripple measurements.
- `/` stays far over budget after OPS-028, or a phone's measured load grows (OPS-028 adds a
  phone entry).
- Another landing block needs to be quiet: add `data-paper-quiet`, nothing else changes.
