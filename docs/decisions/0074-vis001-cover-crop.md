# 0074 — VIS-001: crop course covers to 16:9 on upload

## Context

Covers render at 16:9 in three places (admin preview, `CourseCard`,
`/courses/[slug]`), all `object-cover`, plus the per-course share image at
1200×630 (`OgImageCard`/`opengraph-image.tsx`). The upload path stored
whatever the author picked, untouched — any other ratio was silently
centre-cropped by CSS at render time, and a small source upscaled blurry.
This card lets the author choose the framing at upload time and stores an
image that already has the right shape and resolution, so every render site
agrees with what the author actually chose to show.

## 2. Destructive crop vs. a stored crop rect or focal point

Chosen: destructive crop. The uploaded file IS the framing — one URL, and
every render site (admin preview, `CourseCard`, `/courses/[slug]`, the OG
image) reads the same bytes and agrees. No schema change: `courses.cover_image_url`
is unchanged, still a single URL column.

Cost: re-framing later needs the original source image again — the crop
cannot be redone from the stored output, since the un-cropped pixels are
gone. A stored crop rect (or a focal point) over the original would let a
re-frame happen without a re-upload, at the cost of every renderer needing to
apply that rect/point itself instead of just `object-cover`-ing a finished
image. Rejected for this card: it multiplies the render-site count this card
exists to unify, for a re-framing need that doesn't exist yet (see
`docs/handoff.md`'s "Existing covers are not migrated; the author re-uploads
to reframe" — the same trade-off the backlog already accepted).

## 3. 16:9 as the single cover ratio

One ratio for every render site removes the "which crop for which context"
decision entirely. The OG image (1200×630) is not itself 16:9 (1200/630 ≈
1.905, vs. 16/9 ≈ 1.778) — it trims roughly 3.5% off the top and bottom of
the 16:9 master when Satori's `object-fit: cover` lays it under the card
text, per `OgImageCard`'s existing `objectFit: "cover"` on the `<img>`. That
trim is accepted rather than adding a second stored ratio: 3.5% off top and
bottom of a cover photo essentially never removes the subject.

## 4. Output format

JPEG, quality 0.85, width `min(crop width, 1920)`, never upscaled beyond the
crop, canvas filled white before `drawImage` (a transparent PNG source would
otherwise export with black where it was transparent) — all in
`lib/courseCoverCanvas.ts`.

WebP was the first choice (`toBlob("image/webp", 0.85)`, with a JPEG
fallback only for the rare browser that silently returns PNG from that
call) and was reversed at step 4c. Satori — `next/og`'s `ImageResponse`
renderer, which `OgImageCard` uses for the per-course share image — cannot
decode WebP at all. The dev log, verbatim:

```
Can't load image https://.../lesson-images/.../eeb3b8e7-cdef-4d79-a1e7-5b9f5bf4e0af.webp: Unsupported image type: image/webp
⨯ Error: failed to pipe response
    { [cause]: Error: Image size cannot be determined. Please provide the width and height of the image. }
```

HEAD requests against that same URL returned 200 regardless — only a real
GET reached the failing render — which is why this went unnoticed until one
was driven deliberately (see §7's own lesson-learned).

Learners are unaffected by the switch to JPEG: `next.config.ts` sets no
`images.formats` override, so `next/image` keeps negotiating its own default
(WebP) to every browser that renders this same source file elsewhere in the
app; only the one master stored in the bucket changed format.

Evidence (step 4c): an uploaded cover's content-type is `image/jpeg`; sharp's
`metadata()` on it reports `{ width: 1920, height: 1080 }`. Its 13 KB byte
count is not representative — that particular upload was a flat, single-colour
synthetic test image, not a photograph, and compresses far smaller than any
real cover will.

## 5. Limits

A crop area below 960×540 source px is blocked with a message (`too_small`);
below 1600 px wide shows a non-blocking warning (`low`). Both constants
(`COVER_MIN_CROP`, `COVER_RECOMMENDED_MIN_WIDTH`) and the 1920 max-output-width
reasoning live in `lib/courseCover.ts`'s own header comment — not restated
here.

Source files up to 20 MB (`COVER_SOURCE_MAX_BYTES`) are accepted, well above
`lib/lessonImages.ts`'s 5 MB bucket cap (`LESSON_IMAGE_MAX_BYTES`) — the
source is cropped and re-encoded client-side before upload, so only the
(much smaller) JPEG output ever reaches the bucket and counts against its
cap; the 20 MB figure bounds the source file the browser has to decode, not
what gets stored.

## 6. EXIF rotation

Handled entirely by the browser's default `image-orientation: from-image` —
no EXIF parser was added. Measured in Chromium (Playwright) against a
synthetic orientation-6 JPEG (raw sensor space 4000×3000, EXIF tag
`Orientation: 6`): the decoded `<img>` reported `naturalWidth: 3000,
naturalHeight: 4000` — already rotated upright — and the rendered/cropped
output preserved that same rotation. This is unverified on iOS Safari,
whose image-orientation handling has its own history of quirks, until the
partner's first real upload from her phone; if that upload shows up rotated
wrong, the fix is reading the EXIF tag explicitly before cropping, not a
speculative parser added ahead of evidence that it's needed.

## 7. Share-image robustness

`isOgDecodableCoverUrl(url)` (`lib/courseCover.ts`) accepts only `.png`/`.jpg`/`.jpeg`
paths (query string ignored, case-insensitive). `OgImageCard` treats any
other cover URL — a WebP cover uploaded before this fix existed, or anything
else — as absent, falling back to the branded gradient card, rather than
letting `ImageResponse` return a 500.

Building this fallback surfaced a second, unrelated, pre-existing bug in
`OgImageCard`'s own no-cover branch (SHELL-009): it returned 500 regardless
of WebP. A published course can never reach that branch — publishing
requires a cover (`courses_published_requires_catalogue_fields`/
`missing_cover`) — but a stale or unknown course/lesson slug can (the branch
`opengraph-image.tsx`'s own comment already promises a branded card for
exactly that case), and VIS-001's new WebP fallback now reaches it too, for
real, on every course whose cover predates this card. Cause, stated exactly
as measured (step 4d): the branch's inner `<div>` computed
`background: cover ? "linear-gradient(...)" : undefined` — an explicit
`undefined` style value. Satori raised `Cannot read properties of undefined
(reading 'toString')`, and removing that key entirely for the no-cover case
(a conditional spread instead of a ternary defaulting to `undefined`) made
the same request return 200. Nothing further is claimed about why Satori's
internals behave this way — the fix was verified by that one before/after
GET, not derived from reading Satori's source.

Lesson learned, stated plainly because it cost real time twice in this card:
a HEAD request to a share-image route returned 200 in both bugs above, while
the actual GET failed. Share images are verified by GETting the URL and
decoding the response as an image — never by HEAD alone.

## 8. Object URL ownership

The crop dialog's preview `URL.createObjectURL` is created and revoked by
`CoverImagePicker`'s own pick/cancel/confirm-settle handlers, not by an
effect inside `CoverCropDialog`. It started the other way — `useMemo(() =>
URL.createObjectURL(file))` paired with a revoke-only cleanup effect — and
that shape has a real bug under React 19 Strict Mode: the dev-only
double-invoke of effects revoked the memoized URL on its first simulated
unmount, before the real mount's `<img>` ever loaded it
(`net::ERR_FILE_NOT_FOUND`, `naturalWidth: 0` — caught only by driving it in
a real browser, never by `tsc`/`eslint`). Moving ownership to the plain event
handlers that already bracket the dialog's lifetime (pick opens it, cancel
or a settled confirm closes it) removes the effect entirely, and with it the
`eslint-disable-next-line react-hooks/set-state-in-effect` this card had
briefly added as a workaround. Repo-wide suppression count for that rule:
**2 → 1** (the remaining one, in `AppearanceSection.tsx`, predates this card
and is unrelated).

## 9. Bundle isolation

`react-easy-crop` is fetched only when the crop dialog opens
(`next/dynamic(..., { ssr: false })`), and appears in no English-surface
route. Verified against a real `next build`'s own manifests (step 4b), not
by grepping for the package name as a string: the chunk containing the
library's actual source (`reactEasyCrop_Container`,
`getInitialCropFromCroppedAreaPixels` — its real API surface) is
`static/chunks/0gw.6-y~limwa.js`; `grep -rl` for that chunk under
`.next/server/app` finds exactly one reference,
`app/admin/courses/[id]/page/react-loadable-manifest.json`, and zero
references anywhere under `.next/server/app/(english)`. `npm run budget`
before/after: `/` 172.0 KB → 172.4 KB (180 KB budget), the only English
route the local budget run measures (the three `/courses/future-imperfect/*`
routes 404 locally, the pre-existing gap noted in 0070). `/login` (a
Colloquiz route, included only as a control) 284.1 KB → 284.1 KB. The 0.4 KB
delta on `/` is not the crop library (manifest evidence above); its source
was not investigated.

## 10. Out of scope

- Lesson images (the theory image block, image matching) are untouched —
  they keep rendering at their natural aspect ratio; this card is cover
  images only.
- Migrating existing covers to the new 16:9/JPEG shape is not attempted.
  The hosted-DB count of courses with a `.webp` cover, checked at step 4c
  before any change: **0** — there was nothing to migrate at the time this
  card shipped, and the author re-uploads to reframe an existing cover
  going forward (docs/handoff.md).

## What would make us revisit it

- A real upload from the partner's iOS device rotated wrong — §6's
  Chromium-only EXIF verification would then need a real device check and
  possibly an explicit orientation read.
- A future need to re-frame a cover without re-uploading the source — §2's
  destructive-crop trade-off would need revisiting toward a stored crop
  rect or focal point.
- Any other course-facing consumer of `cover_image_url` added outside
  `OgImageCard`/`CourseCard`/`/courses/[slug]`/the admin preview — it would
  need its own `isOgDecodableCoverUrl`-style check if it can't decode every
  format the upload path can produce.
