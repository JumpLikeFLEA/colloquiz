# 0218 — Lesson images at their own shape, with a size the author chooses

Status: decided by the owner (size presets, paste, 2026-11-05) and in the session that built
it (the rest), ad hoc, not a board card. No migration.

## Context

The owner sent two screenshots of a lesson (2026-11-05): wide comic strips with grey bands
above and below, and tall borrow/lend cards with grey bands left and right. Every theory image
was drawn with `fill` + `object-contain` inside a fixed `aspect-video` box on `bg-muted`
(`ImageBlock.tsx` before this change), because the block stored only a URL, so its shape was
unknown when the page rendered. The owner asked for no bands, for the author to upload an
image as it is, and for a way to change its size.

## Decisions

1. **The block stores the image's pixel size: optional `width` and `height`, both or neither**
   (`lib/lessons/theoryBlocks.ts`). An upload knows it already: `resizeImageToWebp` returns
   the resized file's size (`lib/imageResize.ts`), and `uploadLessonImage` now passes it on. A
   typed URL is measured in the browser (`lib/measureImage.ts`, `naturalWidth/Height`, no
   CORS needed). With the size, next/image gets real `width`/`height`, and the browser reserves
   the right height before the image loads.
2. **The image is drawn with no box, background, border or rounding** (`ImageBlock.tsx`):
   `w-full h-auto` at its own shape. "As is" was the request; a frame around a picture that
   has its own (the authors' cards have one) is a second frame.
3. **Size is four presets, each a maximum width** (owner's choice over a percent slider):
   Small 256 px, Medium 384, Large 512, Full width = the reading column (672 at `lg`). Stored
   as `size: "small" | "medium" | "large"`; full width is the absent field, so every block
   saved before this keeps its width and there is one way to write each state. Maximum
   widths, not percentages: on a 360 px phone Medium to Full fill the column and Small stays
   256, where a percentage would have shrunk every image on a phone. The image is centred.
   `imageFrame()` (`lib/lessonPlayer/imageFrame.ts`) maps a size to its class and `sizes`.
4. **Pasting an image uploads it** (owner's choice). The form has a box that shows the image
   at its size, and is focusable: click it and press Ctrl+V. A paste anywhere in the form
   with an image file on the clipboard uploads it through the same path as the button
   (`useLessonImageUpload`, shared): the limits, the resize, the bucket, the replaced-object
   bookkeeping. A text paste is untouched, so a URL still pastes into the URL field. A field
   that handles the paste itself (the caption editor) wins.
5. **A block saved before this keeps rendering, with no backfill.** Without a size it renders
   with `width`/`height` 0 and `h-auto`: its own shape once loaded, one layout shift when it
   does. Opening its form in the editor measures it, so the next save stores the size. Not
   done: writing sizes into existing `lesson_versions` rows, which would update published
   rows (the hosted-apply gate's item 4) for a one-time shift per image.
6. **The editor's preview is `unoptimized`.** A typed URL on a host outside
   `images.remotePatterns` makes next/image's default loader throw in development
   (`next/dist/shared/lib/image-loader.js`, the remote-pattern check), which would take the
   editor down mid-edit. The learner page is unchanged in this respect: a non-Supabase URL was
   already a broken image there.
7. **The image form is its own module, `ImageBlockForm.tsx`, picked by `BlockList`**, not by
   `BlockForm`, so the two forms don't import each other. `BlockForm` lost its image case and
   its `onUploadImage` prop.

Course duplicates keep the new fields: `_apply_url_map` (107:42-60) replaces URLs in the
document's text and leaves every other key as it was.

## Measured

All on the local stack (`next dev`, Edge headless, a throwaway admin and course, deleted
afterwards: 0 users, 0 courses, 0 storage objects left, 4 seeded courses still there).

- Editor: the Upload button with a 1600×560 PNG stored `width 1600, height 560` (as WebP). A
  paste event carrying a 900×1100 PNG uploaded it and stored `900, 1100`; with Size Medium,
  `size: "medium"`. A text paste into the URL field changed nothing and started no upload. A
  typed URL was measured in the browser: `900, 1100`, Size Small. Console: only the
  report-only CSP notice.
- Learner page, the lesson published by SQL with one more block shaped like one saved before
  this (no width, height or size). At 1280: full width 672×235 (shown ratio 0.350, natural
  0.350), Medium 384×469, Small 256×313 centred (x 512), the old block 672×821. At 360:
  328×115, Medium 328×401, Small 256×313 (x 52), the old block 328×401. Figure and image
  background `rgba(0, 0, 0, 0)`, border 0. With image responses held, the height before load
  equalled the height after for the three blocks with a size; the old block went 0 → 401
  (360) and 0 → 821 (1280).
- Next 16's optimizer refuses a private-IP upstream (dev log: "upstream image … resolved to
  private ip"), so for the learner measurement Playwright answered `/_next/image` with the
  stored object's bytes.
- 360px: `npm run viewport360` on the lesson `360/360`, on the lesson editor `360/360`. With
  the image form open, filled (Medium) and empty: document 360/360, the paste box at x 37,
  286 wide. Studio's own `main` scrolls 464/360 in all three, from the header's History and
  Save buttons (right edges 400 and 464), present with every block collapsed: the
  pre-existing overflow the AUTH-020 entry records.
- `npm run budget`, local stack, before → after: `/courses/future-imperfect/true-or-false`
  259.4 → 257.8 KB (limit 260); `applied-practice` 287.1 → 285.5 (limit 290); `/ (phone)`
  184.8 → 184.7; every other route identical; `/runs/…f1a1` 180.8 of 179, over before and
  after. The drop on the free lesson, re-derived per chunk (CDP `encodedDataLength`, the
  guard's own count): 16 → 15 scripts. Turbopack now emits one 18.71 KB chunk where HEAD
  emitted two, 11.77 and 8.49 KB, both holding next/image and the zod schema code; the
  theory-block chunk went 7.43 → 7.45 KB. A chunking side effect, not a saving in code: an
  unrelated change can undo it.
- Not measured: a paste from the real OS clipboard (a synthetic paste event was used), dark
  mode, a phone, Safari, the hosted optimizer.

## Revisit if

- The one-time shift of an image saved before this is noticed on a published lesson: then
  backfill its size, as a gated data change.
- Authors need a size between the presets, or a phone-specific size.
- An image needs to be wider than the reading column (0079 Decision 11: `table`'s FIT band is
  the precedent).
