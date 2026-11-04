-- ============================================================
-- supabase/verify/108_lesson_audio_mime.sql
--
-- Protocol for migration 108 (needs 041 applied). NOT a migration: run after
-- 108 is applied, as postgres. Reads only, inside a transaction that ROLLS
-- BACK. A failed assertion aborts with "0217 FAIL: ...".
--
-- What SQL can check is the bucket row. Whether Storage then accepts an MP3
-- and refuses a WAV is the Storage API's check, not the database's; that is
-- measured by an upload against the API (docs/decisions/0217 "Measured").
-- ============================================================
BEGIN;

DO $$
DECLARE
  v_rows INTEGER;
  v_types TEXT[];
  v_limit BIGINT;
  v_public BOOLEAN;
BEGIN
  -- Positive control: the row exists, so the checks below run against
  -- something rather than passing over an empty result.
  SELECT count(*) INTO v_rows FROM storage.buckets WHERE id = 'lesson-images';
  IF v_rows <> 1 THEN
    RAISE EXCEPTION '0217 FAIL: expected 1 lesson-images bucket row, found %', v_rows;
  END IF;

  SELECT allowed_mime_types, file_size_limit, public INTO v_types, v_limit, v_public
  FROM storage.buckets WHERE id = 'lesson-images';

  IF NOT (v_types @> ARRAY['image/png', 'image/jpeg', 'image/webp']) THEN
    RAISE EXCEPTION '0217 FAIL: an image type was dropped: %', v_types;
  END IF;
  IF NOT (v_types @> ARRAY['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac']) THEN
    RAISE EXCEPTION '0217 FAIL: an audio type is missing: %', v_types;
  END IF;
  IF cardinality(v_types) <> 7 THEN
    RAISE EXCEPTION '0217 FAIL: expected exactly 7 types, found %: %', cardinality(v_types), v_types;
  END IF;
  IF 'audio/wav' = ANY (v_types) OR 'audio/ogg' = ANY (v_types) THEN
    RAISE EXCEPTION '0217 FAIL: a type outside the decision is allowed: %', v_types;
  END IF;
  IF v_limit IS DISTINCT FROM 5242880 THEN
    RAISE EXCEPTION '0217 FAIL: file_size_limit changed: %', v_limit;
  END IF;
  IF v_public IS DISTINCT FROM true THEN
    RAISE EXCEPTION '0217 FAIL: the bucket is no longer public';
  END IF;

  RAISE NOTICE '0217 PASS: 108 lesson-images allows % types, limit % bytes, public', cardinality(v_types), v_limit;
END;
$$;

ROLLBACK;
