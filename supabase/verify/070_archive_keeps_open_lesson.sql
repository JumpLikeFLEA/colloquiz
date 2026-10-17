-- ============================================================
-- supabase/verify/070_archive_keeps_open_lesson.sql
--
-- CNT-016 protocol for migration 070. NOT a migration: run after 070 is
-- applied, as postgres. Seeds its own data and ROLLS BACK. A failed
-- assertion aborts with "CNT-016 FAIL: ...".
-- ============================================================
BEGIN;

CREATE FUNCTION pg_temp.arch(p_user UUID, p_lesson UUID, p_archived BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v JSONB;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v := public.set_lesson_archived(p_lesson, p_archived);
  PERFORM set_config('role', 'postgres', true);
  RETURN v;
END;
$$;

CREATE FUNCTION pg_temp.expect(p_label TEXT, p_got JSONB, p_ok BOOLEAN, p_err TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE '% -> %', p_label, p_got;
  IF (p_got->>'ok')::boolean IS DISTINCT FROM p_ok OR p_got->>'error' IS DISTINCT FROM p_err THEN
    RAISE EXCEPTION 'CNT-016 FAIL: %', p_label;
  END IF;
END;
$$;

DO $$
DECLARE
  v_e UUID := gen_random_uuid();
  v_n UUID := gen_random_uuid();
  v_pub UUID; v_coh UUID; v_dra UUID;
  a UUID; b UUID; s UUID; ca UUID; da UUID;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (v_e, 'authenticated', 'authenticated', 'e-' || v_e || '@verify.test'),
    (v_n, 'authenticated', 'authenticated', 'n-' || v_n || '@verify.test');

  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url) VALUES ('v16-pub', 'P', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO v_pub;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url) VALUES ('v16-coh', 'C', 'A2', 'published', 'cohort', 's', 'c') RETURNING id INTO v_coh;
  INSERT INTO courses (slug, title, level, status, format) VALUES ('v16-dra', 'D', 'A2', 'draft', 'self_paced') RETURNING id INTO v_dra;
  INSERT INTO course_editors (course_id, user_id, granted_by) SELECT id, v_e, v_e FROM courses WHERE id IN (v_pub, v_coh, v_dra);
  -- TCH-008: 083 freezes a writer with no active seat, so every seeded editor
  -- gets the open-ended seat 082's backfill gave the real ones.
  INSERT INTO author_seats (user_id, kind, public_name)
  SELECT DISTINCT ce.user_id, 'teacher', 'Verify seat' FROM course_editors ce
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_pub, 1, 'A', 'a', 'anyone') RETURNING id INTO a;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_pub, 2, 'B', 'b', 'anyone') RETURNING id INTO b;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_pub, 3, 'S', 's', 'signed_in') RETURNING id INTO s;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week) VALUES (v_coh, 1, 'CA', 'ca', 'anyone', 1) RETURNING id INTO ca;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_dra, 1, 'DA', 'da', 'anyone') RETURNING id INTO da;

  PERFORM pg_temp.expect('non-editor archive a', pg_temp.arch(v_n, a, true), false, 'forbidden');
  PERFORM pg_temp.expect('editor archive a (b still open)', pg_temp.arch(v_e, a, true), true);
  PERFORM pg_temp.expect('editor archive b (last open) REFUSED', pg_temp.arch(v_e, b, true), false, 'no_open_lesson');
  IF (SELECT archived_at FROM lessons WHERE id = b) IS NOT NULL THEN RAISE EXCEPTION 'CNT-016 FAIL: b archived despite refusal'; END IF;
  PERFORM pg_temp.expect('archive signed_in s (not anyone)', pg_temp.arch(v_e, s, true), true);
  PERFORM pg_temp.expect('restore a', pg_temp.arch(v_e, a, false), true);
  PERFORM pg_temp.expect('archive b once a is open again', pg_temp.arch(v_e, b, true), true);
  PERFORM pg_temp.expect('restore b (never refused)', pg_temp.arch(v_e, b, false), true);
  PERFORM pg_temp.expect('archive a, b open', pg_temp.arch(v_e, a, true), true);
  PERFORM pg_temp.expect('restore a with b open', pg_temp.arch(v_e, a, false), true);
  -- restore is never refused even when nothing else is open
  UPDATE lessons SET archived_at = now() WHERE id = a;
  UPDATE lessons SET access_level = 'entitled' WHERE id = b;
  PERFORM pg_temp.expect('restore a when no other open lesson', pg_temp.arch(v_e, a, false), true);
  PERFORM pg_temp.expect('cohort course archive last anyone', pg_temp.arch(v_e, ca, true), true);
  PERFORM pg_temp.expect('draft course archive last anyone', pg_temp.arch(v_e, da, true), true);
  RAISE NOTICE 'CNT-016 PASS';
END;
$$;

ROLLBACK;
