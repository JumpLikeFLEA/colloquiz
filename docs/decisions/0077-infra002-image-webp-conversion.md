# 0077 — INFRA-002: resize + WebP conversion at upload

## Context

INFRA-002's acceptance asked for lesson images and covers to be resized and
converted to WebP at upload, before/after byte sizes printed for existing
bucket contents, and flagged that a new npm dependency (e.g. sharp) is a
stop-and-ask.

## Decision 1 — covers are excluded from WebP conversion

Course covers already get a client-side resize + re-encode
(`lib/courseCoverCanvas.ts`, decisions 0074/0075) but are deliberately
JPEG-only: Satori (`next/og`'s `ImageResponse` renderer, used by
`OgImageCard` for the course share image) cannot decode WebP, and a prior
attempt to use it broke the share image outright (`Error: failed to pipe
response`, cited in `courseCoverCanvas.ts`'s header comment). Converting
covers to WebP would reproduce that regression. Covers are left untouched by
this card — they already satisfy "resized," and their format is governed by
0074/0075, not this one.

WebP conversion applies to lesson content images (theory image blocks,
matching image elements) and avatars — neither is ever read by Satori.

## Decision 2 — resize/encode client-side via Canvas, no new runtime dependency

`canvas.toBlob("image/webp", quality)` already ships in every browser this
app targets, and the cover pipeline already proved the pattern (draw into a
canvas at a capped size, encode via `toBlob`). `lib/imageResize.ts` extends
that pattern generically (no crop, no fixed aspect ratio) for the two new
upload paths. No new dependency for the client bundle.

`canvas.toBlob`'s requested type is a hint some browsers can silently
ignore (documented Safari behaviour). The returned blob's own `type` is
checked; anything other than `image/webp` falls back to a JPEG encode of the
same canvas rather than uploading a mislabeled file.

Max widths, each derived from where the image actually renders (same method
`COVER_MAX_OUTPUT_WIDTH` used):
- Theory images (`ImageBlock.tsx`'s `sizes="(max-width: 1024px) 100vw,
  1024px"`): 2048px — 1024 CSS px at DPR 2, the same breakpoint the cover's
  1920px cap was derived from.
- Matching-element images (`MatchingContentView.tsx`'s `sizes="48px"`):
  400px — a generous margin over the 48px display box, not a tight fit.
- Avatars: 512px — generous over any avatar display size in the app today.

`LessonImageUploadButton`'s `onUpload` signature grew a `kind: "theory" |
"matching"` parameter (a new required `kind` prop on the component) so the
one shared upload function in `LessonContentEditor.tsx` can pick the right
width — threaded explicitly rather than inferred, since the component is
reused for both cases via the same prop chain (`BlockList` → `BlockForm` /
`PracticeItemForm` → `MatchingForm`). This is a breaking change to
`UploadLessonImage`'s type, so `CoverImagePicker.tsx` was given its own
2-arg `UploadCoverImage` type instead of continuing to reuse
`UploadLessonImage` — a cover has no `kind` and is resized to its own fixed
`COVER_MAX_OUTPUT_WIDTH` before `onUpload` ever sees it.

## Decision 3 — backfill script, sharp as a devDependency, same-path overwrite

The "before/after byte sizes for the existing bucket contents" acceptance
line needs a one-time pass over what's already in the two buckets. Canvas
isn't available in Node, so `scripts/backfill-image-webp.ts` uses `sharp` —
added to `package.json` **devDependencies only**; it is never imported by
app code, so it never reaches the server or client bundle.

**Same-path overwrite, not a fresh UUID path + reference rewrite.** The
fresh-UUID convention already established for both buckets
(`lib/avatar.ts`, `lib/lessonImages.ts`) exists to avoid serving a STALE
image after a user-initiated replace — the wrong picture, cached. A backfill
re-encode is the same picture at smaller bytes, so a stale cached response
(bounded by the object's `Cache-Control: max-age=3600` — the
`@supabase/storage-js` upload default; nothing in this codebase overrides
it) is heavier, never wrong. Overwriting in place costs nothing correctness-
wise here and buys a materially simpler script: zero database writes, no
`profiles.avatar_url` / `lesson_versions.document` rewrites, no published-row
mutation, no delete-after-reference ordering to get right. The object's
path/filename is kept exactly as uploaded even once its extension no longer
matches its content (e.g. an object still named `....jpg` holding WebP
bytes after the backfill) — renaming would mean a new path, which is the one
thing this approach exists to avoid.

Every existing `lesson-images` object gets the THEORY max width (2048px)
uniformly on backfill, not the tighter 400px matching-element width new
uploads now get — a stored object carries no `kind` of its own (only the
authored document referencing it does), and resize only ever shrinks toward
a cap, so applying the larger, safe-for-either-kind cap can't make a
matching-tile image too small; it just leaves some of them bigger than a
fresh matching upload would be. Narrowing this further (cross-referencing
`extractLessonImageUrls` per lesson to recover each object's real kind) was
considered and dropped as unnecessary complexity for a one-time maintenance
script over a currently tiny bucket (`docs/decisions/0076`: 171 KB across 5
objects at measurement time).

Dry run by default (downloads, re-encodes in memory, prints per-object and
total before/after bytes, writes nothing). `--apply` backs up each
original's exact bytes to `.image-backfill-backup/<bucket>/<path>`
(gitignored) before overwriting, and only ever writes when the re-encode is
actually smaller than the original. `--apply` is run by the repo owner, not
by an agent session, per the working agreement's "never write to hosted
storage" stop.

Verified with a real dry run against the hosted buckets (`npm run
backfill:images`, no `--apply`): avatars 694.6 KB → 55.7 KB (1 object),
lesson-images 146.4 KB → 45.6 KB (3 objects; a 4th listed entry was
Supabase Storage's own `.emptyFolderPlaceholder` marker for an emptied
folder, not a real object — filtered out after the first dry run surfaced
it as a "Input Buffer is empty" crash). Grand total 841.0 KB → 101.3 KB.

## What would make us revisit it

- If Satori ever gains WebP decoding, covers could be reconsidered — not
  urgent, and not this card's problem to track.
- If the `avatars` or `lesson-images` bucket ever needs a `kind`-aware
  backfill (e.g. matching-tile images specifically need to shrink further
  than the uniform theory-width backfill leaves them), the cross-reference
  against `lesson_versions.document` noted above is the way to do it.
- If any client ever sets a longer `cacheControl` on these buckets' uploads,
  the same-path-overwrite staleness window in Decision 3 grows accordingly
  and should be re-checked against whatever that new value is.
