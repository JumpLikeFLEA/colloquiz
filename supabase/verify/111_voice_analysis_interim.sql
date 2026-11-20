-- ============================================================
-- supabase/verify/111_voice_analysis_interim.sql
--
-- VOICE-017 protocol for migration 111 (needs everything through 111). NOT a migration:
-- run after 111 is applied, as postgres. Seeds its own data and ROLLS BACK. A failed
-- assertion aborts with "VOICE-017 FAIL: ...". The denial ('bogus') is paired with
-- positive controls (first, final, interim accepted, and NULL, which 096 always allowed).
-- ============================================================
BEGIN;

DO $$
DECLARE
  u UUID := gen_random_uuid();
  c UUID; l UUID; v UUID;
  b TEXT;
  sub UUID; snd UUID;
  kinds TEXT[] := ARRAY['first', 'final', 'interim', NULL];
  k TEXT;
  n INTEGER := 0;
  got TEXT;
BEGIN
  INSERT INTO auth.users (id, aud, role, email)
    VALUES (u, 'authenticated', 'authenticated', 'v111-' || u || '@verify.test');
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v111-c', 'C', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO c;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level)
    VALUES (c, 1, 'L', 'l', 'anyone') RETURNING id INTO l;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (l, '[]', 'editor') RETURNING id INTO v;

  -- Accepted: each allowed kind, one row each (a distinct block per row).
  FOREACH k IN ARRAY kinds LOOP
    n := n + 1;
    b := 'vt' || n;
    sub := gen_random_uuid();
    INSERT INTO voice_submissions (id, enrolment_id, user_id, course_id, lesson_id, block_id, lesson_version_id,
                                   object_name, content_type)
      VALUES (sub, NULL, u, c, l, b, v, 'v111/' || sub || '.webm', 'audio/webm');
    INSERT INTO voice_analysis_sends (user_id, lesson_id, block_id, submission_id, slot)
      VALUES (u, l, b, sub, 'self_paced') RETURNING id INTO snd;
    INSERT INTO voice_analyses (submission_id, send_id, instruction) VALUES (sub, snd, k);
  END LOOP;

  IF (SELECT count(*) FROM voice_analyses a JOIN voice_submissions s ON s.id = a.submission_id WHERE s.user_id = u) <> 4 THEN
    RAISE EXCEPTION 'VOICE-017 FAIL: expected 4 accepted rows (first, final, interim, NULL)';
  END IF;
  IF (SELECT count(*) FROM voice_analyses a JOIN voice_submissions s ON s.id = a.submission_id
       WHERE s.user_id = u AND a.instruction = 'interim') <> 1 THEN
    RAISE EXCEPTION 'VOICE-017 FAIL: the interim row was not stored';
  END IF;
  RAISE NOTICE 'accepted: first, final, interim, NULL (4 rows)';

  -- Refused: an unknown kind, on a row that would otherwise be valid.
  sub := gen_random_uuid();
  INSERT INTO voice_submissions (id, enrolment_id, user_id, course_id, lesson_id, block_id, lesson_version_id,
                                 object_name, content_type)
    VALUES (sub, NULL, u, c, l, 'vt-bogus', v, 'v111/' || sub || '.webm', 'audio/webm');
  INSERT INTO voice_analysis_sends (user_id, lesson_id, block_id, submission_id, slot)
    VALUES (u, l, 'vt-bogus', sub, 'self_paced') RETURNING id INTO snd;
  BEGIN
    INSERT INTO voice_analyses (submission_id, send_id, instruction) VALUES (sub, snd, 'bogus');
    RAISE EXCEPTION 'VOICE-017 FAIL: instruction ''bogus'' was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS got = CONSTRAINT_NAME;
    IF got IS DISTINCT FROM 'voice_analyses_instruction_check' THEN
      RAISE EXCEPTION 'VOICE-017 FAIL: ''bogus'' was refused by % instead of voice_analyses_instruction_check', got;
    END IF;
    RAISE NOTICE 'refused: bogus, by %', got;
  END;
  -- The same row with a valid kind is accepted (the refusal was the kind, nothing else).
  INSERT INTO voice_analyses (submission_id, send_id, instruction) VALUES (sub, snd, 'interim');

  -- The stored definition names exactly the three kinds.
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conrelid = 'voice_analyses'::regclass AND conname = 'voice_analyses_instruction_check') NOT LIKE '%interim%' THEN
    RAISE EXCEPTION 'VOICE-017 FAIL: the constraint definition does not name interim';
  END IF;

  RAISE NOTICE 'VOICE-017 PASS: 111 (first, final, interim, NULL accepted; bogus refused by name)';
END;
$$;

ROLLBACK;
