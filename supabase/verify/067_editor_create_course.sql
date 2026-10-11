-- ============================================================
-- supabase/verify/067_editor_create_course.sql
--
-- AUTH-015 full protocol for migration 067 (docs/decisions/0125 D2,
-- docs/decisions/0126). NOT a migration: run it after 067 is applied, in
-- the SQL Editor or psql, as the postgres role. It seeds its own users and
-- course, asserts, and ROLLS BACK, so it leaves nothing behind. Any failed
-- assertion aborts with "AUTH-015 FAIL: ..."; success prints
-- "AUTH-015 PASS" notices and ends with ROLLBACK.
--
-- Cases:
--   N  signed in, no course_editors row         -> forbidden, no course
--   E  editor of another course (C0)            -> ok, course_editors row
--                                                  (granted_by = E)
--   A  admin                                     -> ok, no course_editors row
--   anon                                         -> no EXECUTE
--   E  reuses a taken slug                       -> slug_taken, no stray row
--   positive control: E reads the new draft through "courses: editor read";
--   negative pair: N reads 0 rows of it.
--   cover upload: E may insert lesson-images/<new course>/..., N may not
--   ("lesson_images: editor insert", 041).
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_n   UUID := gen_random_uuid();
  v_e   UUID := gen_random_uuid();
  v_a   UUID := gen_random_uuid();
  v_c0  UUID;
  v_res JSONB;
  v_new_e UUID;
  v_new_a UUID;
  v_cnt INT;
  v_tag TEXT := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
BEGIN
  -- Seed: three auth users (handle_new_user creates their profiles).
  INSERT INTO auth.users (id, aud, role, email)
  VALUES (v_n, 'authenticated', 'authenticated', 'n-' || v_tag || '@verify.test'),
         (v_e, 'authenticated', 'authenticated', 'e-' || v_tag || '@verify.test'),
         (v_a, 'authenticated', 'authenticated', 'a-' || v_tag || '@verify.test');
  UPDATE profiles SET role = 'admin' WHERE id = v_a;

  INSERT INTO courses (slug, title, level, status, author_id)
  VALUES ('verify-c0-' || v_tag, 'Verify C0', 'A2', 'draft', v_a)
  RETURNING id INTO v_c0;
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES (v_c0, v_e, v_a);

  -- anon: no EXECUTE.
  IF has_function_privilege('anon', 'create_course(text,text,text,text)', 'execute') THEN
    RAISE EXCEPTION 'AUTH-015 FAIL: anon has EXECUTE on create_course';
  END IF;
  IF NOT has_function_privilege('authenticated', 'create_course(text,text,text,text)', 'execute') THEN
    RAISE EXCEPTION 'AUTH-015 FAIL: authenticated lacks EXECUTE on create_course';
  END IF;
  RAISE NOTICE 'AUTH-015 PASS anon EXECUTE: f, authenticated EXECUTE: t';

  -- N: forbidden.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_n, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_res := create_course('verify-n-' || v_tag, 'Verify N', 'A2', NULL);
  PERFORM set_config('role', 'postgres', true);
  IF v_res <> '{"ok": false, "error": "forbidden"}'::jsonb THEN
    RAISE EXCEPTION 'AUTH-015 FAIL: N got %', v_res;
  END IF;
  IF EXISTS (SELECT 1 FROM courses WHERE slug = 'verify-n-' || v_tag) THEN
    RAISE EXCEPTION 'AUTH-015 FAIL: N''s course exists';
  END IF;
  RAISE NOTICE 'AUTH-015 PASS N (no grant): %', v_res;

  -- E: ok + course_editors row (granted_by = E).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_e, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_res := create_course('verify-e-' || v_tag, 'Verify E', 'B1', 'by E');
  PERFORM set_config('role', 'postgres', true);
  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'AUTH-015 FAIL: E got %', v_res;
  END IF;
  v_new_e := (v_res->>'course_id')::uuid;
  SELECT count(*) INTO v_cnt FROM course_editors
  WHERE course_id = v_new_e AND user_id = v_e AND granted_by = v_e;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'AUTH-015 FAIL: E''s course_editors rows = %', v_cnt;
  END IF;
  SELECT count(*) INTO v_cnt FROM course_editors WHERE course_id = v_new_e;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'AUTH-015 FAIL: new course has % editor rows, expected 1', v_cnt;
  END IF;
  IF (SELECT status FROM courses WHERE id = v_new_e) <> 'draft'
     OR (SELECT author_id FROM courses WHERE id = v_new_e) <> v_e THEN
    RAISE EXCEPTION 'AUTH-015 FAIL: E''s course is not a draft authored by E';
  END IF;
  RAISE NOTICE 'AUTH-015 PASS E (editor of C0): ok, course_editors rows for new course: 1 (granted_by = E)';

  -- Positive control: E reads the new draft through "courses: editor read";
  -- N reads nothing (the policy is the gate, not open visibility).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_e, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_cnt FROM courses WHERE id = v_new_e;
  PERFORM set_config('role', 'postgres', true);
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'AUTH-015 FAIL: E reads % rows of their new course', v_cnt;
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_n, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_cnt FROM courses WHERE id = v_new_e;
  PERFORM set_config('role', 'postgres', true);
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'AUTH-015 FAIL: N reads % rows of E''s draft', v_cnt;
  END IF;
  RAISE NOTICE 'AUTH-015 PASS read: E sees 1 row of the new draft, N sees 0';

  -- Cover upload: "lesson_images: editor insert" (041) checks
  -- can_edit_course(<first path segment>, auth.uid()).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_e, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  INSERT INTO storage.objects (bucket_id, name, owner_id)
  VALUES ('lesson-images', v_new_e::text || '/verify-cover.png', v_e::text);
  PERFORM set_config('role', 'postgres', true);
  RAISE NOTICE 'AUTH-015 PASS storage: E inserted lesson-images/<new course>/verify-cover.png';
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_n, 'role', 'authenticated')::text, true);
    PERFORM set_config('role', 'authenticated', true);
    INSERT INTO storage.objects (bucket_id, name, owner_id)
    VALUES ('lesson-images', v_new_e::text || '/verify-n.png', v_n::text);
    RAISE EXCEPTION 'AUTH-015 FAIL: N inserted into E''s course folder';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM set_config('role', 'postgres', true);
    RAISE NOTICE 'AUTH-015 PASS storage: N denied (%)', SQLERRM;
  END;
  PERFORM set_config('role', 'postgres', true);

  -- E: taken slug -> slug_taken, and no stray course_editors row.
  SELECT count(*) INTO v_cnt FROM course_editors WHERE user_id = v_e;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_e, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_res := create_course('verify-c0-' || v_tag, 'Dup', 'A2', NULL);
  PERFORM set_config('role', 'postgres', true);
  IF v_res <> '{"ok": false, "error": "slug_taken"}'::jsonb THEN
    RAISE EXCEPTION 'AUTH-015 FAIL: duplicate slug got %', v_res;
  END IF;
  IF (SELECT count(*) FROM course_editors WHERE user_id = v_e) <> v_cnt THEN
    RAISE EXCEPTION 'AUTH-015 FAIL: refused create left a course_editors row';
  END IF;
  RAISE NOTICE 'AUTH-015 PASS E duplicate slug: %, E''s grant count unchanged (%)', v_res, v_cnt;

  -- A: ok, no course_editors row.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_res := create_course('verify-a-' || v_tag, 'Verify A', 'A2', NULL);
  PERFORM set_config('role', 'postgres', true);
  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'AUTH-015 FAIL: A got %', v_res;
  END IF;
  v_new_a := (v_res->>'course_id')::uuid;
  SELECT count(*) INTO v_cnt FROM course_editors WHERE course_id = v_new_a;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'AUTH-015 FAIL: admin''s course has % editor rows', v_cnt;
  END IF;
  RAISE NOTICE 'AUTH-015 PASS A (admin): ok, course_editors rows for new course: 0';

  -- Grant and revoke stay admin-only: E cannot grant on their own new course.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_e, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_res := grant_course_editor(v_new_e, 'n-' || v_tag || '@verify.test');
  PERFORM set_config('role', 'postgres', true);
  IF v_res <> '{"ok": false, "error": "forbidden"}'::jsonb THEN
    RAISE EXCEPTION 'AUTH-015 FAIL: E''s grant got %', v_res;
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_e, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_res := revoke_course_editor(v_new_e, v_e);
  PERFORM set_config('role', 'postgres', true);
  IF v_res->>'error' IS DISTINCT FROM 'forbidden' THEN
    RAISE EXCEPTION 'AUTH-015 FAIL: E''s revoke got %', v_res;
  END IF;
  RAISE NOTICE 'AUTH-015 PASS grant/revoke by E: forbidden';

  RAISE NOTICE 'AUTH-015 PASS all cases; rolling back';
END;
$$;

ROLLBACK;
