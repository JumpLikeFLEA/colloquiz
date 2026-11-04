-- ============================================================
-- 108_lesson_audio_mime.sql
--
-- docs/decisions/0217. A lesson can carry a sound clip: the `audio` theory
-- block (lib/lessons/theoryBlocks.ts), uploaded in the Studio lesson editor.
-- Clips live in the lesson-images bucket (041) beside the images, under the
-- same "<course_id>/<uuid>.<ext>" paths, so:
--   - the existing editor policies on storage.objects (041, with 083's
--     _studio_can_write) already decide who may upload, update and delete;
--   - course delete purges the course folder, clips included;
--   - duplicating a course copies them (lib/duplicateImages.ts reads the
--     audio block's url through extractLessonImageUrls).
--
-- This migration only widens allowed_mime_types: MP3 (audio/mpeg) and
-- M4A/AAC (audio/mp4, audio/x-m4a, audio/aac), which every browser the
-- audience uses plays. file_size_limit stays 5 MB (about five minutes of MP3
-- at 128 kbps). The bucket stays public, like the images: a clip in a free
-- lesson must play for an anonymous visitor.
--
-- An UPDATE of an existing row in storage.buckets: the hosted-apply gate
-- (CLAUDE.md, item 4) needs the owner's word for it, given for this file on
-- 2026-11-05. Safe to re-apply: it sets the same array again.
-- ============================================================

DO $$
BEGIN
  UPDATE storage.buckets
  SET allowed_mime_types = ARRAY[
    'image/png', 'image/jpeg', 'image/webp',
    'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac'
  ]
  WHERE id = 'lesson-images';

  IF NOT FOUND THEN
    RAISE EXCEPTION '108: storage bucket lesson-images not found (migration 041 creates it)';
  END IF;
END;
$$;
