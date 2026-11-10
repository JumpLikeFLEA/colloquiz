-- ============================================================
-- supabase/verify/109_writing_submissions.sql
--
-- WRITE-002 full protocol for migration 109 (needs everything through 108). NOT a
-- migration: run after 109 is applied, as postgres. Seeds its own data and ROLLS BACK.
-- A failed assertion aborts with "WRITE-002 FAIL: ...". Every denial is paired with a
-- positive control (the same call by a caller who may, or on a lesson they may use).
--
-- Callers: t (teacher, editor of CS, also of CC); th, tt (teachers); tx (editor of CX);
-- tf (editor of CF, seat EXPIRED); t2 (editor of CZ, linked to nobody); ed (editor of CC);
-- s, sd, se (students linked to t); sa, sb (linked to tt: homework X1 / whole CX);
-- sf, sf2 (linked to tf; sf2 has a conversation); en (enrolled in the run in progress, and
-- linked to t); en2 (granted, enrolled in a run that has not started); er (revoked
-- enrolment); p (signed in, nothing).
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
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('role', 'postgres', true);
  RETURN 'ERR:' || SQLSTATE;
END;
$$;

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

CREATE TEMP TABLE pg_temp.tally (n INTEGER NOT NULL);
INSERT INTO pg_temp.tally VALUES (0);

CREATE FUNCTION pg_temp.check_eq(p_label TEXT, p_got TEXT, p_want TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE pg_temp.tally SET n = n + 1;
  RAISE NOTICE '% -> got % (want %)', p_label, p_got, p_want;
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'WRITE-002 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

-- submit_writing_answer as p_user: 'ok:<route>:<new|resent>' or the error code.
CREATE FUNCTION pg_temp.send(p_user UUID, p_lesson UUID, p_block TEXT, p_body TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  RETURN pg_temp.as_user(p_user, format(
    $q$ SELECT CASE WHEN r->>'ok' = 'true'
                    THEN 'ok:' || (r->>'route') || ':' || CASE WHEN (r->>'resent')::boolean THEN 'resent' ELSE 'new' END
                    ELSE r->>'error' END
        FROM (SELECT public.submit_writing_answer(%L, %L, %L) AS r) x $q$,
    p_lesson, p_block, p_body));
END;
$$;

CREATE FUNCTION pg_temp.route(p_user UUID, p_lesson UUID, p_block TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  RETURN pg_temp.as_user(p_user, format(
    $q$ SELECT CASE WHEN r->>'ok' = 'true' THEN (r->>'route') || ':' || (r->>'locked') ELSE r->>'error' END
        FROM (SELECT public.writing_task_state(%L, %L) AS r) x $q$, p_lesson, p_block));
END;
$$;

-- save_writing_feedback as p_user: 'ok' / 'ok:published' or the error code.
CREATE FUNCTION pg_temp.fb(p_user UUID, p_sub UUID, p_publish BOOLEAN)
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  RETURN pg_temp.as_user(p_user, format(
    $q$ SELECT CASE WHEN r->>'ok' = 'true' THEN 'ok' || CASE WHEN r->>'published_at' IS NULL THEN '' ELSE ':published' END
                    ELSE r->>'error' END
        FROM (SELECT public.save_writing_feedback(%L, '{"paragraphs":[{"runs":[{"text":"Good"}]}]}'::jsonb, %L) AS r) x $q$,
    p_sub, p_publish));
END;
$$;

CREATE FUNCTION pg_temp.queue(p_user UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  RETURN pg_temp.as_user(p_user,
    $q$ SELECT count(*)::text FROM public.writing_review_queue() $q$);
END;
$$;

DO $$
DECLARE
  t   UUID := gen_random_uuid(); th  UUID := gen_random_uuid(); tt  UUID := gen_random_uuid();
  tx  UUID := gen_random_uuid(); tf  UUID := gen_random_uuid(); t2  UUID := gen_random_uuid();
  ed  UUID := gen_random_uuid();
  s   UUID := gen_random_uuid(); sd  UUID := gen_random_uuid(); se  UUID := gen_random_uuid();
  sa  UUID := gen_random_uuid(); sb  UUID := gen_random_uuid();
  sf  UUID := gen_random_uuid(); sf2 UUID := gen_random_uuid();
  en  UUID := gen_random_uuid(); en2 UUID := gen_random_uuid(); er  UUID := gen_random_uuid();
  p   UUID := gen_random_uuid();
  cs UUID; ch UUID; cx UUID; cf UUID; cz UUID; cc UUID;
  s1 UUID; s2 UUID; s3 UUID; h1 UUID; x1 UUID; x2 UUID; f1 UUID; z1 UUID; c1 UUID; c2 UUID; c3 UUID;
  vs1 UUID; vs2 UUID; vs3 UUID; vh1 UUID; vx1 UUID; vx2 UUID; vf1 UUID; vz1 UUID; vc1 UUID; vc2 UUID; vc3 UUID;
  rc UUID; rf UUID; en_id UUID; en2_id UUID; er_id UUID;
  hw1 UUID; hw2 UUID;
  doc JSONB := '[{"id":"th1","kind":"theory","type":"paragraph","content":[{"text":"Hi"}]},'
            || '{"id":"w1","kind":"task","type":"writing","prompt":{"paragraphs":[{"runs":[{"text":"Write"}]}]},"sendToTeacher":true},'
            || '{"id":"w0","kind":"task","type":"writing","prompt":{"paragraphs":[{"runs":[{"text":"Practise"}]}]},"sendToTeacher":false}]';
  v_id UUID; v_id2 UUID; v_n TEXT; v_res TEXT;
  long4000 TEXT := repeat('a', 4000);
  long4001 TEXT := repeat('a', 4001);
BEGIN
  INSERT INTO auth.users (id, aud, role, email)
  SELECT u, 'authenticated', 'authenticated', n || '-' || u || '@verify.test'
  FROM (VALUES (t,'t'),(th,'th'),(tt,'tt'),(tx,'tx'),(tf,'tf'),(t2,'t2'),(ed,'ed'),(s,'s'),(sd,'sd'),(se,'se'),
               (sa,'sa'),(sb,'sb'),(sf,'sf'),(sf2,'sf2'),(en,'en'),(en2,'en2'),(er,'er'),(p,'p')) x(u, n);

  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v109-cs', 'CS', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO cs;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v109-ch', 'CH', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO ch;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v109-cx', 'CX', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO cx;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v109-cf', 'CF', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO cf;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v109-cz', 'CZ', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO cz;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v109-cc', 'CC', 'A2', 'published', 'cohort', 's', 'c') RETURNING id INTO cc;
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES
    (cs, t, t), (ch, th, th), (cx, tx, tx), (cf, tf, tf), (cz, t2, t2), (cc, ed, ed), (cc, t, t);
  INSERT INTO author_seats (user_id, kind, public_name)
  SELECT u, 'teacher', 'Seat ' || n FROM (VALUES (t,'t'),(th,'th'),(tt,'tt'),(tx,'tx'),(t2,'t2'),(ed,'ed')) x(u, n);
  INSERT INTO author_seats (user_id, kind, public_name, expires_at) VALUES (tf, 'teacher', 'Seat tf', now() - interval '3 days');

  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cs, 1, 'S1', 's1', 'anyone') RETURNING id INTO s1;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cs, 2, 'S2', 's2', 'anyone') RETURNING id INTO s2;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cs, 3, 'S3', 's3', 'anyone') RETURNING id INTO s3;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (ch, 1, 'H1', 'h1', 'anyone') RETURNING id INTO h1;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cx, 1, 'X1', 'x1', 'anyone') RETURNING id INTO x1;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cx, 2, 'X2', 'x2', 'anyone') RETURNING id INTO x2;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cf, 1, 'F1', 'f1', 'anyone') RETURNING id INTO f1;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cz, 1, 'Z1', 'z1', 'anyone') RETURNING id INTO z1;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cc, 1, 'C1', 'c1', 'anyone') RETURNING id INTO c1;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week) VALUES (cc, 2, 'C2', 'c2', 'entitled', 1) RETURNING id INTO c2;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week) VALUES (cc, 3, 'C3', 'c3', 'entitled', 5) RETURNING id INTO c3;

  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (s1, doc, 'editor') RETURNING id INTO vs1;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (s2, doc, 'editor') RETURNING id INTO vs2;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (s3, doc, 'editor') RETURNING id INTO vs3;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (h1, doc, 'editor') RETURNING id INTO vh1;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (x1, doc, 'editor') RETURNING id INTO vx1;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (x2, doc, 'editor') RETURNING id INTO vx2;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (f1, doc, 'editor') RETURNING id INTO vf1;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (z1, doc, 'editor') RETURNING id INTO vz1;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (c1, doc, 'editor') RETURNING id INTO vc1;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (c2, doc, 'editor') RETURNING id INTO vc2;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (c3, doc, 'editor') RETURNING id INTO vc3;
  UPDATE lessons SET published_version_id = vs1 WHERE id = s1;
  UPDATE lessons SET published_version_id = vs2 WHERE id = s2;
  UPDATE lessons SET published_version_id = vs3 WHERE id = s3;
  UPDATE lessons SET published_version_id = vh1 WHERE id = h1;
  UPDATE lessons SET published_version_id = vx1 WHERE id = x1;
  UPDATE lessons SET published_version_id = vx2 WHERE id = x2;
  UPDATE lessons SET published_version_id = vf1 WHERE id = f1;
  UPDATE lessons SET published_version_id = vz1 WHERE id = z1;
  UPDATE lessons SET published_version_id = vc1 WHERE id = c1;
  UPDATE lessons SET published_version_id = vc2 WHERE id = c2;
  UPDATE lessons SET published_version_id = vc3 WHERE id = c3;

  INSERT INTO course_entitlements (user_id, course_id, source) VALUES (en2, cc, 'grant');
  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (cc, 'RC', now() - interval '2 days', now() + interval '26 days') RETURNING id INTO rc;
  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (cc, 'RF', now() + interval '5 days', now() + interval '33 days') RETURNING id INTO rf;
  INSERT INTO run_enrolments (run_id, user_id, tier) VALUES (rc, en,  'basic') RETURNING id INTO en_id;
  INSERT INTO run_enrolments (run_id, user_id, tier) VALUES (rf, en2, 'basic') RETURNING id INTO en2_id;
  INSERT INTO run_enrolments (run_id, user_id, tier) VALUES (rc, er,  'basic') RETURNING id INTO er_id;
  UPDATE run_enrolments SET revoked_at = now() WHERE id = er_id;

  INSERT INTO teacher_student_links (teacher_id, student_id, source) VALUES
    (t, s, 'join_link'), (t, sd, 'join_link'), (t, se, 'join_link'), (t, en, 'join_link'),
    (tt, sa, 'join_link'), (tt, sb, 'join_link'),
    (tf, sf, 'join_link'), (tf, sf2, 'join_link');
  INSERT INTO teacher_conversations (teacher_id, student_id) VALUES (tf, sf2);
  -- tt assigns X1 alone to sa, and the whole of CX to sb. tt does not edit CX.
  INSERT INTO homework_assignments (teacher_id, course_id, lesson_id) VALUES (tt, cx, x1) RETURNING id INTO hw1;
  INSERT INTO homework_assignments (teacher_id, course_id, lesson_id) VALUES (tt, cx, NULL) RETURNING id INTO hw2;
  INSERT INTO homework_targets (assignment_id, teacher_id, student_id) VALUES (hw1, tt, sa), (hw2, tt, sb);

  PERFORM pg_temp.check_eq('seed: 6 courses, 11 lessons published, 8 links, 2 assignments, 3 enrolments (tables not empty)',
    ((SELECT count(*) FROM courses WHERE slug LIKE 'v109-%')::text || '/' ||
     (SELECT count(*) FROM lessons WHERE course_id IN (cs, ch, cx, cf, cz, cc) AND published_version_id IS NOT NULL)::text || '/' ||
     (SELECT count(*) FROM teacher_student_links WHERE student_id IN (s, sd, se, en, sa, sb, sf, sf2))::text || '/' ||
     (SELECT count(*) FROM homework_assignments WHERE teacher_id = tt)::text || '/' ||
     (SELECT count(*) FROM run_enrolments WHERE run_id IN (rc, rf))::text), '6/11/8/2/3');

  -- ── 0. Static facts: tables, grants, constraints ---------------------------
  PERFORM pg_temp.check_eq('RLS on both tables',
    (SELECT count(*)::text FROM pg_class WHERE relname IN ('writing_submissions', 'writing_feedback') AND relrowsecurity), '2');
  PERFORM pg_temp.check_eq('anon has no SELECT on either table',
    has_table_privilege('anon', 'public.writing_submissions', 'SELECT')::text || '/' || has_table_privilege('anon', 'public.writing_feedback', 'SELECT')::text, 'false/false');
  PERFORM pg_temp.check_eq('authenticated: SELECT yes (positive control), INSERT/UPDATE/DELETE no, on both',
    has_table_privilege('authenticated', 'public.writing_submissions', 'SELECT')::text || '/' ||
    has_table_privilege('authenticated', 'public.writing_feedback', 'SELECT')::text || '/' ||
    (has_table_privilege('authenticated', 'public.writing_submissions', 'INSERT') OR has_table_privilege('authenticated', 'public.writing_submissions', 'UPDATE')
      OR has_table_privilege('authenticated', 'public.writing_submissions', 'DELETE') OR has_table_privilege('authenticated', 'public.writing_feedback', 'INSERT')
      OR has_table_privilege('authenticated', 'public.writing_feedback', 'UPDATE') OR has_table_privilege('authenticated', 'public.writing_feedback', 'DELETE'))::text,
    'true/true/false');
  PERFORM pg_temp.check_eq('internal functions: no EXECUTE for anon or authenticated',
    (has_function_privilege('anon', 'public._writing_route(uuid,uuid)', 'EXECUTE') OR has_function_privilege('authenticated', 'public._writing_route(uuid,uuid)', 'EXECUTE')
      OR has_function_privilege('anon', 'public._writing_can_review(uuid,uuid)', 'EXECUTE') OR has_function_privilege('authenticated', 'public._writing_can_review(uuid,uuid)', 'EXECUTE'))::text, 'false');
  PERFORM pg_temp.check_eq('RPCs: anon no, authenticated yes (4 functions)',
    (SELECT string_agg(has_function_privilege('anon', f, 'EXECUTE')::text || '/' || has_function_privilege('authenticated', f, 'EXECUTE')::text, ',' ORDER BY f)
     FROM unnest(ARRAY['public.submit_writing_answer(uuid,text,text)', 'public.writing_task_state(uuid,text)',
                       'public.save_writing_feedback(uuid,jsonb,boolean)', 'public.writing_review_queue(uuid,text)']) f),
    'false/true,false/true,false/true,false/true');
  PERFORM pg_temp.check_eq('anon: submit refused',
    pg_temp.as_anon(format('SELECT public.submit_writing_answer(%L, ''w1'', ''x'')::text', s1)), 'ERR:42501');
  PERFORM pg_temp.check_eq('authenticated: direct INSERT refused (grant)',
    pg_temp.as_user(s, format($q$ WITH i AS (INSERT INTO public.writing_submissions (user_id, course_id, lesson_id, block_id, lesson_version_id, body)
      VALUES (%L, %L, %L, 'w1', %L, 'x') RETURNING 1) SELECT 'ok' FROM i $q$, s, cs, s1, vs1)), 'ERR:42501');

  -- the CHECKs, as postgres: whitespace-only and 4001 refused, 4000 accepted (rolled back with everything)
  BEGIN
    INSERT INTO writing_submissions (user_id, course_id, lesson_id, block_id, lesson_version_id, body) VALUES (p, cs, s2, 'w1', vs2, E' \n\t ');
    v_res := 'accepted';
  EXCEPTION WHEN check_violation THEN v_res := 'refused'; END;
  PERFORM pg_temp.check_eq('CHECK: whitespace-only body refused', v_res, 'refused');
  BEGIN
    INSERT INTO writing_submissions (user_id, course_id, lesson_id, block_id, lesson_version_id, body) VALUES (p, cs, s2, 'w1', vs2, long4001);
    v_res := 'accepted';
  EXCEPTION WHEN check_violation THEN v_res := 'refused'; END;
  PERFORM pg_temp.check_eq('CHECK: 4001 characters refused', v_res, 'refused');
  BEGIN
    INSERT INTO writing_submissions (user_id, course_id, lesson_id, block_id, lesson_version_id, body) VALUES (p, cs, s2, 'w1', vs2, long4000) RETURNING id INTO v_id;
    v_res := 'accepted';
  EXCEPTION WHEN check_violation THEN v_res := 'refused'; END;
  PERFORM pg_temp.check_eq('CHECK: 4000 characters accepted [positive control]', v_res, 'accepted');
  DELETE FROM writing_submissions WHERE id = v_id;
  BEGIN
    INSERT INTO writing_submissions (user_id, course_id, lesson_id, block_id, lesson_version_id, body) VALUES (p, cs, s2, 'w1', vs2, 'a') RETURNING id INTO v_id;
    INSERT INTO writing_feedback (submission_id, body) VALUES (v_id, '{"paragraphs":[]}'::jsonb);
    v_res := 'accepted';
  EXCEPTION WHEN check_violation THEN v_res := 'refused'; END;
  PERFORM pg_temp.check_eq('CHECK: an invalid feedback body refused', v_res, 'refused');
  DELETE FROM writing_submissions WHERE user_id = p;

  -- ── 1. Error codes, in order ----------------------------------------------
  PERFORM pg_temp.check_eq('not_found: unknown lesson',
    pg_temp.send(s, gen_random_uuid(), 'w1', 'hi'), 'not_found');
  PERFORM pg_temp.check_eq('not_a_writing_block: missing block id', pg_temp.send(s, s1, 'nope', 'hi'), 'not_a_writing_block');
  PERFORM pg_temp.check_eq('not_a_writing_block: a theory block id', pg_temp.send(s, s1, 'th1', 'hi'), 'not_a_writing_block');
  PERFORM pg_temp.check_eq('not_sent_to_teacher: the unticked task', pg_temp.send(s, s1, 'w0', 'hi'), 'not_sent_to_teacher');
  PERFORM pg_temp.check_eq('invalid_body: empty', pg_temp.send(s, s1, 'w1', ''), 'invalid_body');
  PERFORM pg_temp.check_eq('invalid_body: whitespace only', pg_temp.send(s, s1, 'w1', E'  \n '), 'invalid_body');
  PERFORM pg_temp.check_eq('invalid_body: 4001 characters', pg_temp.send(s, s1, 'w1', long4001), 'invalid_body');
  PERFORM pg_temp.check_eq('no_route: p on S1 (open, not enrolled, not linked)', pg_temp.send(p, s1, 'w1', 'hi'), 'no_route');
  PERFORM pg_temp.check_eq('lesson_not_open: en on C3 (week 5 of the run)', pg_temp.send(en, c3, 'w1', 'hi'), 'lesson_not_open');
  PERFORM pg_temp.check_eq('4000 characters accepted [positive control for the boundary]', pg_temp.send(s, s2, 'w1', long4000), 'ok:linked:new');
  PERFORM pg_temp.check_eq('the stored body is the 4000 characters',
    (SELECT char_length(body)::text FROM writing_submissions WHERE user_id = s AND lesson_id = s2), '4000');

  -- ── 2. The routes -----------------------------------------------------------
  PERFORM pg_temp.check_eq('linked route through an edited course: s on S1', pg_temp.send(s, s1, 'w1', 'My story'), 'ok:linked:new');
  PERFORM pg_temp.check_eq('linked row has no enrolment',
    (SELECT (enrolment_id IS NULL)::text FROM writing_submissions WHERE user_id = s AND lesson_id = s1), 'true');
  PERFORM pg_temp.check_eq('cohort route: en on C1 (anyone lesson)', pg_temp.send(en, c1, 'w1', 'Cohort one'), 'ok:cohort:new');
  PERFORM pg_temp.check_eq('cohort route: en on C2 (entitled, week 1 open)', pg_temp.send(en, c2, 'w1', 'Cohort two'), 'ok:cohort:new');
  PERFORM pg_temp.check_eq('an enrolee who is also linked (en to t, who edits CC) files as cohort',
    (SELECT (enrolment_id = en_id)::text FROM writing_submissions WHERE user_id = en AND lesson_id = c1), 'true');
  PERFORM pg_temp.check_eq('enrolee whose enrolment does not open the lesson: en2 (future run + grant) on C2 gets no route',
    pg_temp.send(en2, c2, 'w1', 'hi'), 'no_route');
  PERFORM pg_temp.check_eq('control: en2 on C1 (anyone lesson, the same enrolment opens it)', pg_temp.send(en2, c1, 'w1', 'hi'), 'ok:cohort:new');
  PERFORM pg_temp.check_eq('a revoked enrolment is no enrolment: er on C1 gets no route', pg_temp.send(er, c1, 'w1', 'hi'), 'no_route');
  PERFORM pg_temp.check_eq('course assignment: sb on X2', pg_temp.send(sb, x2, 'w1', 'hw'), 'ok:linked:new');
  PERFORM pg_temp.check_eq('single-lesson assignment: sa on X1 [positive control]', pg_temp.send(sa, x1, 'w1', 'hw'), 'ok:linked:new');
  PERFORM pg_temp.check_eq('single-lesson assignment: sa on X2 (another lesson): no route', pg_temp.send(sa, x2, 'w1', 'hw'), 'no_route');
  PERFORM pg_temp.check_eq('frozen teacher, no conversation: sf on F1 gets no route', pg_temp.send(sf, f1, 'w1', 'hi'), 'no_route');
  PERFORM pg_temp.check_eq('frozen teacher, with a conversation: sf2 on F1 [positive control]', pg_temp.send(sf2, f1, 'w1', 'hi'), 'ok:linked:new');
  PERFORM pg_temp.check_eq('a student linked to a teacher who does not edit the course: s on H1', pg_temp.send(s, h1, 'w1', 'hi'), 'no_route');

  -- the page's read agrees with the RPC (both call _writing_route)
  PERFORM pg_temp.check_eq('state: s on S1 = linked, unlocked', pg_temp.route(s, s1, 'w1'), 'linked:false');
  PERFORM pg_temp.check_eq('state: en on C1 = cohort', pg_temp.route(en, c1, 'w1'), 'cohort:false');
  PERFORM pg_temp.check_eq('state: p on S1 = practice', pg_temp.route(p, s1, 'w1'), 'practice:false');
  PERFORM pg_temp.check_eq('state: en2 on C2 = practice (same as the RPC refusal)', pg_temp.route(en2, c2, 'w1'), 'practice:false');
  PERFORM pg_temp.check_eq('state: the unticked task = practice even for s', pg_temp.route(s, s1, 'w0'), 'practice:false');
  PERFORM pg_temp.check_eq('state: a theory block = not_a_writing_block', pg_temp.route(s, s1, 'th1'), 'not_a_writing_block');
  PERFORM pg_temp.check_eq('state: anon refused',
    pg_temp.as_anon(format('SELECT public.writing_task_state(%L, ''w1'')::text', s1)), 'ERR:42501');
  PERFORM pg_temp.check_eq('state returns the caller''s own answer',
    pg_temp.as_user(s, format($q$ SELECT public.writing_task_state(%L, 'w1')->'submission'->>'body' $q$, s1)), 'My story');
  PERFORM pg_temp.check_eq('state: p sees no submission (null) [control: s sees one]',
    pg_temp.as_user(p, format($q$ SELECT (public.writing_task_state(%L, 'w1')->'submission' = 'null'::jsonb)::text $q$, s1)), 'true');

  -- ── 3. Resend keeps the id and the draft; published feedback locks ---------
  SELECT id INTO v_id FROM writing_submissions WHERE user_id = s AND lesson_id = s1;
  PERFORM pg_temp.check_eq('t (editor of CS, linked to s) sees s''s answer in the queue', (pg_temp.queue(t)::int >= 1)::text, 'true');
  PERFORM pg_temp.check_eq('t saves a DRAFT feedback', pg_temp.fb(t, v_id, false), 'ok');
  PERFORM pg_temp.check_eq('s resends: same row, resent',  pg_temp.send(s, s1, 'w1', 'My story, edited'), 'ok:linked:resent');
  PERFORM pg_temp.check_eq('resend kept the id and updated the text',
    (SELECT (id = v_id)::text || ':' || body FROM writing_submissions WHERE user_id = s AND lesson_id = s1), 'true:My story, edited');
  PERFORM pg_temp.check_eq('one row per slot after the resend', (SELECT count(*)::text FROM writing_submissions WHERE user_id = s AND lesson_id = s1), '1');
  PERFORM pg_temp.check_eq('the draft feedback stayed attached to the same submission, unpublished',
    (SELECT (published_at IS NULL)::text FROM writing_feedback WHERE submission_id = v_id), 'true');
  PERFORM pg_temp.check_eq('the owner does NOT see a draft feedback',
    pg_temp.as_user(s, 'SELECT count(*)::text FROM public.writing_feedback'), '0');
  PERFORM pg_temp.check_eq('state with a draft: unlocked, no feedback',
    pg_temp.as_user(s, format($q$ SELECT (r->>'locked') || ':' || (r->'feedback' = 'null'::jsonb)::text FROM (SELECT public.writing_task_state(%L, 'w1') r) x $q$, s1)), 'false:true');
  PERFORM pg_temp.check_eq('t publishes', pg_temp.fb(t, v_id, true), 'ok:published');
  PERFORM pg_temp.check_eq('after publishing, s''s resend is locked', pg_temp.send(s, s1, 'w1', 'Too late'), 'locked');
  PERFORM pg_temp.check_eq('the locked answer is unchanged',
    (SELECT body FROM writing_submissions WHERE id = v_id), 'My story, edited');
  PERFORM pg_temp.check_eq('the owner now sees the published feedback (1 row) [positive control for the draft denial]',
    pg_temp.as_user(s, 'SELECT count(*)::text FROM public.writing_feedback'), '1');
  PERFORM pg_temp.check_eq('another student sees 0 feedback rows and 0 submissions',
    pg_temp.as_user(sd, 'SELECT (SELECT count(*) FROM public.writing_feedback)::text || (SELECT count(*) FROM public.writing_submissions)::text'), '00');
  PERFORM pg_temp.check_eq('state after publish: locked with the feedback',
    pg_temp.as_user(s, format($q$ SELECT (r->>'locked') || ':' || (r->'feedback'->'body'->'paragraphs'->0->'runs'->0->>'text') FROM (SELECT public.writing_task_state(%L, 'w1') r) x $q$, s1)), 'true:Good');
  PERFORM pg_temp.check_eq('a later save edits the live text and stays published', pg_temp.fb(t, v_id, false), 'ok:published');
  PERFORM pg_temp.check_eq('invalid feedback refused for a reviewer',
    pg_temp.as_user(t, format($q$ SELECT public.save_writing_feedback(%L, '{"paragraphs":[]}'::jsonb, false)->>'error' $q$, v_id)), 'invalid_feedback');

  -- ── 4. Who reads and answers ------------------------------------------------
  SELECT id INTO v_id2 FROM writing_submissions WHERE user_id = en AND lesson_id = c1;
  PERFORM pg_temp.check_eq('cohort answer: ed (editor of CC) may save feedback [positive control]', pg_temp.fb(ed, v_id2, false), 'ok');
  PERFORM pg_temp.check_eq('cohort answer: t (editor of CC) too', pg_temp.fb(t, v_id2, false), 'ok');
  PERFORM pg_temp.check_eq('cohort answer: t2 (editor of another course) is forbidden', pg_temp.fb(t2, v_id2, false), 'forbidden');
  PERFORM pg_temp.check_eq('cohort answer: the learner (not a reviewer) is forbidden', pg_temp.fb(en, v_id2, false), 'forbidden');
  PERFORM pg_temp.check_eq('an unknown id answers exactly like a refused one (forbidden)', pg_temp.fb(t, gen_random_uuid(), false), 'forbidden');
  PERFORM pg_temp.check_eq('linked answer: t2 (not linked) is forbidden', pg_temp.fb(t2, (SELECT id FROM writing_submissions WHERE user_id = s AND lesson_id = s2), false), 'forbidden');
  PERFORM pg_temp.check_eq('linked answer: th (linked to others) is forbidden', pg_temp.fb(th, (SELECT id FROM writing_submissions WHERE user_id = s AND lesson_id = s2), false), 'forbidden');
  PERFORM pg_temp.check_eq('linked answer: ed (editor of CC, not of CS) is forbidden', pg_temp.fb(ed, (SELECT id FROM writing_submissions WHERE user_id = s AND lesson_id = s2), false), 'forbidden');
  PERFORM pg_temp.check_eq('the queue: t2 sees 0, th sees 0 [t sees some, above]', pg_temp.queue(t2) || pg_temp.queue(th), '00');
  PERFORM pg_temp.check_eq('the queue: anon refused', pg_temp.as_anon('SELECT count(*)::text FROM public.writing_review_queue()'), 'ERR:42501');
  PERFORM pg_temp.check_eq('no table policy for teachers: t reads 0 rows of writing_submissions directly',
    pg_temp.as_user(t, 'SELECT count(*)::text FROM public.writing_submissions'), '0');
  -- homework-derived access: the reviewer is tt for sa/sb, never tx (who edits CX but is not linked to them)
  PERFORM pg_temp.check_eq('homework answer: tt (assigned X1 to sa) may answer',
    pg_temp.fb(tt, (SELECT id FROM writing_submissions WHERE user_id = sa AND lesson_id = x1), false), 'ok');
  PERFORM pg_temp.check_eq('homework answer: tx (edits CX, not linked to sa) is forbidden',
    pg_temp.fb(tx, (SELECT id FROM writing_submissions WHERE user_id = sa AND lesson_id = x1), false), 'forbidden');
  PERFORM pg_temp.check_eq('queue: tt sees sa''s and sb''s answers (2); tx sees 0',
    pg_temp.queue(tt) || '/' || pg_temp.queue(tx), '2/0');
  PERFORM pg_temp.check_eq('queue row carries the learner label and the prompt',
    pg_temp.as_user(tt, $q$ SELECT bool_and(learner_label LIKE '%@verify.test' AND block_prompt IS NOT NULL AND status IN ('waiting','draft','answered'))::text FROM public.writing_review_queue() $q$), 'true');
  PERFORM pg_temp.check_eq('queue status filter: tt has 1 draft and 1 waiting',
    pg_temp.as_user(tt, $q$ SELECT (SELECT count(*) FROM public.writing_review_queue(NULL, 'draft'))::text || '/' || (SELECT count(*) FROM public.writing_review_queue(NULL, 'waiting'))::text $q$), '1/1');
  PERFORM pg_temp.check_eq('queue course filter: t on CC only returns the cohort answers',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.writing_review_queue(%L) WHERE route = 'cohort' $q$, cc)),
    (SELECT count(*)::text FROM writing_submissions WHERE course_id = cc));

  -- ── 5. A lapsed seat can still answer; an ended link cannot ------------------
  SELECT id INTO v_id FROM writing_submissions WHERE user_id = sf2 AND lesson_id = f1;
  PERFORM pg_temp.check_eq('control: the seat of tf is lapsed (studio_can_write false)',
    pg_temp.as_user(tf, 'SELECT public.studio_can_write()::text'), 'false');
  PERFORM pg_temp.check_eq('lapsed seat: tf sees the answer in the queue', pg_temp.queue(tf), '1');
  PERFORM pg_temp.check_eq('lapsed seat: tf can still save and publish feedback', pg_temp.fb(tf, v_id, true), 'ok:published');

  PERFORM pg_temp.check_eq('se sends before the link ends', pg_temp.send(se, s3, 'w1', 'Before'), 'ok:linked:new');
  SELECT id INTO v_id FROM writing_submissions WHERE user_id = se AND lesson_id = s3;
  PERFORM pg_temp.check_eq('control before the end: t may save on se''s answer', pg_temp.fb(t, v_id, false), 'ok');
  v_n := pg_temp.queue(t);
  UPDATE teacher_student_links SET ended_at = now(), ended_by = se WHERE teacher_id = t AND student_id = se;
  PERFORM pg_temp.check_eq('an ended link removes the answer from t''s queue (one fewer)',
    (v_n::int - pg_temp.queue(t)::int)::text, '1');
  PERFORM pg_temp.check_eq('an ended link refuses saving', pg_temp.fb(t, v_id, false), 'forbidden');
  PERFORM pg_temp.check_eq('the answer is not deleted: it is still the student''s',
    pg_temp.as_user(se, 'SELECT count(*)::text FROM public.writing_submissions'), '1');
  PERFORM pg_temp.check_eq('the student with an ended link has no route any more (S1 is open)', pg_temp.send(se, s1, 'w1', 'After'), 'no_route');

  -- A deleted assignment removes homework-derived access at once.
  DELETE FROM homework_targets WHERE assignment_id = hw1;
  PERFORM pg_temp.check_eq('a deleted assignment: tt can no longer answer sa''s X1 answer',
    pg_temp.fb(tt, (SELECT id FROM writing_submissions WHERE user_id = sa AND lesson_id = x1), false), 'forbidden');
  PERFORM pg_temp.check_eq('control: tt still answers sb''s X2 (course assignment kept)',
    pg_temp.fb(tt, (SELECT id FROM writing_submissions WHERE user_id = sb AND lesson_id = x2), false), 'ok');

  -- ── 6. A republish with the tick off refuses new sends ----------------------
  PERFORM pg_temp.check_eq('sd sends on S2 while the task is ticked', pg_temp.send(sd, s2, 'w1', 'First'), 'ok:linked:new');
  UPDATE lesson_versions SET document = jsonb_set(document, '{1,sendToTeacher}', 'false'::jsonb) WHERE id = vs2;
  PERFORM pg_temp.check_eq('tick off: sd''s resend is refused', pg_temp.send(sd, s2, 'w1', 'Second'), 'not_sent_to_teacher');
  PERFORM pg_temp.check_eq('tick off: a new student''s send is refused too', pg_temp.send(s, s2, 'w1', 'Second'), 'not_sent_to_teacher');
  PERFORM pg_temp.check_eq('tick off: the state reads as practice', pg_temp.route(sd, s2, 'w1'), 'practice:false');
  PERFORM pg_temp.check_eq('tick off: the earlier answer is kept and visible to the reviewer',
    (SELECT count(*)::text FROM writing_submissions WHERE user_id = sd AND lesson_id = s2), '1');
  PERFORM pg_temp.check_eq('control: another ticked lesson (S1) still accepts a send from a fresh linked student sd',
    pg_temp.send(sd, s1, 'w1', 'Still works'), 'ok:linked:new');

  -- ── 7. course_delete_blockers -----------------------------------------------
  PERFORM pg_temp.check_eq('blockers: CS (has answers) lists written_answers',
    pg_temp.as_user(t, format($q$ SELECT (public.course_delete_blockers(%L)->'blockers' ? 'written_answers')::text $q$, cs)), 'true');
  PERFORM pg_temp.check_eq('blockers: CZ (no answers) does not [control]',
    pg_temp.as_user(t2, format($q$ SELECT (public.course_delete_blockers(%L)->'blockers' ? 'written_answers')::text $q$, cz)), 'false');
  PERFORM pg_temp.check_eq('blockers: CZ still lists its other blocker (published) [the RPC works]',
    pg_temp.as_user(t2, format($q$ SELECT (public.course_delete_blockers(%L)->'blockers' ? 'published')::text $q$, cz)), 'true');

  -- ── 8. Account deletion removes both routes' rows ---------------------------
  SELECT id INTO v_id FROM writing_submissions WHERE user_id = sd AND lesson_id = s1;
  PERFORM pg_temp.check_eq('control: t saves a feedback on sd''s S1 answer', pg_temp.fb(t, v_id, false), 'ok');
  v_n := (SELECT count(*)::text FROM writing_submissions WHERE user_id <> sd);
  PERFORM pg_temp.check_eq('before deleting: sd has 2 answers and 1 feedback, cohort and linked rows exist elsewhere',
    (SELECT count(*)::text FROM writing_submissions WHERE user_id = sd) || '/' ||
    (SELECT count(*)::text FROM writing_feedback f JOIN writing_submissions w ON w.id = f.submission_id WHERE w.user_id = sd), '2/1');
  PERFORM pg_temp.check_eq('sd deletes the account',
    pg_temp.as_user(sd, $q$ SELECT public.delete_my_account()->>'ok' $q$), 'true');
  PERFORM pg_temp.check_eq('sd: no submission and no feedback remain',
    (SELECT count(*)::text FROM writing_submissions WHERE user_id = sd) || '/' ||
    (SELECT count(*)::text FROM writing_feedback f WHERE NOT EXISTS (SELECT 1 FROM writing_submissions w WHERE w.id = f.submission_id)), '0/0');
  PERFORM pg_temp.check_eq('everyone else''s answers are untouched',
    (SELECT count(*)::text FROM writing_submissions WHERE user_id <> sd), v_n);
  SELECT id INTO v_id FROM writing_submissions WHERE user_id = en AND lesson_id = c1;
  PERFORM pg_temp.check_eq('en (cohort) deletes the account', pg_temp.as_user(en, $q$ SELECT public.delete_my_account()->>'ok' $q$), 'true');
  PERFORM pg_temp.check_eq('the cohort answers go too (en''s run_enrolment is deleted by the same call)',
    (SELECT count(*)::text FROM writing_submissions WHERE user_id = en), '0');

  RAISE NOTICE 'WRITE-002 PASS: 109 full protocol (% asserted cells)', (SELECT n FROM pg_temp.tally);
END $$;

ROLLBACK;
