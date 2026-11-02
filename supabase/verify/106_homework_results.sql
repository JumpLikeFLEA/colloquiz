-- ============================================================
-- supabase/verify/106_homework_results.sql
--
-- TCH-018 full protocol for migration 106 (needs 075, 076, 080). NOT a
-- migration: run after 106 is applied, as postgres. Seeds its own data and
-- ROLLS BACK. Failure aborts with "TCH-018 FAIL: ...". Every denial is paired
-- with a positive control proving the rows it would hide exist.
-- ============================================================
BEGIN;

CREATE FUNCTION pg_temp.as_user(p_user UUID, p_sql TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  EXECUTE p_sql INTO v;
  PERFORM set_config('role', 'postgres', true);
  RETURN v;
END;
$$;

CREATE FUNCTION pg_temp.check_eq(p_label TEXT, p_got TEXT, p_want TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE '% -> got % (want %)', p_label, p_got, p_want;
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'TCH-018 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

DO $$
DECLARE
  t  UUID := gen_random_uuid();   -- teacher, owns the assignments
  t2 UUID := gen_random_uuid();   -- another teacher, linked to s3 only
  s  UUID := gen_random_uuid();   -- recipient, linked, attempts
  s2 UUID := gen_random_uuid();   -- recipient, linked, no attempts
  s3 UUID := gen_random_uuid();   -- linked to t2 only, has attempts, never t's recipient
  s4 UUID := gen_random_uuid();   -- recipient whose link will end
  n  UUID := gen_random_uuid();   -- neither
  v_c UUID; v_l1 UUID; v_l2 UUID; v_v1 UUID; v_v1old UUID; v_v2 UUID;
  v_a_course UUID; v_a_lesson UUID; v_a_other UUID;
  v_doc JSONB;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (t,  'authenticated', 'authenticated', 't-'  || t  || '@verify.test'),
    (t2, 'authenticated', 'authenticated', 't2-' || t2 || '@verify.test'),
    (s,  'authenticated', 'authenticated', 's-'  || s  || '@verify.test'),
    (s2, 'authenticated', 'authenticated', 's2-' || s2 || '@verify.test'),
    (s3, 'authenticated', 'authenticated', 's3-' || s3 || '@verify.test'),
    (s4, 'authenticated', 'authenticated', 's4-' || s4 || '@verify.test'),
    (n,  'authenticated', 'authenticated', 'n-'  || n  || '@verify.test');

  v_doc := jsonb_build_array(
    jsonb_build_object('id', 'th1', 'kind', 'theory', 'type', 'paragraph'),
    jsonb_build_object('id', 'ex1', 'kind', 'practice', 'type', 'selection', 'payload', jsonb_build_object('prompt', 'One')),
    jsonb_build_object('id', 'ex2', 'kind', 'practice', 'type', 'selection', 'payload', jsonb_build_object('prompt', 'Two')));

  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v106', 'C', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO v_c;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_c, 1, 'L1', 'l1', 'anyone') RETURNING id INTO v_l1;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_c, 2, 'L2', 'l2', 'anyone') RETURNING id INTO v_l2;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_l1, v_doc, 'editor') RETURNING id INTO v_v1old;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_l1, v_doc, 'editor') RETURNING id INTO v_v1;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_l2, v_doc, 'editor') RETURNING id INTO v_v2;
  UPDATE lessons SET published_version_id = v_v1 WHERE id = v_l1;
  UPDATE lessons SET published_version_id = v_v2 WHERE id = v_l2;

  INSERT INTO teacher_student_links (teacher_id, student_id, source) VALUES
    (t, s, 'join_link'), (t, s2, 'join_link'), (t, s4, 'join_link'), (t2, s3, 'join_link');

  INSERT INTO homework_assignments (teacher_id, course_id, lesson_id) VALUES (t, v_c, NULL) RETURNING id INTO v_a_course;
  INSERT INTO homework_assignments (teacher_id, course_id, lesson_id) VALUES (t, v_c, v_l1) RETURNING id INTO v_a_lesson;
  INSERT INTO homework_assignments (teacher_id, course_id, lesson_id) VALUES (t2, v_c, v_l1) RETURNING id INTO v_a_other;
  INSERT INTO homework_targets (assignment_id, teacher_id, student_id) VALUES
    (v_a_course, t, s), (v_a_course, t, s2), (v_a_course, t, s4),
    (v_a_lesson, t, s), (v_a_lesson, t, s2),
    (v_a_other, t2, s3);

  -- s: ex1 on the published version twice (0/1 then 1/1: best is 1/1); ex2 of L1
  -- only on an OLD version (must not count); ex2 of L2 once (1/2). s3, s4 attempt too.
  INSERT INTO lesson_attempts (id, user_id, lesson_version_id, block_id, earned, possible, response, created_at) VALUES
    (gen_random_uuid(), s,  v_v1,    'ex1', 0, 1, '{"selectedOptionIds":["b"]}', now() - interval '2 hours'),
    (gen_random_uuid(), s,  v_v1,    'ex1', 1, 1, '{"selectedOptionIds":["a"]}', now() - interval '1 hour'),
    (gen_random_uuid(), s,  v_v1old, 'ex2', 1, 1, '{"selectedOptionIds":["a"]}', now()),
    (gen_random_uuid(), s,  v_v2,    'ex2', 1, 2, '{"selectedOptionIds":["c"]}', now()),
    (gen_random_uuid(), s3, v_v1,    'ex1', 1, 1, '{"selectedOptionIds":["a"]}', now()),
    (gen_random_uuid(), s4, v_v1,    'ex1', 1, 1, '{"selectedOptionIds":["a"]}', now());

  PERFORM pg_temp.check_eq('seed: 6 attempts exist (table is not empty)',
    (SELECT count(*)::text FROM lesson_attempts WHERE user_id IN (s, s3, s4)), '6');

  -- 1. lesson assignment: 2 recipients x 2 exercises of L1 ---------------------
  PERFORM pg_temp.check_eq('t, lesson assignment: 4 cells (positive control)',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.homework_results(%L) $q$, v_a_lesson)), '4');
  PERFORM pg_temp.check_eq('s ex1: best attempt is 1/1, not the earlier 0/1',
    pg_temp.as_user(t, format($q$ SELECT earned || '/' || possible FROM public.homework_results(%L) WHERE student_id = %L AND block_id = 'ex1' $q$, v_a_lesson, s)), '1/1');
  PERFORM pg_temp.check_eq('s ex1: the best attempt response comes back',
    pg_temp.as_user(t, format($q$ SELECT response->'selectedOptionIds'->>0 FROM public.homework_results(%L) WHERE student_id = %L AND block_id = 'ex1' $q$, v_a_lesson, s)), 'a');
  PERFORM pg_temp.check_eq('s ex2: an attempt only on an old version shows as no attempt',
    pg_temp.as_user(t, format($q$ SELECT coalesce(earned::text, 'none') FROM public.homework_results(%L) WHERE student_id = %L AND block_id = 'ex2' $q$, v_a_lesson, s)), 'none');
  PERFORM pg_temp.check_eq('s2 (no attempts) still has a row per exercise, with no score',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.homework_results(%L) WHERE student_id = %L AND earned IS NULL $q$, v_a_lesson, s2)), '2');
  PERFORM pg_temp.check_eq('the block rides along, in document order',
    pg_temp.as_user(t, format($q$ SELECT string_agg(block_id || ':' || (block->>'kind'), ',' ORDER BY block_pos) FROM public.homework_results(%L) WHERE student_id = %L $q$, v_a_lesson, s)), 'ex1:practice,ex2:practice');

  -- 2. course assignment: both lessons, three recipients -------------------------
  PERFORM pg_temp.check_eq('t, course assignment: 3 recipients x 4 exercises = 12 (positive control)',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.homework_results(%L) $q$, v_a_course)), '12');
  PERFORM pg_temp.check_eq('s on L2 ex2: 1/2',
    pg_temp.as_user(t, format($q$ SELECT earned || '/' || possible FROM public.homework_results(%L) WHERE student_id = %L AND lesson_id = %L AND block_id = 'ex2' $q$, v_a_course, s, v_l2)), '1/2');

  -- 3. denials, each against rows that exist ---------------------------------------
  PERFORM pg_temp.check_eq('t2 reads own assignment: s3 x 2 exercises (positive control)',
    pg_temp.as_user(t2, format($q$ SELECT count(*)::text FROM public.homework_results(%L) $q$, v_a_other)), '2');
  PERFORM pg_temp.check_eq('not the teacher: t2 on the assignment of t sees nothing',
    pg_temp.as_user(t2, format($q$ SELECT count(*)::text FROM public.homework_results(%L) $q$, v_a_lesson)), '0');
  PERFORM pg_temp.check_eq('t on the assignment of t2 sees nothing',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.homework_results(%L) $q$, v_a_other)), '0');
  PERFORM pg_temp.check_eq('a student sees nothing',
    pg_temp.as_user(s, format($q$ SELECT count(*)::text FROM public.homework_results(%L) $q$, v_a_lesson)), '0');
  PERFORM pg_temp.check_eq('a stranger sees nothing',
    pg_temp.as_user(n, format($q$ SELECT count(*)::text FROM public.homework_results(%L) $q$, v_a_lesson)), '0');
  PERFORM pg_temp.check_eq('t never sees s3 (linked to t2 only), though s3 has an attempt',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.homework_results(%L) WHERE student_id = %L $q$, v_a_course, s3)), '0');
  PERFORM pg_temp.check_eq('anon has no EXECUTE',
    (SELECT has_function_privilege('anon', 'public.homework_results(uuid)', 'EXECUTE'))::text, 'false');

  -- 4. an ended link drops the student ---------------------------------------------
  UPDATE teacher_student_links SET ended_at = now(), ended_by = s4 WHERE teacher_id = t AND student_id = s4;
  PERFORM pg_temp.check_eq('after the s4 link ends: 2 recipients x 4 = 8',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.homework_results(%L) $q$, v_a_course)), '8');
  PERFORM pg_temp.check_eq('after the s4 link ends: no row for s4, though s4 has an attempt',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.homework_results(%L) WHERE student_id = %L $q$, v_a_course, s4)), '0');

  -- 5. an archived lesson leaves a course assignment ---------------------------------
  UPDATE lessons SET archived_at = now() WHERE id = v_l2;
  PERFORM pg_temp.check_eq('archived L2 leaves the course assignment: 2 x 2 = 4',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.homework_results(%L) $q$, v_a_course)), '4');

  RAISE NOTICE 'TCH-018 PASS: homework_results';
END;
$$;

ROLLBACK;
