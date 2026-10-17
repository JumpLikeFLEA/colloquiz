-- ============================================================
-- supabase/verify/069_drop_in_free_sample.sql
--
-- CNT-015 protocol for migration 069. NOT a migration: run it after 069 is
-- applied, as the postgres role. Seeds its own users and course, asserts,
-- and ROLLS BACK. Failure aborts with "CNT-015 FAIL: ...".
--
-- Positive controls: an editor calls create_lesson (first lesson of a
-- self-paced course -> anyone; second -> entitled) and
-- set_lesson_access_level. Negative controls: a non-editor is denied both,
-- and the column and its CHECK are gone.
-- ============================================================
BEGIN;

DO $$
DECLARE
  v_e UUID := gen_random_uuid();
  v_n UUID := gen_random_uuid();
  v_c UUID;
  v_res JSONB;
  v_l1 UUID; v_l2 UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'lessons' AND column_name = 'in_free_sample')
     OR EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'lessons_in_free_sample_mirrors_access_level') THEN
    RAISE EXCEPTION 'CNT-015 FAIL: column or CHECK still exists';
  END IF;
  RAISE NOTICE 'CNT-015 PASS: in_free_sample and its CHECK are gone';

  INSERT INTO auth.users (id, aud, role, email) VALUES
    (v_e, 'authenticated', 'authenticated', 'e-' || v_e || '@verify.test'),
    (v_n, 'authenticated', 'authenticated', 'n-' || v_n || '@verify.test');
  INSERT INTO courses (slug, title, level, status, format)
  VALUES ('verify-cnt015', 'Verify CNT-015', 'A2', 'draft', 'self_paced') RETURNING id INTO v_c;
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES (v_c, v_e, v_e);
  -- TCH-008: 083 freezes a writer with no active seat, so every seeded editor
  -- gets the open-ended seat 082's backfill gave the real ones.
  INSERT INTO author_seats (user_id, kind, public_name)
  SELECT DISTINCT ce.user_id, 'teacher', 'Verify seat' FROM course_editors ce
  ON CONFLICT (user_id) DO NOTHING;

  -- editor
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_e, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_res := create_lesson(v_c, 'One', 'one');
  RAISE NOTICE 'editor create_lesson #1: %', v_res;
  IF NOT (v_res->>'ok')::boolean OR v_res->>'access_level' <> 'anyone' OR v_res ? 'in_free_sample' THEN
    RAISE EXCEPTION 'CNT-015 FAIL: create_lesson #1 %', v_res;
  END IF;
  v_l1 := (v_res->>'lesson_id')::uuid;
  v_res := create_lesson(v_c, 'Two', 'two');
  RAISE NOTICE 'editor create_lesson #2: %', v_res;
  IF NOT (v_res->>'ok')::boolean OR v_res->>'access_level' <> 'entitled' THEN
    RAISE EXCEPTION 'CNT-015 FAIL: create_lesson #2 %', v_res;
  END IF;
  v_l2 := (v_res->>'lesson_id')::uuid;
  v_res := set_lesson_access_level(v_l2, 'signed_in');
  RAISE NOTICE 'editor set_lesson_access_level: %', v_res;
  IF NOT (v_res->>'ok')::boolean THEN RAISE EXCEPTION 'CNT-015 FAIL: set level %', v_res; END IF;
  PERFORM set_config('role', 'postgres', true);
  IF (SELECT access_level FROM lessons WHERE id = v_l2) <> 'signed_in' THEN
    RAISE EXCEPTION 'CNT-015 FAIL: level not stored';
  END IF;

  -- non-editor
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_n, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_res := create_lesson(v_c, 'Three', 'three');
  RAISE NOTICE 'non-editor create_lesson: %', v_res;
  IF v_res->>'error' IS DISTINCT FROM 'forbidden' THEN RAISE EXCEPTION 'CNT-015 FAIL: create_lesson not denied'; END IF;
  v_res := set_lesson_access_level(v_l1, 'entitled');
  RAISE NOTICE 'non-editor set_lesson_access_level: %', v_res;
  IF v_res->>'error' IS DISTINCT FROM 'forbidden' THEN RAISE EXCEPTION 'CNT-015 FAIL: set level not denied'; END IF;
  PERFORM set_config('role', 'postgres', true);
  RAISE NOTICE 'CNT-015 PASS';
END;
$$;

ROLLBACK;
