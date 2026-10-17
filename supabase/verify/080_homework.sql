-- ============================================================
-- supabase/verify/080_homework.sql
--
-- TCH-005 full protocol for migration 080 (needs 058, 074..079 applied).
-- NOT a migration: run after 080 is applied, as postgres. Seeds its own data
-- and ROLLS BACK. A failed assertion aborts with "TCH-005 FAIL: ...". Every
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

-- An anonymous caller: role anon, no sub.
CREATE FUNCTION pg_temp.as_anon(p_sql TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  PERFORM set_config('role', 'anon', true);
  EXECUTE p_sql INTO v;
  PERFORM set_config('role', 'postgres', true);
  RETURN v;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('role', 'postgres', true);
  RETURN 'ERR:' || SQLSTATE;
END;
$$;

CREATE FUNCTION pg_temp.check_eq(p_label TEXT, p_got TEXT, p_want TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE '% -> got % (want %)', p_label, p_got, p_want;
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'TCH-005 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

DO $$
DECLARE
  t  UUID := gen_random_uuid();   -- teacher: edits E and D, linked to s, s3, s4, s2 (ended)
  t2 UUID := gen_random_uuid();   -- another teacher: edits E2, linked to nobody
  o  UUID := gen_random_uuid();   -- the owner of P and Q (a third teacher)
  s  UUID := gen_random_uuid();   -- student, linked to t
  s2 UUID := gen_random_uuid();   -- student whose link to t ends during the run
  s3 UUID := gen_random_uuid();   -- student linked to t, in group g
  s4 UUID := gen_random_uuid();   -- student linked to t, added to g LATER
  n  UUID := gen_random_uuid();   -- not a teacher, not linked
  v_p UUID; v_q UUID; v_d UUID; v_e UUID; v_e2 UUID;
  v_p1 UUID; v_p2 UUID; v_q1 UUID; v_d1 UUID; v_e1 UUID;
  v_vp1 UUID; v_vp2 UUID; v_vq1 UUID; v_vd1 UUID; v_ve1 UUID;
  v_g UUID; v_g_other UUID;
  v_hw_lesson UUID; v_hw_course UUID; v_hw_group UUID; v_hw_q UUID; v_hw_draft UUID; v_hw_s2 UUID;
  v_res TEXT;
  v_doc JSONB;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (t,  'authenticated', 'authenticated', 't-'  || t  || '@verify.test'),
    (t2, 'authenticated', 'authenticated', 't2-' || t2 || '@verify.test'),
    (o,  'authenticated', 'authenticated', 'o-'  || o  || '@verify.test'),
    (s,  'authenticated', 'authenticated', 's-'  || s  || '@verify.test'),
    (s2, 'authenticated', 'authenticated', 's2-' || s2 || '@verify.test'),
    (s3, 'authenticated', 'authenticated', 's3-' || s3 || '@verify.test'),
    (s4, 'authenticated', 'authenticated', 's4-' || s4 || '@verify.test'),
    (n,  'authenticated', 'authenticated', 'n-'  || n  || '@verify.test');

  v_doc := jsonb_build_array(
    jsonb_build_object('id', 'th1', 'kind', 'theory', 'type', 'paragraph'),
    jsonb_build_object('id', 'ex1', 'kind', 'practice', 'type', 'selection',
      'payload', jsonb_build_object('prompt', 'Pick')));

  -- P: published, edited by o (NOT by t). Two anyone-lessons.
  -- Q: published, edited by o, one ENTITLED lesson.
  -- D: DRAFT, edited by t. E: published, edited by t. E2: published, edited by t2.
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v80-p', 'P', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO v_p;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v80-q', 'Q', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO v_q;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v80-d', 'D', 'A2', 'draft', 'self_paced', 's', 'c') RETURNING id INTO v_d;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v80-e', 'E', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO v_e;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v80-e2', 'E2', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO v_e2;
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES
    (v_p, o, o), (v_q, o, o), (v_d, t, t), (v_e, t, t), (v_e2, t2, t2);
  -- TCH-008: 083 freezes a writer with no active seat, so every seeded editor
  -- gets the open-ended seat 082's backfill gave the real ones.
  INSERT INTO author_seats (user_id, kind, public_name)
  SELECT DISTINCT ce.user_id, 'teacher', 'Verify seat' FROM course_editors ce
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_p, 1, 'P1', 'p1', 'anyone') RETURNING id INTO v_p1;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_p, 2, 'P2', 'p2', 'anyone') RETURNING id INTO v_p2;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_q, 1, 'Q1', 'q1', 'entitled') RETURNING id INTO v_q1;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_d, 1, 'D1', 'd1', 'anyone') RETURNING id INTO v_d1;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_e, 1, 'E1', 'e1', 'anyone') RETURNING id INTO v_e1;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_p1, v_doc, 'editor') RETURNING id INTO v_vp1;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_p2, v_doc, 'editor') RETURNING id INTO v_vp2;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_q1, v_doc, 'editor') RETURNING id INTO v_vq1;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_d1, v_doc, 'editor') RETURNING id INTO v_vd1;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_e1, v_doc, 'editor') RETURNING id INTO v_ve1;
  UPDATE lessons SET published_version_id = v_vp1 WHERE id = v_p1;
  UPDATE lessons SET published_version_id = v_vp2 WHERE id = v_p2;
  UPDATE lessons SET published_version_id = v_vq1 WHERE id = v_q1;
  UPDATE lessons SET published_version_id = v_vd1 WHERE id = v_d1;
  UPDATE lessons SET published_version_id = v_ve1 WHERE id = v_e1;

  INSERT INTO teacher_student_links (teacher_id, student_id, source) VALUES
    (t, s, 'join_link'), (t, s2, 'join_link'), (t, s3, 'join_link'), (t, s4, 'join_link');

  -- Attempts: s on P1 (right) and P2 (wrong); s3 on P1; s on Q1 is impossible
  -- (entitled) so none.
  INSERT INTO lesson_attempts (id, user_id, lesson_version_id, block_id, earned, possible, response, created_at) VALUES
    (gen_random_uuid(), s,  v_vp1, 'ex1', 1, 1, '{"selectedOptionIds":["a"]}', now() - interval '2 hours'),
    (gen_random_uuid(), s,  v_vp2, 'ex1', 0, 1, '{"selectedOptionIds":["b"]}', now() - interval '1 hour'),
    (gen_random_uuid(), s3, v_vp1, 'ex1', 1, 1, '{"selectedOptionIds":["a"]}', now() - interval '30 minutes');
  PERFORM pg_temp.check_eq('seed: s and s3 have 3 attempts between them (table is not empty)',
    (SELECT count(*)::text FROM lesson_attempts WHERE user_id IN (s, s3)), '3');
  INSERT INTO teacher_groups (teacher_id, name) VALUES (t, 'g') RETURNING id INTO v_g;
  INSERT INTO teacher_groups (teacher_id, name) VALUES (t2, 'g2') RETURNING id INTO v_g_other;
  INSERT INTO teacher_group_members (group_id, teacher_id, student_id) VALUES (v_g, t, s3);

  -- 0. before any assignment: t reads nothing of P (positive control: s has P attempts)
  PERFORM pg_temp.check_eq('before: t reads no attempts on P (not edited, nothing assigned)',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.linked_student_attempts(%L) $q$, s)), '0');
  PERFORM pg_temp.check_eq('before: t has no scores for s',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.linked_student_lesson_scores(%L) $q$, s)), '0');
  PERFORM pg_temp.check_eq('before: s has no homework',
    pg_temp.as_user(s, $q$ SELECT count(*)::text FROM public.my_homework() $q$), '0');

  -- 1. assign ONE lesson (P1) to s; the date is long past -------------------------
  v_res := pg_temp.as_user(t, format(
    $q$ SELECT public.assign_homework(%L, %L, DATE '2020-01-01', '  Do this  ', ARRAY[%L]::uuid[], ARRAY[]::uuid[])::text $q$,
    v_p, v_p1, s));
  PERFORM pg_temp.check_eq('t assigns P1 to s: ok', (v_res::jsonb->>'ok'), 'true');
  v_hw_lesson := (v_res::jsonb->>'id')::uuid;
  PERFORM pg_temp.check_eq('the note is trimmed',
    (SELECT note FROM homework_assignments WHERE id = v_hw_lesson), 'Do this');

  -- 2. the single-lesson scope: P1 only, not the rest of the course ---------------
  PERFORM pg_temp.check_eq('single lesson: t reads 1 attempt of s, on P1 (positive control)',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.linked_student_attempts(%L) WHERE lesson_id = %L $q$, s, v_p1)), '1');
  PERFORM pg_temp.check_eq('single lesson: NOTHING from P2, though s has an attempt there',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.linked_student_attempts(%L) WHERE lesson_id = %L $q$, s, v_p2)), '0');
  PERFORM pg_temp.check_eq('single lesson: the score of P1 (100)',
    pg_temp.as_user(t, format($q$ SELECT best_percent::text FROM public.linked_student_lesson_scores(%L) WHERE lesson_id = %L $q$, s, v_p1)), '100');
  PERFORM pg_temp.check_eq('single lesson: no score row for P2',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.linked_student_lesson_scores(%L) WHERE lesson_id = %L $q$, s, v_p2)), '0');
  PERFORM pg_temp.check_eq('single lesson: assigned_lessons lists P1 only',
    pg_temp.as_user(t, format($q$ SELECT string_agg(lesson_title, ',' ORDER BY lesson_ordinal) FROM public.linked_student_assigned_lessons(%L) $q$, s)), 'P1');
  PERFORM pg_temp.check_eq('single lesson: t reads nothing of s3 (no assignment covers s3)',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.linked_student_attempts(%L) $q$, s3)), '0');
  PERFORM pg_temp.check_eq('the homework gives t no direct table read',
    (SELECT has_table_privilege('authenticated', 'public.homework_assignments', 'SELECT'))::text, 'false');
  PERFORM pg_temp.check_eq('nor on targets',
    (SELECT has_table_privilege('authenticated', 'public.homework_targets', 'SELECT'))::text, 'false');

  -- 3. the learner's view; a due date in the past locks nothing --------------------
  PERFORM pg_temp.check_eq('s sees 1 homework row',
    pg_temp.as_user(s, $q$ SELECT count(*)::text FROM public.my_homework() $q$), '1');
  PERFORM pg_temp.check_eq('s: lesson homework, done (P1 complete)',
    pg_temp.as_user(s, $q$ SELECT done::text FROM public.my_homework() $q$), 'true');
  PERFORM pg_temp.check_eq('s: state of P1 is open despite the past due date',
    pg_temp.as_user(s, $q$ SELECT state FROM public.my_homework() $q$), 'open');
  PERFORM pg_temp.check_eq('s: the access function itself says open (the due date is not read)',
    (SELECT a.state FROM public._lesson_access_at(v_p1, s, now()) a), 'open');
  PERFORM pg_temp.check_eq('s: due date comes back as given',
    pg_temp.as_user(s, $q$ SELECT due_on::text FROM public.my_homework() $q$), '2020-01-01');
  PERFORM pg_temp.check_eq('s: 1 of 1 lessons',
    pg_temp.as_user(s, $q$ SELECT done_lessons || '/' || total_lessons FROM public.my_homework() $q$), '1/1');
  PERFORM pg_temp.check_eq('s3 (not targeted directly, group g has no assignment yet) sees none',
    pg_temp.as_user(s3, $q$ SELECT count(*)::text FROM public.my_homework() $q$), '0');
  PERFORM pg_temp.check_eq('export: s has 1 homework row',
    pg_temp.as_user(s, $q$ SELECT count(*)::text FROM public.my_homework_export() $q$), '1');

  -- 4. widen to the whole course for s: P2 appears (positive control for 2) --------
  v_res := pg_temp.as_user(t, format(
    $q$ SELECT public.assign_homework(%L, NULL, NULL, NULL, ARRAY[%L]::uuid[], ARRAY[]::uuid[])::text $q$, v_p, s));
  v_hw_course := (v_res::jsonb->>'id')::uuid;
  PERFORM pg_temp.check_eq('course assignment: t now reads s on P2 too (positive control)',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.linked_student_attempts(%L) WHERE lesson_id = %L $q$, s, v_p2)), '1');
  PERFORM pg_temp.check_eq('course assignment: both lessons listed',
    pg_temp.as_user(t, format($q$ SELECT string_agg(lesson_title, ',' ORDER BY lesson_ordinal) FROM public.linked_student_assigned_lessons(%L) $q$, s)), 'P1,P2');
  PERFORM pg_temp.check_eq('s: course homework is done (both lessons answered)',
    pg_temp.as_user(s, format($q$ SELECT done::text FROM public.my_homework() WHERE assignment_id = %L $q$, v_hw_course)), 'true');
  PERFORM pg_temp.check_eq('s: course progress 2/2',
    pg_temp.as_user(s, format($q$ SELECT done_lessons || '/' || total_lessons FROM public.my_homework() WHERE assignment_id = %L $q$, v_hw_course)), '2/2');
  PERFORM pg_temp.check_eq('s: no due date shown as NULL',
    pg_temp.as_user(s, format($q$ SELECT (due_on IS NULL)::text FROM public.my_homework() WHERE assignment_id = %L $q$, v_hw_course)), 'true');
  -- The teacher's progress: best for the course = average over completed lessons
  -- (P1 100, P2 0) = 50.
  PERFORM pg_temp.check_eq('t progress: course assignment, s best = 50',
    pg_temp.as_user(t, format($q$ SELECT best_percent::text FROM public.teacher_homework_progress() WHERE assignment_id = %L AND student_id = %L $q$, v_hw_course, s)), '50');
  PERFORM pg_temp.check_eq('t progress: lesson assignment, s best = 100, done',
    pg_temp.as_user(t, format($q$ SELECT best_percent || ':' || done FROM public.teacher_homework_progress() WHERE assignment_id = %L AND student_id = %L $q$, v_hw_lesson, s)), '100:true');
  PERFORM pg_temp.check_eq('t progress: last activity is set',
    pg_temp.as_user(t, format($q$ SELECT (last_activity_at IS NOT NULL)::text FROM public.teacher_homework_progress() WHERE assignment_id = %L AND student_id = %L $q$, v_hw_course, s)), 'true');

  -- 5. a group: its open homework applies to a student added LATER -----------------
  v_res := pg_temp.as_user(t, format(
    $q$ SELECT public.assign_homework(%L, NULL, NULL, 'for g', ARRAY[]::uuid[], ARRAY[%L]::uuid[])::text $q$, v_p, v_g));
  PERFORM pg_temp.check_eq('t assigns P to group g: ok', (v_res::jsonb->>'ok'), 'true');
  v_hw_group := (v_res::jsonb->>'id')::uuid;
  PERFORM pg_temp.check_eq('s3 (a member of g) sees the group homework',
    pg_temp.as_user(s3, $q$ SELECT count(*)::text FROM public.my_homework() $q$), '1');
  PERFORM pg_temp.check_eq('s3: progress 1/2 (P1 answered, P2 not): not done',
    pg_temp.as_user(s3, $q$ SELECT done_lessons || '/' || total_lessons || ':' || done FROM public.my_homework() $q$), '1/2:false');
  PERFORM pg_temp.check_eq('t reads s3 now (the group assignment covers the whole course)',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.linked_student_attempts(%L) $q$, s3)), '1');
  PERFORM pg_temp.check_eq('s4 (not yet in g) sees none (positive control for the next check)',
    pg_temp.as_user(s4, $q$ SELECT count(*)::text FROM public.my_homework() $q$), '0');
  PERFORM pg_temp.check_eq('s4 is added to g: ok',
    pg_temp.as_user(t, format($q$ SELECT public.add_teacher_group_members(%L, ARRAY[%L]::uuid[])::text $q$, v_g, s4))::jsonb->>'ok', 'true');
  PERFORM pg_temp.check_eq('s4 now sees the group homework, assigned before s4 joined',
    pg_temp.as_user(s4, $q$ SELECT count(*)::text FROM public.my_homework() $q$), '1');
  PERFORM pg_temp.check_eq('t progress: both group members listed for the group assignment',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.teacher_homework_progress() WHERE assignment_id = %L $q$, v_hw_group)), '2');
  PERFORM pg_temp.check_eq('s4 is removed from g: the homework goes with the membership',
    pg_temp.as_user(t, format($q$ SELECT public.remove_teacher_group_member(%L, %L)::text $q$, v_g, s4))::jsonb->>'ok', 'true');
  PERFORM pg_temp.check_eq('s4 sees none again',
    pg_temp.as_user(s4, $q$ SELECT count(*)::text FROM public.my_homework() $q$), '0');

  -- 6. another teacher cannot see or change it --------------------------------------
  PERFORM pg_temp.check_eq('t sees its assignments in the list (positive control)',
    pg_temp.as_user(t, $q$ SELECT count(*)::text FROM public.teacher_homework_list() $q$), '3');
  PERFORM pg_temp.check_eq('t2 sees none in the list',
    pg_temp.as_user(t2, $q$ SELECT count(*)::text FROM public.teacher_homework_list() $q$), '0');
  PERFORM pg_temp.check_eq('t2 sees no targets',
    pg_temp.as_user(t2, $q$ SELECT count(*)::text FROM public.teacher_homework_targets() $q$), '0');
  PERFORM pg_temp.check_eq('t2 sees no progress',
    pg_temp.as_user(t2, $q$ SELECT count(*)::text FROM public.teacher_homework_progress() $q$), '0');
  PERFORM pg_temp.check_eq('t2 cannot update it',
    pg_temp.as_user(t2, format($q$ SELECT public.update_homework(%L, DATE '2030-01-01', 'x')::text $q$, v_hw_lesson))::jsonb->>'error', 'not_found');
  PERFORM pg_temp.check_eq('t2 cannot delete it',
    pg_temp.as_user(t2, format($q$ SELECT public.delete_homework(%L)::text $q$, v_hw_lesson))::jsonb->>'error', 'not_found');
  PERFORM pg_temp.check_eq('the assignment is intact after t2 tried (note still "Do this")',
    (SELECT note FROM homework_assignments WHERE id = v_hw_lesson), 'Do this');
  PERFORM pg_temp.check_eq('t2 cannot read s answers (not linked, nothing assigned by t2)',
    pg_temp.as_user(t2, format($q$ SELECT count(*)::text FROM public.linked_student_attempts(%L) $q$, s)), '0');
  PERFORM pg_temp.check_eq('t2 cannot assign to s (not linked to t2)',
    pg_temp.as_user(t2, format($q$ SELECT public.assign_homework(%L, NULL, NULL, NULL, ARRAY[%L]::uuid[], ARRAY[]::uuid[])::text $q$, v_p, s))::jsonb->>'error', 'not_linked');
  PERFORM pg_temp.check_eq('t cannot target t2''s group',
    pg_temp.as_user(t, format($q$ SELECT public.assign_homework(%L, NULL, NULL, NULL, ARRAY[]::uuid[], ARRAY[%L]::uuid[])::text $q$, v_p, v_g_other))::jsonb->>'error', 'group_not_found');
  PERFORM pg_temp.check_eq('the owner t updates it (positive control)',
    pg_temp.as_user(t, format($q$ SELECT public.update_homework(%L, DATE '2020-02-02', 'Do that')::text $q$, v_hw_lesson))::jsonb->>'ok', 'true');
  PERFORM pg_temp.check_eq('...and it shows',
    pg_temp.as_user(s, format($q$ SELECT due_on::text || ' ' || note FROM public.my_homework() WHERE assignment_id = %L $q$, v_hw_lesson)), '2020-02-02 Do that');

  -- 7. an unlinked or non-teacher caller ---------------------------------------------
  PERFORM pg_temp.check_eq('t cannot assign to n (not linked)',
    pg_temp.as_user(t, format($q$ SELECT public.assign_homework(%L, NULL, NULL, NULL, ARRAY[%L]::uuid[], ARRAY[]::uuid[])::text $q$, v_p, n))::jsonb->>'error', 'not_linked');
  PERFORM pg_temp.check_eq('n receives nothing',
    pg_temp.as_user(n, $q$ SELECT count(*)::text FROM public.my_homework() $q$), '0');
  PERFORM pg_temp.check_eq('n (not a teacher) cannot assign',
    pg_temp.as_user(n, format($q$ SELECT public.assign_homework(%L, NULL, NULL, NULL, ARRAY[%L]::uuid[], ARRAY[]::uuid[])::text $q$, v_p, n))::jsonb->>'error', 'forbidden');
  PERFORM pg_temp.check_eq('n sees nothing assignable',
    pg_temp.as_user(n, $q$ SELECT count(*)::text FROM public.homework_assignable() $q$), '0');
  PERFORM pg_temp.check_eq('t sees assignable lessons (positive control: P1, P2, Q1, D1, E1)',
    pg_temp.as_user(t, $q$ SELECT count(*)::text FROM public.homework_assignable() WHERE course_title IN ('P','Q','D','E') $q$), '5');
  PERFORM pg_temp.check_eq('t2 does not get D (a draft t2 does not edit)',
    pg_temp.as_user(t2, $q$ SELECT count(*)::text FROM public.homework_assignable() WHERE course_title = 'D' $q$), '0');
  PERFORM pg_temp.check_eq('anon has no EXECUTE on my_homework',
    (SELECT has_function_privilege('anon', 'public.my_homework()', 'EXECUTE'))::text, 'false');
  PERFORM pg_temp.check_eq('anon has no EXECUTE on assign_homework',
    (SELECT has_function_privilege('anon', 'public.assign_homework(uuid,uuid,date,text,uuid[],uuid[])', 'EXECUTE'))::text, 'false');
  PERFORM pg_temp.check_eq('anon has no EXECUTE on the widened reader',
    (SELECT has_function_privilege('anon', 'public.linked_student_attempts(uuid)', 'EXECUTE'))::text, 'false');
  PERFORM pg_temp.check_eq('authenticated has no EXECUTE on the recipient helper',
    (SELECT has_function_privilege('authenticated', 'public._homework_recipients(uuid,uuid)', 'EXECUTE'))::text, 'false');
  PERFORM pg_temp.check_eq('anon calling my_homework is refused',
    pg_temp.as_anon($q$ SELECT count(*)::text FROM public.my_homework() $q$), 'ERR:42501');

  -- 8. input validation ----------------------------------------------------------------
  PERFORM pg_temp.check_eq('no targets',
    pg_temp.as_user(t, format($q$ SELECT public.assign_homework(%L, NULL, NULL, NULL, ARRAY[]::uuid[], ARRAY[]::uuid[])::text $q$, v_p))::jsonb->>'error', 'no_targets');
  PERFORM pg_temp.check_eq('a note over 500 characters',
    pg_temp.as_user(t, format($q$ SELECT public.assign_homework(%L, NULL, NULL, repeat('x', 501), ARRAY[%L]::uuid[], ARRAY[]::uuid[])::text $q$, v_p, s))::jsonb->>'error', 'invalid_note');
  PERFORM pg_temp.check_eq('a lesson from another course',
    pg_temp.as_user(t, format($q$ SELECT public.assign_homework(%L, %L, NULL, NULL, ARRAY[%L]::uuid[], ARRAY[]::uuid[])::text $q$, v_p, v_e1, s))::jsonb->>'error', 'lesson_not_found');
  PERFORM pg_temp.check_eq('a course the caller neither edits nor is published (a draft of t2)',
    pg_temp.as_user(t2, format($q$ SELECT public.assign_homework(%L, NULL, NULL, NULL, ARRAY[]::uuid[], ARRAY[%L]::uuid[])::text $q$, v_d, v_g_other))::jsonb->>'error', 'course_not_found');
  PERFORM pg_temp.check_eq('all or nothing: one unlinked student rejects the whole call',
    pg_temp.as_user(t, format($q$ SELECT public.assign_homework(%L, NULL, NULL, 'aon', ARRAY[%L, %L]::uuid[], ARRAY[]::uuid[])::text $q$, v_p, s, n))::jsonb->>'error', 'not_linked');
  PERFORM pg_temp.check_eq('...and nothing was inserted',
    (SELECT count(*)::text FROM homework_assignments WHERE note = 'aon'), '0');

  -- 9. an entitled lesson: the access state shows, nothing is granted ---------------------
  v_res := pg_temp.as_user(t, format(
    $q$ SELECT public.assign_homework(%L, %L, NULL, NULL, ARRAY[%L]::uuid[], ARRAY[]::uuid[])::text $q$, v_q, v_q1, s));
  PERFORM pg_temp.check_eq('t assigns the entitled lesson Q1 (a lesson the student cannot open is assignable)',
    (v_res::jsonb->>'ok'), 'true');
  v_hw_q := (v_res::jsonb->>'id')::uuid;
  PERFORM pg_temp.check_eq('s sees Q1 homework with state needs_entitlement',
    pg_temp.as_user(s, format($q$ SELECT state FROM public.my_homework() WHERE assignment_id = %L $q$, v_hw_q)), 'needs_entitlement');
  PERFORM pg_temp.check_eq('Q1 homework is not done',
    pg_temp.as_user(s, format($q$ SELECT done::text FROM public.my_homework() WHERE assignment_id = %L $q$, v_hw_q)), 'false');
  PERFORM pg_temp.check_eq('assigning Q1 granted s nothing (can_read_lesson stays false)',
    pg_temp.as_user(s, format($q$ SELECT public.can_read_lesson(%L)::text $q$, v_q1)), 'false');
  -- positive control: a grant flips the state, which proves the state is read live
  INSERT INTO course_entitlements (user_id, course_id, source) VALUES (s, v_q, 'grant');
  PERFORM pg_temp.check_eq('after a grant the same row says open',
    pg_temp.as_user(s, format($q$ SELECT state FROM public.my_homework() WHERE assignment_id = %L $q$, v_hw_q)), 'open');

  -- 10. a draft course t edits: assignable, invisible to the student -----------------------
  v_res := pg_temp.as_user(t, format(
    $q$ SELECT public.assign_homework(%L, NULL, NULL, NULL, ARRAY[%L]::uuid[], ARRAY[]::uuid[])::text $q$, v_d, s));
  PERFORM pg_temp.check_eq('t assigns the draft course D (t edits it)', (v_res::jsonb->>'ok'), 'true');
  v_hw_draft := (v_res::jsonb->>'id')::uuid;
  PERFORM pg_temp.check_eq('t: the list marks D unpublished',
    pg_temp.as_user(t, format($q$ SELECT course_published::text FROM public.teacher_homework_list() WHERE assignment_id = %L $q$, v_hw_draft)), 'false');
  PERFORM pg_temp.check_eq('s does not see the draft course homework (positive control: s sees others)',
    pg_temp.as_user(s, format($q$ SELECT count(*)::text FROM public.my_homework() WHERE assignment_id = %L $q$, v_hw_draft)), '0');

  -- 11. a link that ends ------------------------------------------------------------------
  v_res := pg_temp.as_user(t, format(
    $q$ SELECT public.assign_homework(%L, %L, NULL, NULL, ARRAY[%L]::uuid[], ARRAY[]::uuid[])::text $q$, v_p, v_p1, s2));
  v_hw_s2 := (v_res::jsonb->>'id')::uuid;
  PERFORM pg_temp.check_eq('before the link ends: s2 sees 1 (positive control)',
    pg_temp.as_user(s2, $q$ SELECT count(*)::text FROM public.my_homework() $q$), '1');
  PERFORM pg_temp.check_eq('before: the direct target row exists',
    (SELECT count(*)::text FROM homework_targets WHERE student_id = s2), '1');
  UPDATE teacher_student_links SET ended_at = now(), ended_by = s2 WHERE teacher_id = t AND student_id = s2;
  PERFORM pg_temp.check_eq('after the link ends: s2 sees none',
    pg_temp.as_user(s2, $q$ SELECT count(*)::text FROM public.my_homework() $q$), '0');
  PERFORM pg_temp.check_eq('after: the direct target row is gone (trigger)',
    (SELECT count(*)::text FROM homework_targets WHERE student_id = s2), '0');
  PERFORM pg_temp.check_eq('after: the assignment itself still exists (its other targets are untouched)',
    (SELECT count(*)::text FROM homework_assignments WHERE id = v_hw_s2), '1');
  PERFORM pg_temp.check_eq('after: t no longer receives s2 in progress',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.teacher_homework_progress() WHERE student_id = %L $q$, s2)), '0');
  UPDATE teacher_student_links SET ended_at = NULL, ended_by = NULL WHERE teacher_id = t AND student_id = s2;
  PERFORM pg_temp.check_eq('relinking does not bring the homework back',
    pg_temp.as_user(s2, $q$ SELECT count(*)::text FROM public.my_homework() $q$), '0');
  -- s: an ended link stops the answers read and the homework
  UPDATE teacher_student_links SET ended_at = now(), ended_by = s WHERE teacher_id = t AND student_id = s;
  PERFORM pg_temp.check_eq('s ended the link: t reads no attempts of s',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.linked_student_attempts(%L) $q$, s)), '0');
  PERFORM pg_temp.check_eq('...no scores',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.linked_student_lesson_scores(%L) $q$, s)), '0');
  PERFORM pg_temp.check_eq('...and s receives no homework',
    pg_temp.as_user(s, $q$ SELECT count(*)::text FROM public.my_homework() $q$), '0');
  PERFORM pg_temp.check_eq('s3 (still linked, in g) still receives the group homework (positive control)',
    pg_temp.as_user(s3, $q$ SELECT count(*)::text FROM public.my_homework() $q$), '1');

  -- 12. the owner deletes ---------------------------------------------------------------------
  PERFORM pg_temp.check_eq('t deletes the group assignment',
    pg_temp.as_user(t, format($q$ SELECT public.delete_homework(%L)::text $q$, v_hw_group))::jsonb->>'ok', 'true');
  PERFORM pg_temp.check_eq('its targets went with it',
    (SELECT count(*)::text FROM homework_targets WHERE assignment_id = v_hw_group), '0');
  PERFORM pg_temp.check_eq('s3 sees none now',
    pg_temp.as_user(s3, $q$ SELECT count(*)::text FROM public.my_homework() $q$), '0');

  -- 13. deleting a student account removes their homework; a teacher's removes theirs ---------
  UPDATE teacher_student_links SET ended_at = NULL, ended_by = NULL WHERE teacher_id = t AND student_id = s;
  INSERT INTO homework_targets (assignment_id, teacher_id, student_id) VALUES (v_hw_course, t, s)
    ON CONFLICT DO NOTHING;
  PERFORM pg_temp.check_eq('seed for deletion: s has a direct target row',
    (SELECT (count(*) > 0)::text FROM homework_targets WHERE student_id = s), 'true');
  PERFORM pg_temp.check_eq('s deletes the account: ok',
    pg_temp.as_user(s, $q$ SELECT public.delete_my_account()::text $q$)::jsonb->>'ok', 'true');
  PERFORM pg_temp.check_eq('...no target row names s',
    (SELECT count(*)::text FROM homework_targets WHERE student_id = s), '0');
  PERFORM pg_temp.check_eq('t has assignments (positive control for the teacher deletion)',
    (SELECT (count(*) > 0)::text FROM homework_assignments WHERE teacher_id = t), 'true');
  PERFORM pg_temp.check_eq('t deletes the account: ok',
    pg_temp.as_user(t, $q$ SELECT public.delete_my_account()::text $q$)::jsonb->>'ok', 'true');
  PERFORM pg_temp.check_eq('...none of t''s assignments remain',
    (SELECT count(*)::text FROM homework_assignments WHERE teacher_id = t), '0');
  PERFORM pg_temp.check_eq('...nor their targets',
    (SELECT count(*)::text FROM homework_targets WHERE teacher_id = t), '0');

  RAISE NOTICE 'TCH-005 PASS';
END;
$$;

ROLLBACK;
