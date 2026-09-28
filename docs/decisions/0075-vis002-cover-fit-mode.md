# 0075 — VIS-002: cover dialog fit mode, display-based size rule, live preview

**Supersedes 0074 §5 (Limits) in full.**

## Context — the trigger

The partner tried to use an 829×829 square photo as a course cover. VIS-001
(0074 §5) blocked any CROP below 960×540 source px and, below that, told her
to "zoom out". That advice was unliftable for this image: the crop is bound
by `aspect = 16/9`, so the largest 16:9 crop obtainable from an 829×829
source takes the full image height (829px) and is therefore 829×466 —
already below the 960-wide floor, and no amount of zooming changes that,
because zooming in only shrinks the crop further and there was no way to
zoom OUT past 1 (fill-frame). The image was unusable, and the dialog kept
telling her to do the one thing that couldn't fix it.

The root cause: the old rule measured the CROP the author drew — a quantity
she can't freely change for a non-16:9 source, since the crop is locked to
16:9 regardless of the source's own shape — instead of the OUTPUT width,
which is the thing that actually determines whether the cover looks sharp
where it's displayed, and which a fit mode (see below) can push much higher
for exactly this kind of source. This card replaces the crop-size floor with
an output-width rule, adds the fit mode that makes a square/portrait source
usable at all, and adds a live preview so the author sees the real output
before confirming.

## 1. Size bands move from crop size to output width

`coverCropQuality(crop)` (960×540 / 1600px-wide crop thresholds) is replaced
by `coverQuality(outputWidth)` (`lib/courseCover.ts`), evaluated on
`coverOutputSize(crop).width` — the size that is actually encoded and
uploaded, not the crop rectangle. Four bands, not three:
`too_small` (<480) / `soft` (480–799) / `phone_ok` (800–1599) / `ok` (≥1600),
via `COVER_QUALITY_THRESHOLDS`. `480` and `1600` are derived from where a
cover actually renders — `lib/courseCover.ts`'s own header comment on
`COVER_QUALITY_THRESHOLDS` cites `CourseCard.tsx`'s and the course page's
`sizes` attributes and does the reasoning; not restated here. `COVER_MIN_CROP`
and `COVER_RECOMMENDED_MIN_WIDTH` are gone.

## 2. Fit mode: zoom can go below 1

`coverFitZoom(natural)` (`lib/courseCover.ts`) returns the react-easy-crop
zoom at which the WHOLE image fits inside the 16:9 frame (`min(r, 1/r)` where
`r = (natural.width/natural.height) / (16/9)`), passed as the cropper's
`minZoom` — so the author can zoom out past "fill the frame" (zoom 1) down to
"show the whole source" (zoom `fitZoom`), and no further; the source is never
upscaled, because `coverOutputSize` never exceeds the crop's own dimensions
(0074 §5's "never upscaled" rule is untouched, just evaluated on whatever crop
the new minimum allows). `restrictPosition={zoom >= 1}` on the `Cropper`:
position is only clamped to the image bounds while the crop is fully within
the source (zoom ≥ 1, the pre-existing fill-frame behaviour); below that,
free positioning is required for the crop to be centrable over an image
smaller than the frame.

Verified against the REAL library, not just derived analytically: at
`zoom = fitZoom` on the 829×829 image, react-easy-crop reported
`croppedAreaPixels = {x: -322, y: 0, width: 1474, height: 829}` — an exact
match to what `coverFitZoom`/`coverDrawPlan` predict for that input. That same
crop is what smoke test (a) below carried all the way to a stored file:
`coverOutputSize({width: 1474, height: 829})` → `{width: 1474, height: 829}`
(under the 1920 cap, so unscaled), and the object actually uploaded decoded
(via `sharp`) to exactly `jpeg 1474×829` — the formula's prediction confirmed
end to end, not just at the crop-rectangle stage.

## 3. Blurred fill for the area the source doesn't cover

Once the crop can extend past the image bounds, something has to render in
the gap — left blank/white there would look broken, especially for a landing
page catalogue card. `drawCover` (`lib/courseCoverCanvas.ts`) fills it with a
blurred, darkened copy of the WHOLE image, object-cover'd into the frame:

- The blur is NOT `ctx.filter = "blur(...)"` — canvas filter support is
  uneven across browsers (notably Safari), so this repo doesn't rely on it.
  Instead the whole image is drawn into a ~32px-wide offscreen canvas (object-
  cover, same aspect-fit idea as the main crop) and that tiny canvas is then
  drawn back up to full frame size — shrinking to a handful of pixels and
  magnifying them back up IS the blur, cheaply, with no browser-specific API.
- A flat `rgba(0, 0, 0, 0.25)` rect is drawn over the blurred backdrop
  afterward, so the sharp foreground image (drawn on top, per `coverDrawPlan`)
  reads clearly against it regardless of the backdrop's own colours.
- A solid-colour fill (sampling a dominant colour, or a fixed neutral) was
  considered and NOT built — a blurred copy of the same image reads as
  "the same photo, softly extended" in every case, with no colour-sampling
  logic and no risk of clashing with the sharp foreground; a flat fill would
  need that extra logic for a worse result.

## 4. The 400×400 test case in the original acceptance was a spec error, not a bug

The manual-smoke list called for "a 400×400 image: blocked with 'Pick a
larger image' and no 'zoom out'". Driving the real dialog shows a 400×400
square image never reaches that state:

- At the default zoom (1), react-easy-crop's fill-frame crop for a square
  source is `{width: natural.width, height: natural.width / (16/9)}` — for
  400×400 that's a 400×225 crop, output width 400 → `too_small`. Since
  `zoom(1) > fitZoom(0.5625)`, the message correctly reads "…Zoom out" —
  zooming out would still help.
- At `fitZoom` (the minimum reachable zoom), the crop grows to
  `{width: natural.height × 16/9, height: natural.height}` — for 400×400 that
  is 711×400, output width 711 → `soft`, not blocked at all.

A square image only lands in the true "blocked at minimum zoom, no further
help available" state when `natural.height × 16/9 < 480`, i.e.
`natural.height < 270` (270 × 16/9 ≈ 480). Verified against both:

- **400×400** — default zoom: `too_small`, "…Zoom out", Confirm disabled.
  Zoomed to fit: `soft`, "…Saved at 711×400px.", Confirm enabled.
- **250×250** — zoomed to fit (`fitZoom = 0.5625`, same as 400×400 since both
  are square): output width `250 × 16/9 ≈ 444` → `too_small`, "Pick a larger
  image." (no "Zoom out" — `zoom === fitZoom`, there is nowhere further to
  zoom out to), Confirm disabled.

The message logic (`zoom > fitZoom` → suggest zooming out; `zoom === fitZoom`
→ suggest a larger image) was correct as designed; the acceptance line's
choice of 400×400 as a "blocked" example just didn't hold, once the real
crop-size relationship for a square source was measured instead of assumed.
No code changed as a result of this — it's a correction to the manual-test
plan, not a fix.

## 5. One drawing routine for upload and preview

`drawCover(canvas, image, crop, size)` (`lib/courseCoverCanvas.ts`) is the
only place pixels get composited — `renderCover` (the upload path) and the
dialog's catalogue-card-sized live preview both call it, at different `size`s
(scaling `coverDrawPlan`'s `dest` rectangle by `size.width / plan.output.width`
so the same plan draws correctly at either size). The preview cannot drift
from the upload because there is no second implementation to drift.

## Evidence

- `npm run check` exits 0; `npx vitest run lib/courseCover.test.ts` — 25/25
  (coverQuality boundaries at 479/480/799/800/1599/1600; coverFitZoom for a
  16:9/square/portrait/panorama source; coverDrawPlan for a fully-inside crop,
  the 829×829 fit case, a crop wider than the 1920 cap, and a crop entirely
  outside the image).
- `rg -c "react-hooks/set-state-in-effect"` unchanged at 1 occurrence per file
  (`AppearanceSection.tsx`, `CoverCropDialog.tsx`) — both are comments
  explaining why an effect was avoided, not suppression directives; no new
  effect-driven state was added.
- Manual smoke, driven via Playwright (Edge, headless) against a throwaway
  admin user and a throwaway draft course on the real cloud project, both
  deleted after:
  - **a.** 829×829 chessboard PNG → "Fit whole image" → preview shows the
    whole board over its own blurred fill (screenshot) → Confirm → Save →
    stored object decoded with sharp: `jpeg 1474×829` (matches
    `coverDrawPlan`'s prediction exactly). Opened and looked at — chessboard
    centred, blurred/darkened copy of itself fills both sides.
  - **b.** 4000×2250 photo (exactly 16:9 — `fitZoom = 1`): fit/fill buttons
    correctly hidden (`fitZoom === 1`). Zoom slider set to 3 (crop width
    4000/3 ≈ 1333) → `phone_ok`, "…Saved at 1333×750px.", Confirm enabled.
  - **c1.** 400×400 — see §4 above; both states observed as predicted.
  - **c2.** 250×250 — see §4 above; blocked state genuinely reached, "Pick a
    larger image" with no "Zoom out" shown, Confirm disabled.
  - **d.** Every scenario above except (a) was cancelled, never confirmed.
    Storage listing before/after: 3 → 4 top-level entries (only the one new
    course's folder, from (a)'s single confirmed upload); `courses` row count
    2 → 3 (the throwaway course itself, deleted after). No other objects were
    created — cancelling never uploads, by construction (upload only happens
    in `handleConfirm`).
  - **e.** The draft course's own og:image (fetched with the admin session,
    which can read a draft course via the "courses: editor read" RLS policy)
    returned `200 image/png`, decoded to `1200×630`, and visibly shows the
    fitted chessboard cover with its blurred sidebars composited in.
  - Mobile-width (390px) check: cropper, zoom slider, preview and the
    Confirm/Cancel footer are all reachable by scrolling the dialog
    (screenshots before/after scroll).
  - Cleanup: throwaway course row and its one storage object deleted; the
    throwaway admin user deleted. `courses` count back to 2, storage
    top-level entries back to 3 — printed and confirmed after cleanup.

## What would make us revisit it

- If the partner's own uploads regularly land in `soft`/`phone_ok` rather
  than `ok`, the thresholds (or the render sites' `sizes` attributes they're
  derived from) may need re-deriving.
- If a future render site needs a cover wider than 1024 CSS px at a breakpoint
  narrower than today's, `COVER_MAX_OUTPUT_WIDTH` (1920) and
  `COVER_QUALITY_THRESHOLDS.phoneOkBelow` (1600) both need re-checking against
  the new site, the same way this card re-derived them from the two sites
  that exist today.
