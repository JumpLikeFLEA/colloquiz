-- ============================================================
-- supabase/verify/078_linked_student_answers.sql
--
-- TCH-003 full protocol for migration 078 (needs 074, 075, 076 applied).
-- NOT a migration: run after 078 is applied, as postgres. Seeds its own data
-- and ROLLS BACK. A failed assertion aborts with "TCH-003 FAIL: ...". Every
-- denial is paired with a positive control proving the rows it would have
-- hidden exist.
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
    RAISE EXCEPTION 'TCH-003 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

DO $$
DECLARE
  t  UUID := gen_random_uuid();   -- teacher, edits course A, linked to s
  t2 UUID := gen_random_uuid();   -- another teacher, edits course A, NOT linked
  t3 UUID := gen_random_uuid();   -- teacher linked to s, edits course B only
  t4 UUID := gen_random_uuid();   -- teacher whose link to s2 has ended
  s  UUID := gen_random_uuid();   -- student
  s2 UUID := gen_random_uuid();   -- student with an ended link to t4
  n  UUID := gen_random_uuid();   -- neither
  v_a UUID; v_b UUID; v_la UUID; v_lb UUID; v_va UUID; v_vb UUID;
  v_doc JSONB;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (t,  'authenticated', 'authenticated', 't-'  || t  || '@verify.test'),
    (t2, 'authenticated', 'authenticated', 't2-' || t2 || '@verify.test'),
    (t3, 'authenticated', 'authenticated', 't3-' || t3 || '@verify.test'),
    (t4, 'authenticated', 'authenticated', 't4-' || t4 || '@verify.test'),
    (s,  'authenticated', 'authenticated', 's-'  || s  || '@verify.test'),
    (s2, 'authenticated', 'authenticated', 's2-' || s2 || '@verify.test'),
    (n,  'authenticated', 'authenticated', 'n-'  || n  || '@verify.test');

  v_doc := jsonb_build_array(
    jsonb_build_object('id', 'th1', 'kind', 'theory', 'type', 'paragraph'),
    jsonb_build_object('id', 'ex1', 'kind', 'practice', 'type', 'selection',
      'payload', jsonb_build_object('prompt', 'Pick')));

  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v78-a', 'A', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO v_a;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v78-b', 'B', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO v_b;
  INSERT INTO course_editors (course_id, user_id, granted_by)
  VALUES (v_a, t, t), (v_a, t2, t2), (v_a, t4, t4), (v_b, t3, t3);
  -- TCH-008: 083 freezes a writer with no active seat, so every seeded editor
  -- gets the open-ended seat 082's backfill gave the real ones.
  INSERT INTO author_seats (user_id, kind, public_name)
  SELECT DISTINCT ce.user_id, 'teacher', 'Verify seat' FROM course_editors ce
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_a, 1, 'LA', 'la', 'anyone') RETURNING id INTO v_la;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_b, 1, 'LB', 'lb', 'anyone') RETURNING id INTO v_lb;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_la, v_doc, 'editor') RETURNING id INTO v_va;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_lb, v_doc, 'editor') RETURNING id INTO v_vb;
  UPDATE lessons SET published_version_id = v_va WHERE id = v_la;
  UPDATE lessons SET published_version_id = v_vb WHERE id = v_lb;

  -- Links: t -> s and t3 -> s active; t4 -> s2 ended. t2 has none.
  INSERT INTO teacher_student_links (teacher_id, student_id, source) VALUES
    (t, s, 'join_link'), (t3, s, 'join_link');
  INSERT INTO teacher_student_links (teacher_id, student_id, source, ended_at, ended_by)
  VALUES (t4, s2, 'join_link', now(), s2);

  -- Attempts as the owner would have written them: s on A (two attempts at
  -- ex1, one with a stored response and one without) and on B; s2 on A.
  INSERT INTO lesson_attempts (id, user_id, lesson_version_id, block_id, earned, possible, response, created_at) VALUES
    (gen_random_uuid(), s,  v_va, 'ex1', 0, 1, '{"selectedOptionIds":["b"]}', now() - interval '2 hours'),
    (gen_random_uuid(), s,  v_va, 'ex1', 1, 1, NULL,                          now() - interval '1 hour'),
    (gen_random_uuid(), s,  v_vb, 'ex1', 1, 1, '{"selectedOptionIds":["a"]}', now()),
    (gen_random_uuid(), s2, v_va, 'ex1', 1, 1, '{"selectedOptionIds":["a"]}', now());

  PERFORM pg_temp.check_eq('seed: s and s2 have 4 attempts between them (table is not empty)',
    (SELECT count(*)::text FROM lesson_attempts WHERE user_id IN (s, s2)), '4');

  -- 1. attempts: the linked teacher sees A only, with the block and response --
  PERFORM pg_temp.check_eq('t reads s: 2 attempts on A (positive control)',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.linked_student_attempts(%L) $q$, s)), '2');
  PERFORM pg_temp.check_eq('t reads s: nothing from course B (not edited)',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.linked_student_attempts(%L) WHERE course_id = %L $q$, s, v_b)), '0');
  PERFORM pg_temp.check_eq('t reads s: response comes back',
    pg_temp.as_user(t, format($q$ SELECT response->'selectedOptionIds'->>0 FROM public.linked_student_attempts(%L) WHERE response IS NOT NULL $q$, s)), 'b');
  PERFORM pg_temp.check_eq('t reads s: the missing response stays NULL',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.linked_student_attempts(%L) WHERE response IS NULL $q$, s)), '1');
  PERFORM pg_temp.check_eq('t reads s: the block is the version document practice block',
    pg_temp.as_user(t, format($q$ SELECT (block->>'id') || ':' || (block->>'kind') FROM public.linked_student_attempts(%L) LIMIT 1 $q$, s)), 'ex1:practice');
  -- t3 edits B only: sees B's attempt, none of A's.
  PERFORM pg_temp.check_eq('t3 reads s: 1 attempt, on B (positive control)',
    pg_temp.as_user(t3, format($q$ SELECT count(*)::text FROM public.linked_student_attempts(%L) $q$, s)), '1');
  PERFORM pg_temp.check_eq('t3 reads s: none from A',
    pg_temp.as_user(t3, format($q$ SELECT count(*)::text FROM public.linked_student_attempts(%L) WHERE course_id = %L $q$, s, v_a)), '0');

  -- 2. denials, each against rows that exist (seed check above) ---------------
  PERFORM pg_temp.check_eq('unlinked teacher t2 (edits A) sees nothing of s',
    pg_temp.as_user(t2, format($q$ SELECT count(*)::text FROM public.linked_student_attempts(%L) $q$, s)), '0');
  PERFORM pg_temp.check_eq('non-teacher sees nothing of s',
    pg_temp.as_user(n, format($q$ SELECT count(*)::text FROM public.linked_student_attempts(%L) $q$, s)), '0');
  PERFORM pg_temp.check_eq('the student calling it on their own id gets nothing',
    pg_temp.as_user(s, format($q$ SELECT count(*)::text FROM public.linked_student_attempts(%L) $q$, s)), '0');
  PERFORM pg_temp.check_eq('ended link t4 -> s2: nothing, though s2 has an attempt on A',
    pg_temp.as_user(t4, format($q$ SELECT count(*)::text FROM public.linked_student_attempts(%L) $q$, s2)), '0');
  PERFORM pg_temp.check_eq('t (linked to s only) sees nothing of s2',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.linked_student_attempts(%L) $q$, s2)), '0');
  PERFORM pg_temp.check_eq('anon has no EXECUTE on attempts',
    (SELECT has_function_privilege('anon', 'public.linked_student_attempts(uuid)', 'EXECUTE'))::text, 'false');
  PERFORM pg_temp.check_eq('anon has no EXECUTE on scores',
    (SELECT has_function_privilege('anon', 'public.linked_student_lesson_scores(uuid)', 'EXECUTE'))::text, 'false');
  PERFORM pg_temp.check_eq('no direct table read for a teacher (lesson_attempts stays owner-read)',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.lesson_attempts WHERE user_id = %L $q$, s)), '0');

  -- 3. an ended link stops the read; relinking restores it ---------------------
  UPDATE teacher_student_links SET ended_at = now(), ended_by = s WHERE teacher_id = t AND student_id = s;
  PERFORM pg_temp.check_eq('t after the link ends: nothing',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.linked_student_attempts(%L) $q$, s)), '0');
  PERFORM pg_temp.check_eq('t3 unaffected by the end of t link (positive control)',
    pg_temp.as_user(t3, format($q$ SELECT count(*)::text FROM public.linked_student_attempts(%L) $q$, s)), '1');
  UPDATE teacher_student_links SET ended_at = NULL, ended_by = NULL WHERE teacher_id = t AND student_id = s;
  PERFORM pg_temp.check_eq('t after the link is active again: 2 (positive control)',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.linked_student_attempts(%L) $q$, s)), '2');

  -- 4. best lesson score: lesson_completion definition, same gates --------------
  -- A has one exercise (ex1); the best attempt on it is 1/1, so 100 and complete.
  PERFORM pg_temp.check_eq('t reads s score on A: 100',
    pg_temp.as_user(t, format($q$ SELECT best_percent::text FROM public.linked_student_lesson_scores(%L) WHERE lesson_id = %L $q$, s, v_la)), '100');
  PERFORM pg_temp.check_eq('t reads s score on A: complete',
    pg_temp.as_user(t, format($q$ SELECT complete::text FROM public.linked_student_lesson_scores(%L) WHERE lesson_id = %L $q$, s, v_la)), 'true');
  PERFORM pg_temp.check_eq('t reads s scores: nothing for course B',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.linked_student_lesson_scores(%L) WHERE course_id = %L $q$, s, v_b)), '0');
  PERFORM pg_temp.check_eq('t3 reads s score on B (positive control)',
    pg_temp.as_user(t3, format($q$ SELECT best_percent::text FROM public.linked_student_lesson_scores(%L) WHERE lesson_id = %L $q$, s, v_lb)), '100');
  PERFORM pg_temp.check_eq('unlinked t2: no scores',
    pg_temp.as_user(t2, format($q$ SELECT count(*)::text FROM public.linked_student_lesson_scores(%L) $q$, s)), '0');
  PERFORM pg_temp.check_eq('ended link t4 -> s2: no scores',
    pg_temp.as_user(t4, format($q$ SELECT count(*)::text FROM public.linked_student_lesson_scores(%L) $q$, s2)), '0');
  PERFORM pg_temp.check_eq('non-teacher: no scores',
    pg_temp.as_user(n, format($q$ SELECT count(*)::text FROM public.linked_student_lesson_scores(%L) $q$, s)), '0');

  RAISE NOTICE 'TCH-003 PASS';
END;
$$;

ROLLBACK;
