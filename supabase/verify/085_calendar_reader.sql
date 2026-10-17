-- ============================================================
-- supabase/verify/085_calendar_reader.sql
--
-- COH-015 full protocol for migration 085 (needs 058, 080, 082, 083, 084
-- applied). NOT a migration: run after 085 is applied, as postgres. Seeds its
-- own data and ROLLS BACK. A failed assertion aborts with "COH-015 FAIL: ...".
-- Every denial is paired with a positive control proving the rows it would
-- have hidden exist.
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

CREATE FUNCTION pg_temp.as_user_err(p_user UUID, p_sql TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  EXECUTE p_sql INTO v;
  PERFORM set_config('role', 'postgres', true);
  RETURN COALESCE(v, 'null');
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
    RAISE EXCEPTION 'COH-015 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

-- "kind:count,kind:count" of what a user's calendar holds, or 'none'.
CREATE FUNCTION pg_temp.summary(p_user UUID, p_role TEXT)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT COALESCE(pg_temp.as_user(p_user, format(
    $q$ SELECT string_agg(kind || ':' || n, ',' ORDER BY kind)
        FROM (SELECT kind, count(*) AS n FROM public.my_calendar(%L) GROUP BY kind) s $q$, p_role)), 'none');
$$;

DO $$
DECLARE
  t   UUID := gen_random_uuid();  -- edits C1 (runs R1, R2), owns group G (member m1)
  t2  UUID := gen_random_uuid();  -- edits C2 (run R3) and the DRAFT C4 (run R6), owns G2
  e1  UUID := gen_random_uuid();  -- live enrolee of R1 (basic) and of R6 (draft course)
  e2  UUID := gen_random_uuid();  -- live enrolee of R1, extended
  ev  UUID := gen_random_uuid();  -- REVOKED enrolee of R1
  eo  UUID := gen_random_uuid();  -- live enrolee of R2 only
  m1  UUID := gen_random_uuid();  -- member of G, not enrolled anywhere
  x   UUID := gen_random_uuid();  -- nobody's
  c1 UUID; c2 UUID; c4 UUID;
  l1 UUID; l2 UUID; l3 UUID; l4 UUID; l5 UUID;
  r1 UUID; r2 UUID; r3 UUID; r6 UUID;
  g UUID; g2 UUID;
  k1 UUID; k3 UUID;
  v_doc JSONB;
  v_ver UUID;
  v_week3 TEXT;
  v_res TEXT;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (t,  'authenticated', 'authenticated', 't-'  || t  || '@verify.test'),
    (t2, 'authenticated', 'authenticated', 't2-' || t2 || '@verify.test'),
    (e1, 'authenticated', 'authenticated', 'e1-' || e1 || '@verify.test'),
    (e2, 'authenticated', 'authenticated', 'e2-' || e2 || '@verify.test'),
    (ev, 'authenticated', 'authenticated', 'ev-' || ev || '@verify.test'),
    (eo, 'authenticated', 'authenticated', 'eo-' || eo || '@verify.test'),
    (m1, 'authenticated', 'authenticated', 'm1-' || m1 || '@verify.test'),
    (x,  'authenticated', 'authenticated', 'x-'  || x  || '@verify.test');

  v_doc := jsonb_build_array(
    jsonb_build_object('id', 'th1', 'kind', 'theory', 'type', 'paragraph'),
    jsonb_build_object('id', 'ex1', 'kind', 'practice', 'type', 'selection',
      'payload', jsonb_build_object('prompt', 'Pick')));

  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v85-c1', 'C1', 'A2', 'published', 'cohort', 's', 'c') RETURNING id INTO c1;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v85-c2', 'C2', 'A2', 'published', 'cohort', 's', 'c') RETURNING id INTO c2;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v85-c4', 'C4', 'A2', 'draft', 'cohort', 's', 'c') RETURNING id INTO c4;
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES (c1, t, t), (c2, t2, t2), (c4, t2, t2);
  INSERT INTO author_seats (user_id, kind, public_name) VALUES (t, 'teacher', 'T'), (t2, 'teacher', 'T2');

  -- C1: weeks 1 and 3 published, week 5 a DRAFT (no published version).
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week) VALUES (c1, 1, 'L1', 'l1', 'entitled', 1) RETURNING id INTO l1;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week) VALUES (c1, 2, 'L2', 'l2', 'entitled', 3) RETURNING id INTO l2;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week) VALUES (c1, 3, 'L3', 'l3', 'entitled', 5) RETURNING id INTO l3;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week) VALUES (c2, 1, 'L4', 'l4', 'entitled', 2) RETURNING id INTO l4;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week) VALUES (c4, 1, 'L5', 'l5', 'entitled', 1) RETURNING id INTO l5;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (l1, v_doc, 'editor') RETURNING id INTO v_ver;
  UPDATE lessons SET published_version_id = v_ver WHERE id = l1;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (l2, v_doc, 'editor') RETURNING id INTO v_ver;
  UPDATE lessons SET published_version_id = v_ver WHERE id = l2;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (l4, v_doc, 'editor') RETURNING id INTO v_ver;
  UPDATE lessons SET published_version_id = v_ver WHERE id = l4;

  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (c1, 'R1', now() - interval '10 days', now() + interval '25 days') RETURNING id INTO r1;
  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (c1, 'R2', now() + interval '20 days', now() + interval '55 days') RETURNING id INTO r2;
  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (c2, 'R3', now() - interval '1 day', now() + interval '13 days') RETURNING id INTO r3;
  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (c4, 'R6', now() - interval '1 day', now() + interval '6 days') RETURNING id INTO r6;

  INSERT INTO run_enrolments (run_id, user_id, tier) VALUES
    (r1, e1, 'basic'), (r1, e2, 'extended'), (r1, ev, 'basic'), (r2, eo, 'basic'), (r6, e1, 'basic');
  UPDATE run_enrolments SET revoked_at = now() WHERE run_id = r1 AND user_id = ev;

  INSERT INTO run_calls (run_id, starts_at, meet_url) VALUES (r1, now() + interval '3 days', 'https://meet.example/1') RETURNING id INTO k1;
  INSERT INTO run_calls (run_id, starts_at, meet_url) VALUES (r3, now() + interval '2 days', 'https://meet.example/3') RETURNING id INTO k3;

  INSERT INTO teacher_student_links (teacher_id, student_id, source) VALUES (t, e1, 'join_link'), (t, m1, 'join_link');
  INSERT INTO teacher_groups (teacher_id, name) VALUES (t,  'G')  RETURNING id INTO g;
  INSERT INTO teacher_groups (teacher_id, name) VALUES (t2, 'G2') RETURNING id INTO g2;
  INSERT INTO teacher_group_members (group_id, teacher_id, student_id) VALUES (g, t, m1);

  INSERT INTO calendar_events (run_id, title, starts_at) VALUES
    (r1, 'R1 event', now() + interval '5 days'), (r3, 'R3 event', now() + interval '5 days');
  INSERT INTO calendar_events (group_id, teacher_id, title, starts_at) VALUES
    (g, t, 'G event', now() + interval '6 days'), (g2, t2, 'G2 event', now() + interval '6 days');

  -- Homework: a lesson to e1 (due 24 Dec), the whole course to group G (due 31 Dec).
  PERFORM pg_temp.check_eq('seed: assign lesson homework',
    pg_temp.as_user(t, format($q$ SELECT public.assign_homework(%L, %L, DATE '2026-12-24', NULL, ARRAY[%L]::uuid[], ARRAY[]::uuid[])::text $q$, c1, l1, e1))::jsonb->>'ok', 'true');
  PERFORM pg_temp.check_eq('seed: assign course homework to the group',
    pg_temp.as_user(t, format($q$ SELECT public.assign_homework(%L, NULL, DATE '2026-12-31', NULL, ARRAY[]::uuid[], ARRAY[%L]::uuid[])::text $q$, c1, g))::jsonb->>'ok', 'true');

  -- 0. seed sanity: the shapes the rest depends on are not empty ---------------
  PERFORM pg_temp.check_eq('seed: R1 has 3 enrolment rows, 2 live',
    (SELECT count(*)::text || '/' || count(*) FILTER (WHERE revoked_at IS NULL)::text FROM run_enrolments WHERE run_id = r1), '3/2');
  PERFORM pg_temp.check_eq('seed: 2 calls, 4 events, 2 homework assignments',
    (SELECT (SELECT count(*) FROM run_calls WHERE run_id IN (r1, r3))::text || '/' ||
            (SELECT count(*) FROM calendar_events WHERE title IN ('R1 event', 'R3 event', 'G event', 'G2 event'))::text || '/' ||
            (SELECT count(*) FROM homework_assignments WHERE teacher_id = t)::text), '2/4/2');
  PERFORM pg_temp.check_eq('seed: C1 has 2 published lessons and 1 draft',
    (SELECT count(*) FILTER (WHERE published_version_id IS NOT NULL)::text || '/' || count(*) FILTER (WHERE published_version_id IS NULL)::text
     FROM lessons WHERE course_id = c1), '2/1');

  -- 1. the learner calendar --------------------------------------------------------
  PERFORM pg_temp.check_eq('e1 (basic): start, end, weeks 1 and 3 (not the draft week 5), her homework, R1''s event, NO call',
    pg_temp.summary(e1, 'learner'), 'event:1,homework_due:1,run_end:1,run_start:1,week_open:2');
  PERFORM pg_temp.check_eq('e2 (extended): the same minus the homework, plus the call',
    pg_temp.summary(e2, 'learner'), 'call:1,event:1,run_end:1,run_start:1,week_open:2');
  PERFORM pg_temp.check_eq('positive control: the call exists and e2 got its link',
    pg_temp.as_user(e2, $q$ SELECT string_agg(link, ',') FROM public.my_calendar('learner') WHERE kind = 'call' $q$), 'https://meet.example/1');
  PERFORM pg_temp.check_eq('...e1 gets no row of kind call (basic tier) although R1 has one',
    pg_temp.as_user(e1, $q$ SELECT count(*)::text FROM public.my_calendar('learner') WHERE kind = 'call' $q$), '0');
  PERFORM pg_temp.check_eq('a REVOKED enrolee sees nothing (positive control: her enrolment row exists)',
    pg_temp.summary(ev, 'learner') || '|' || (SELECT count(*)::text FROM run_enrolments WHERE user_id = ev AND run_id = r1), 'none|1');
  PERFORM pg_temp.check_eq('eo (R2 only): R2''s dates and weeks; nothing of R1',
    pg_temp.summary(eo, 'learner'), 'run_end:1,run_start:1,week_open:2');
  PERFORM pg_temp.check_eq('...no row of R1 reaches eo (positive control: R2 rows do, and R1 has events)',
    pg_temp.as_user(eo, format($q$ SELECT count(*) FILTER (WHERE run_id = %L)::text || '/' || count(*) FILTER (WHERE run_id = %L)::text FROM public.my_calendar('learner') $q$, r1, r2)), '0/4');
  PERFORM pg_temp.check_eq('m1 (group member, not enrolled): the group event and the course homework',
    pg_temp.summary(m1, 'learner'), 'event:1,homework_due:1');
  PERFORM pg_temp.check_eq('...a member''s rows never carry the group id (positive control: the event row is there)',
    pg_temp.as_user(m1, $q$ SELECT count(*) FILTER (WHERE kind = 'event')::text || '/' || count(*) FILTER (WHERE group_id IS NOT NULL)::text FROM public.my_calendar('learner') $q$), '1/0');
  PERFORM pg_temp.check_eq('a non-member and non-enrolee sees nothing (positive control: events and runs exist)',
    pg_temp.summary(x, 'learner') || '|' || (SELECT count(*)::text FROM calendar_events WHERE title IN ('R1 event', 'R3 event', 'G event', 'G2 event')) || '|' || (SELECT count(*)::text FROM course_runs WHERE id IN (r1, r2, r3, r6)), 'none|4|4');
  PERFORM pg_temp.check_eq('a DRAFT course''s run never reaches its learner (e1 is enrolled in R6; positive control: the enrolment is live)',
    pg_temp.as_user(e1, format($q$ SELECT count(*)::text FROM public.my_calendar('learner') WHERE course_id = %L $q$, c4))
      || '|' || (SELECT count(*)::text FROM run_enrolments WHERE run_id = r6 AND revoked_at IS NULL), '0|1');
  PERFORM pg_temp.check_eq('a homework due date is a plain date, not shifted (24 Dec)',
    pg_temp.as_user(e1, $q$ SELECT due_on::text || '/' || (starts_at IS NULL)::text FROM public.my_calendar('learner') WHERE kind = 'homework_due' $q$), '2026-12-24/true');
  PERFORM pg_temp.check_eq('homework carries the lesson slug for a lesson and its done flag',
    pg_temp.as_user(e1, $q$ SELECT lesson_slug || '/' || done::text FROM public.my_calendar('learner') WHERE kind = 'homework_due' $q$), 'l1/false');

  -- 2. week openings are _lesson_access_at's, past weeks included --------------------
  SELECT opens_at::text INTO v_week3 FROM public._lesson_access_at(l2, e1, now());
  PERFORM pg_temp.check_eq('week 3 opening equals _lesson_access_at(L2, e1).opens_at (positive control: it is scheduled, so not NULL)',
    pg_temp.as_user(e1, format($q$ SELECT starts_at::text FROM public.my_calendar('learner') WHERE kind = 'week_open' AND week = 3 AND run_id = %L $q$, r1)), v_week3);
  PERFORM pg_temp.check_eq('...and week 1 (already open) is listed, in the past',
    pg_temp.as_user(e1, format($q$ SELECT (starts_at < now())::text || '/' || (starts_at = (SELECT course_runs.starts_at FROM public.course_runs WHERE id = %L))::text FROM public.my_calendar('learner') WHERE kind = 'week_open' AND week = 1 $q$, r1)), 'true/true');
  PERFORM pg_temp.check_eq('...and _lesson_access_at says L1 is open for e1 (no opens_at): the row is history',
    (SELECT state || '/' || COALESCE(opens_at::text, 'null') FROM public._lesson_access_at(l1, e1, now())), 'open/null');

  -- 3. the teacher calendar -----------------------------------------------------------
  PERFORM pg_temp.check_eq('t: both runs'' dates, weeks 1, 3 and the DRAFT 5 for each, R1''s call, the 2 events she manages, her 2 assignments',
    pg_temp.summary(t, 'teacher'), 'call:1,event:2,homework_due:2,run_end:2,run_start:2,week_open:6');
  PERFORM pg_temp.check_eq('...her own group event carries its group id to her (positive control for the learner''s NULL)',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.my_calendar('teacher') WHERE kind = 'event' AND group_id = %L $q$, g)), '1');
  PERFORM pg_temp.check_eq('...no row of another teacher''s course reaches t (positive control: t2 gets them)',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.my_calendar('teacher') WHERE course_id IN (%L, %L) OR group_id = %L $q$, c2, c4, g2))
      || '|' || pg_temp.as_user(t2, format($q$ SELECT count(*)::text FROM public.my_calendar('teacher') WHERE course_id IN (%L, %L) $q$, c2, c4)), '0|8');
  PERFORM pg_temp.check_eq('t2: C2 and the draft C4 (the editor sees drafts), the call, her 2 events, no homework',
    pg_temp.summary(t2, 'teacher'), 'call:1,event:2,run_end:2,run_start:2,week_open:2');
  PERFORM pg_temp.check_eq('t''s teacher view never lists t2''s events (positive control: they exist)',
    pg_temp.as_user(t, $q$ SELECT count(*)::text FROM public.my_calendar('teacher') WHERE title IN ('R3 event', 'G2 event') $q$)
      || '|' || (SELECT count(*)::text FROM calendar_events WHERE title IN ('R3 event', 'G2 event')), '0|2');
  PERFORM pg_temp.check_eq('a learner has no teacher calendar (positive control: e1 has a learner one)',
    pg_temp.summary(e1, 'teacher') || '|' || pg_temp.summary(e1, 'learner'), 'none|event:1,homework_due:1,run_end:1,run_start:1,week_open:2');
  PERFORM pg_temp.check_eq('a teacher who is no learner has no learner calendar (positive control: t has a teacher one)',
    pg_temp.summary(t, 'learner'), 'none');

  -- 4. arguments and anonymous callers ------------------------------------------------
  PERFORM pg_temp.check_eq('an unknown role is refused',
    pg_temp.as_user_err(e1, $q$ SELECT count(*)::text FROM public.my_calendar('admin') $q$), 'ERR:22023');
  PERFORM pg_temp.check_eq('a NULL role is refused',
    pg_temp.as_user_err(e1, $q$ SELECT count(*)::text FROM public.my_calendar(NULL) $q$), 'ERR:22023');
  PERFORM pg_temp.check_eq('anon has no EXECUTE',
    pg_temp.as_anon($q$ SELECT count(*)::text FROM public.my_calendar('learner') $q$), 'ERR:42501');
  PERFORM pg_temp.check_eq('...nor PUBLIC (positive control: authenticated has it)',
    (SELECT has_function_privilege('anon', 'public.my_calendar(text)', 'EXECUTE')::text || '/' ||
            has_function_privilege('authenticated', 'public.my_calendar(text)', 'EXECUTE')::text), 'false/true');

  -- 5. a revocation takes effect at once ----------------------------------------------
  UPDATE run_enrolments SET revoked_at = now() WHERE run_id = r1 AND user_id = e2;
  PERFORM pg_temp.check_eq('revoking e2 removes R1''s dates, call and event from e2 (positive control: e1 still has them)',
    pg_temp.summary(e2, 'learner') || '|' || pg_temp.summary(e1, 'learner'), 'none|event:1,homework_due:1,run_end:1,run_start:1,week_open:2');

  RAISE NOTICE 'COH-015 PASS';
END;
$$;

ROLLBACK;
