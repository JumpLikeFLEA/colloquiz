# 0217 — An audio block in lessons

Status: decided by the owner (bucket, 2026-11-05) and in the session that built it (the
rest), ad hoc, not a board card. Migration 108.

## Context

The owner imported a new course, Tricky Pairs, from an author's DOCX (draft, hosted,
2026-11-05). The lesson wants a 2–3 min listening scene, a clip under each of its five
Block 5 cards, five shadowing lines and two sample answers. Images were already a theory
block (`image`, AUTH-004); the only media beside them was a YouTube `video`. The owner
asked for lessons that can carry pictures and audio.

## Decisions

1. **A theory block, `audio`: `{ url, caption? }`** (`lib/lessons/theoryBlocks.ts`). Not an
   item type: it scores nothing, like `video` (docs/handoff.md "Item types"). The caption is
   inline content: the line being spoken, or what the clip is.
2. **Clips live in the `lesson-images` bucket** (owner's choice over a new bucket). They are
   stored under the same `<course_id>/<uuid>.<ext>` paths, so the 041/083 storage policies
   already decide who may write. Course delete purges them with the folder. Duplicating a
   course copies them, because `extractLessonImageUrls` now returns audio URLs too
   (0214 l.73: a shape missing there is lost in a copy). The orphan sweep counts them as
   referenced. The cost is a bucket whose name says "images". A new bucket would have
   needed each of those three paths to learn a second bucket.
3. **MP3 and M4A/AAC only** (`audio/mpeg`, `audio/mp4`, `audio/x-m4a`, `audio/aac`):
   every browser the audience uses plays them. WAV and OGG are refused. The size limit
   stays the bucket's 5 MB, about five minutes of MP3 at 128 kbps. Some systems report an
   MP3 as `audio/mp3` or with no type, so `lessonAudioMimeType` falls back to the
   extension and the upload sends a type the bucket accepts.
4. **The browser's own `<audio controls preload="none">`, with no client state**
   (`AudioBlock.tsx`). It needs no JS of its own; this is the budget lesson of 0104.
   `preload="none"`: a lesson can hold a clip per line, and a phone should fetch only
   what is played. Playback speed (the author's "Try 0.75×") is whatever the native
   control offers; there is no control of ours.
5. **Audio never gates anything**, the same rule as video: a listening question can be
   answered without playing the clip (docs/handoff.md, updated).
6. **The sign-in teaser leaves audio out.** `lesson_teaser` (055:251) passes on only the
   types it lists, and audio is not one of them. Adding it would re-emit that function in a
   migration for a teaser that shows the start of a lesson. `TeaserBlock` returns null for
   `audio`, with a pointer to 055.
7. **A replaced clip is not deleted on save.** `save()` (LessonContentEditor.tsx) deletes
   queued image paths after any successful save, even while the published version still
   points at them. That was read in the code, not reproduced in a browser. Audio does not
   join that queue: a replaced clip stays in the bucket until the course is deleted, and the
   sweep reports it. The image side is proposed as its own card below.
8. **The upload reaches the audio form through context** (`LessonAudioUploadProvider`), not
   a prop through every BlockList row: the BeforeListenForProvider precedent. A form
   rendered without the provider refuses ("Uploading audio isn't available here.").
9. **083's verify script expected 41 guarded functions; there are 45.** 103
   (`course_import_create`, `course_import_commit`) and 107 (`duplicate_lesson`,
   `duplicate_course`) added guarded write RPCs without updating the count (the file's last
   change was 096). The four were listed from `pg_proc` on the local stack. The count now
   reads 45, with the derivation in a comment. 108 adds no function.

## Measured

- Verify 108 on local, before applying 108: `0217 FAIL: an audio type is missing:
  {image/png,image/jpeg,image/webp}`. After applying (and re-applying): `0217 PASS: 108
  lesson-images allows 7 types, limit 5242880 bytes, public`.
- Earlier verifies re-run on local after 108:
  - 067: `AUTH-015 PASS all cases`.
  - 107: `AUTH-022 PASS: 107 full protocol (42 asserted cells)`.
  - 083: `TCH-008 FAIL: guarded functions … (got 45, want 41)`, then `TCH-008 PASS: 083 full
    protocol (126 asserted cells)` once Decision 9's count was corrected.
- Storage API on local, as a signed-in admin (`supabase-js` `upload`):
  - before 108 (the old array put back): audio/mpeg, audio/x-m4a and audio/wav were refused
    ("mime type … is not supported"); image/png was accepted.
  - after 108: audio/mpeg, audio/x-m4a and image/png were accepted; audio/wav was refused.
- Studio editor, local, 360px, an admin:
  - Add block → Audio opens its form.
  - A WAV is refused in the form ("Lesson audio must be MP3 or M4A").
  - An `.MP3` uploads to `<course>/<uuid>.mp3`, fills the URL and shows a preview player.
  - Save stores an `editor` version with both clips.
  - `document 360/360` in every step. The editor's own scroll area measured `main 451/360`
    at load, before any audio form opened. That is the pre-existing width AUTH-020 recorded
    (0186), not this form.
- Lesson page, local, anonymous: `npm run viewport360` printed `/courses/audio-check/listen |
  200 | scrollWidth/innerWidth 360/360`; at 1280, `1280/1280`. The player is 328 px wide at
  360 and 672 px at 1280. Before play, `readyState` was 0, so nothing was fetched. After
  play: a 62.8 s clip, played to 2.0 s. The Studio preview measured `360/360`, main
  `360/360`, with two players.
- Duplicate, local: `POST /api/admin/courses/<id>/duplicate` → 200. The copy's document
  points at two clips under the copy's own folder, and 2 `.mp3` objects exist there.
- `npm run budget`, local stack, before → after:
  - `/courses/future-imperfect/true-or-false`: 259.3 → 259.4 KB (limit 260).
  - `applied-practice`: 287.0 → 287.1 (limit 290).
  - Every other route: identical.
  - `/runs/…f1a1`: 180.8 of 179, over before and after.
- Not measured: dark mode, a phone, an in-app browser, Safari's native controls.

## Revisit when

- A clip needs to be longer than 5 MB: raise the bucket limit, or give audio its own bucket.
- Learners need a speed control or a clip-per-line button that the native control can't
  give: that is client JS on the lesson route, and the free lesson has 0.6 KB left.
- Partial play of paid lessons is built: public URLs in a public bucket are as guessable as
  the images', which is to say not (uuid paths), but not access-controlled either.

## Proposed cards (not built here)

- **Replaced lesson images are deleted while the published version still uses them.**
  Acceptance: replacing an image in a published lesson and saving without publishing leaves
  the published lesson's image loading; the old object is removed only once no version that
  a learner or the history can reach points at it.
- **Before/after per lesson.** `voiceCompare.ts` allows one "before" and one "after" per
  course. Tricky Pairs plans an episode per pair, each with its own bracket. Acceptance: a
  course can hold a before/after pair per lesson, and the before/after screen and AI
  comparison pick the pair from the same lesson.
- **Reveal after a delay / a collapsible block** ("Show sample" enabled after 3 s; the Words
  list behind a button), and **an unscored self-rating** (Block 12's "How confident do you
  feel?").
