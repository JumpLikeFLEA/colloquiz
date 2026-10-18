# 0174 — VIS-004: the sticker digits roll and the start button sparks (React Bits)

Status: built. The owner chose "option 1" of the React Bits study on 2026-10-18
(draft: https://claude.ai/artifact/7eYyjZAc9WBL6M3wm3em94#v1). This is the first
React Bits code in the repo, so this file also settles how it is vendored; VIS-005
(ShapeGrid) follows the same rule.

## Context

The landing's "10–15" sticker (SHELL-027, 0165 Decision 9) was server-only text. The
owner wanted its digits to roll, and "Start for free" to throw sparks when pressed.
React Bits ships both as copy-in components: `Counter` and `ClickSpark`.

## Decisions

1. **Vendored verbatim, pinned.** `app/components/react-bits/` holds `Counter.tsx` and
   `ClickSpark.tsx` from github.com/DavidHDev/react-bits at commit
   `310fc737fadcaa149a4e06fb088fc95332dc8bfb` (`src/ts-tailwind/Components/Counter`,
   `src/ts-tailwind/Animations/ClickSpark`), plus upstream's `LICENSE.md` (MIT +
   Commons Clause, © 2026 David Haz) beside them. Neither file imports anything but
   React, so no dependency was added (`package.json` is unchanged). Files were fetched
   from `raw.githubusercontent.com` at that commit and copied byte for byte; the
   working-tree bytes were compared with `cmp` before commit, and the committed blobs
   against the same URLs after it (evidence comment on #250). Never edit them in place:
   re-vendor from a new commit, and say so here.

   The Commons Clause forbids selling, sublicensing or redistributing the components
   themselves. Using them inside this application is what the licence allows. This repo
   is not published; if it ever is, or a template or kit is made from it, re-read the
   licence first.

2. **Lint and the hex guard treat the folder like `ui/**` and `figma/**`.**
   `eslint.config.mjs` lists `app/components/react-bits/**` in `globalIgnores`
   (upstream assigns refs during render, which `react-hooks/refs` rejects, and
   re-vendoring would undo any fix). `scripts/check-hex-literals.mjs` exempts it
   (ClickSpark carries `#fff` / `#ffffff` defaults). `tsc --noEmit` still covers it
   and passes unchanged. Nothing of ours imports from it except `StickerFigure.tsx`
   and `SparkCta.tsx`.

3. **No colour default of a vendored file is ever used.** Every colour is passed in
   from a token or inherited:
   - Counter: `textColor` keeps upstream's default `inherit`, which is the sticker's
     `--highlight-foreground`. No colour literal is involved.
   - ClickSpark: `sparkColor` is the resolved `--brand-text`, read from the page at
     runtime. Until it has a value (server render) `disabled` is set, so the upstream
     default (white) cannot appear.

4. **Sticker (`StickerFigure.tsx`).** `sticker.figure` stays in `landingCopy` ("10–15");
   the component splits it at the dash into two `Counter`s with the dash between them,
   and any other shape falls back to plain text. Settings from the card: `fontSize`
   18px below 640px and 22px from 640px (both counters take `fontSize="inherit"` and the
   wrapper carries `text-[18px] sm:text-[22px]`, so the breakpoint is ordinary CSS),
   `fontWeight` 800, `duration` 1.1 s and 1.3 s, `stagger` 0.08, `intro` on. Settings the
   card does not list keep upstream's defaults (`fade` 0.3, `bounce` 0.2, `motionBlur`
   on, `tabular` on, `locale` en-US, so the digits are Latin in both languages).
   Counter renders its final digits on the server and its intro spins each digit one
   full turn back onto the same value, so the pre-hydration markup already reads 10–15.
   The visual row is `aria-hidden` and one `sr-only` span says "10–15", so a screen
   reader reads the figure once, then the unit.

5. **Sparks (`SparkCta.tsx`).** Both `primaryCta` buttons (hero and closing card) are
   one element, so one wrapper covers both. Settings: `sparkCount` 10, `sparkRadius` 34,
   `sparkSize` 12, `duration` 520; everything else is upstream's default (shape `line`,
   easing `ease-out`). The colour is read with `useSyncExternalStore`: it subscribes to
   `prefers-color-scheme` and to class changes on `<html>` (the layout's inline script
   toggles `.dark`), and reads `--brand-text`. It is `#5b3fd9` in light and `#a595ea` in
   dark (`.surface-alina`, app/globals.css), checked in the canvas pixels below.

6. **The wrapper changes nothing else.** ClickSpark's root is
   `div.relative.isolate.h-full.w-full`; `SparkCta` adds `flex h-auto! w-auto!` so the
   wrapper shrink-wraps the link and leaves no line-box gap. It adds no
   `preventDefault` or `stopPropagation` (read in the vendored source), so navigation is
   the link's own.

7. **The sticker is no longer server-only.** This supersedes 0165 Decision 9 for the
   sticker only: the rest of `ComicPanel` is still a Server Component with no client
   JS, and `ComicPanel`'s header comment says so. `/` now ships Counter and ClickSpark.

## Measurements

All printed by the scripts named; the browser was Edge (Playwright, `channel: msedge`),
the data the hosted catalogue (read-only, as `/` in `scripts/budget.ts` already does).
There is no local Supabase stack on this machine (Docker is not installed).

- **Box unchanged.** The bounding box of both CTA links, and the page's scroll height,
  before (changes stashed) and after, at 360, 390, 768, 1024 and 1440 px in EN and RU:
  identical in all 10 viewports (0 differences).
- **Sticker fits.** In unrotated layout the content block (figure + unit) has its
  farthest corner inside the circle at every width and language: 88 px circle at 360
  and 390 (38.1 px of 42 in EN, 37.2 in RU), 112 px circle at 768, 1024 and 1440
  (46.5 px of 54, both languages). Computed font size and weight read 18px/800 at 360
  and 390, 22px/800 from 768. `scrollWidth/innerWidth` 360/360, 390/390, 768/768,
  1024/1024, 1440/1440 in EN and RU. `npm run viewport360` on `/` EN and RU: 360/360.
- **The roll.** At 1440 it rolls from load and stops after about 2.5 s, and does not
  replay after scrolling away and back. At 390x500, where the sticker starts below the
  fold, it does not move for 2 s (1 distinct frame), rolls when scrolled to half in
  view (24 frames), and does not replay on a second visit (1 frame). With
  `prefers-reduced-motion: reduce`: no roll (1 frame).
- **Spark colour.** Canvas pixels while the button is held: light `rgb(91, 63, 217)`
  (= `#5b3fd9`), dark `rgb(165, 149, 234)` (= `#a595ea`). Under reduced motion the
  burst is the component's own reduced form: it is gone by the third sample (~330 ms)
  and never moves outward.
- **How long the sparks show before the lesson replaces the landing** (production
  build, local `next start`, hosted database; time from `pointerdown`, 3 runs per case,
  throwaway Playwright scripts, not committed): a mouse press replaces the landing after
  443 to 478 ms (hero) and 446 to 466 ms (closing); a tap after 432 to 445 ms and
  436 to 473 ms.
  The canvas goes with the page, so a burst is cut at that moment, about 80% of its
  ~540 ms life. One run in 12 took 1258 ms (a slow first fetch) and the burst finished
  in full (542 ms). Pressing and navigating are not delayed by the sparks: the lesson
  URL was reached 423 to 477 ms after the press in the 11 ordinary runs. Mouse sparks
  start at `pointerdown`, touch sparks at `click` (3 to 6 ms after the tap), as
  ClickSpark is written.
- **Budget** (`npm run budget`, before and after, same machine and tree except this
  change): `/` 177.9 KB to **184.5 KB** (+6.6 KB gzip), over its 180 KB budget, as the
  card allowed until OPS-028. `/login` 287.9 / 287.9, the free lesson 257.2 / 257.2, the
  drag lesson 285.1 / 285.1, the course page 173.8 / 173.8, `/invite/…` and `/join/…`
  177.0 / 177.0. Four seed-dependent routes FAIL on hosted before and after, for the
  reasons the script prints (404 on the cohort fixture; the fixture learner cannot sign
  in); they need the local stack, which is not available here.

## What would make us revisit this

- `/` stays over budget after OPS-028, or a phone's measured load grows (OPS-028 adds a
  phone entry).
- A new upstream commit changes Counter's or ClickSpark's props; re-vendor and redo the
  fit and box checks.
- The owner wants the sparks to survive the navigation. They cannot with the
  client-side route change as it is: they live on the landing's DOM.
- The roll reads as a distraction to the partner; `intro={false}` turns it off in one
  prop.
