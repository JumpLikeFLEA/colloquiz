-- ============================================================
-- supabase/verify/084_calendar_events.sql
--
-- COH-014 full protocol for migration 084 (needs 058, 077, 082, 083 applied).
-- NOT a migration: run after 084 is applied, as postgres. Seeds its own data
-- and ROLLS BACK. A failed assertion aborts with "COH-014 FAIL: ...". Every
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

-- An anonymous caller: role anon, no sub. Returns 'ERR:<sqlstate>' on a refusal.
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

-- A signed-in caller whose statement is expected to be refused by privilege.
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
    RAISE EXCEPTION 'COH-014 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

DO $$
DECLARE
  t   UUID := gen_random_uuid();  -- teacher: edits C1 (runs R1, R2), owns group G (member m1)
  t2  UUID := gen_random_uuid();  -- another teacher: edits C2 (run R3), owns group G2
  tf  UUID := gen_random_uuid();  -- teacher whose seat has lapsed: edits C3 (run R4), owns group GF
  e1  UUID := gen_random_uuid();  -- live enrolee of R1, basic tier
  e2  UUID := gen_random_uuid();  -- live enrolee of R1, extended tier
  ev  UUID := gen_random_uuid();  -- REVOKED enrolee of R1
  eo  UUID := gen_random_uuid();  -- live enrolee of R2 only
  m1  UUID := gen_random_uuid();  -- member of G (linked to t)
  nm  UUID := gen_random_uuid();  -- linked to t, NOT in G
  x   UUID := gen_random_uuid();  -- nobody's
  c1 UUID; c2 UUID; c3 UUID;
  r1 UUID; r2 UUID; r3 UUID; r4 UUID;
  g UUID; g2 UUID; gf UUID;
  v_res TEXT;
  ev_r1 UUID; ev_r2 UUID; ev_g UUID; ev_g2 UUID; ev_r3 UUID; ev_r4 UUID; ev_gf UUID;
  v_when TIMESTAMPTZ := now() + interval '10 days';
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (t,  'authenticated', 'authenticated', 't-'  || t  || '@verify.test'),
    (t2, 'authenticated', 'authenticated', 't2-' || t2 || '@verify.test'),
    (tf, 'authenticated', 'authenticated', 'tf-' || tf || '@verify.test'),
    (e1, 'authenticated', 'authenticated', 'e1-' || e1 || '@verify.test'),
    (e2, 'authenticated', 'authenticated', 'e2-' || e2 || '@verify.test'),
    (ev, 'authenticated', 'authenticated', 'ev-' || ev || '@verify.test'),
    (eo, 'authenticated', 'authenticated', 'eo-' || eo || '@verify.test'),
    (m1, 'authenticated', 'authenticated', 'm1-' || m1 || '@verify.test'),
    (nm, 'authenticated', 'authenticated', 'nm-' || nm || '@verify.test'),
    (x,  'authenticated', 'authenticated', 'x-'  || x  || '@verify.test');

  INSERT INTO courses (slug, title, level, status, format) VALUES ('v84-c1', 'C1', 'A2', 'draft', 'cohort') RETURNING id INTO c1;
  INSERT INTO courses (slug, title, level, status, format) VALUES ('v84-c2', 'C2', 'A2', 'draft', 'cohort') RETURNING id INTO c2;
  INSERT INTO courses (slug, title, level, status, format) VALUES ('v84-c3', 'C3', 'A2', 'draft', 'cohort') RETURNING id INTO c3;
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES (c1, t, t), (c2, t2, t2), (c3, tf, tf);
  -- A run's end is derived from its scheduled lessons (058 _course_runs_guard).
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week) VALUES
    (c1, 1, 'L1', 'l1', 'entitled', 4), (c2, 1, 'L2', 'l2', 'entitled', 4), (c3, 1, 'L3', 'l3', 'entitled', 4);
  INSERT INTO author_seats (user_id, kind, public_name) VALUES
    (t, 'teacher', 'T'), (t2, 'teacher', 'T2');
  INSERT INTO author_seats (user_id, kind, public_name, expires_at) VALUES
    (tf, 'teacher', 'TF', now() + interval '1 second');
  -- The seat is active at insert time; lapse it now (083 verify does the same).
  UPDATE author_seats SET expires_at = now() - interval '1 second' WHERE user_id = tf;

  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (c1, 'R1', now() - interval '2 days', now() + interval '26 days') RETURNING id INTO r1;
  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (c1, 'R2', now() - interval '1 day', now() + interval '27 days') RETURNING id INTO r2;
  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (c2, 'R3', now() - interval '1 day', now() + interval '27 days') RETURNING id INTO r3;
  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (c3, 'R4', now() - interval '1 day', now() + interval '27 days') RETURNING id INTO r4;

  INSERT INTO run_enrolments (run_id, user_id, tier) VALUES
    (r1, e1, 'basic'), (r1, e2, 'extended'), (r1, ev, 'basic'), (r2, eo, 'basic');
  UPDATE run_enrolments SET revoked_at = now() WHERE run_id = r1 AND user_id = ev;

  INSERT INTO teacher_student_links (teacher_id, student_id, source) VALUES
    (t, m1, 'join_link'), (t, nm, 'join_link');
  INSERT INTO teacher_groups (teacher_id, name) VALUES (t,  'G')  RETURNING id INTO g;
  INSERT INTO teacher_groups (teacher_id, name) VALUES (t2, 'G2') RETURNING id INTO g2;
  INSERT INTO teacher_groups (teacher_id, name) VALUES (tf, 'GF') RETURNING id INTO gf;
  INSERT INTO teacher_group_members (group_id, teacher_id, student_id) VALUES (g, t, m1);

  -- 0. seed sanity: the shapes the rest depends on are not empty
  PERFORM pg_temp.check_eq('seed: R1 has 3 enrolment rows, 2 live',
    (SELECT count(*)::text || '/' || count(*) FILTER (WHERE revoked_at IS NULL)::text FROM run_enrolments WHERE run_id = r1), '3/2');
  PERFORM pg_temp.check_eq('seed: G has 1 member, t has 2 linked students',
    (SELECT (SELECT count(*) FROM teacher_group_members WHERE group_id = g)::text || '/' ||
            (SELECT count(*) FROM teacher_student_links WHERE teacher_id = t)::text), '1/2');
  PERFORM pg_temp.check_eq('seed: tf cannot write (083 predicate), t can',
    (SELECT public._studio_can_write(tf)::text || '/' || public._studio_can_write(t)::text), 'false/true');

  -- 1. the table is closed; anon has nothing ------------------------------------
  PERFORM pg_temp.check_eq('no table privilege for authenticated',
    (SELECT has_table_privilege('authenticated', 'public.calendar_events', 'SELECT'))::text, 'false');
  PERFORM pg_temp.check_eq('no table privilege for anon',
    (SELECT has_table_privilege('anon', 'public.calendar_events', 'SELECT'))::text, 'false');
  PERFORM pg_temp.check_eq('anon cannot call the reader',
    pg_temp.as_anon($q$ SELECT count(*)::text FROM public.calendar_events() $q$), 'ERR:42501');
  PERFORM pg_temp.check_eq('anon cannot create',
    pg_temp.as_anon(format($q$ SELECT public.create_calendar_event(%L, NULL, 'x', now())::text $q$, r1)), 'ERR:42501');

  -- 2. an editor adds a run event (and the field rules) ------------------------
  v_res := pg_temp.as_user(t, format(
    $q$ SELECT public.create_calendar_event(%L, NULL, '  Test day  ', %L, %L, ' https://example.com/test ')::text $q$,
    r1, v_when, v_when + interval '2 hours'));
  PERFORM pg_temp.check_eq('t adds a run event to R1: ok', (v_res::jsonb->>'ok'), 'true');
  ev_r1 := (v_res::jsonb->>'id')::uuid;
  PERFORM pg_temp.check_eq('the title and link are trimmed',
    (SELECT title || '|' || link FROM calendar_events WHERE id = ev_r1), 'Test day|https://example.com/test');
  v_res := pg_temp.as_user(t, format(
    $q$ SELECT public.create_calendar_event(%L, NULL, 'No call this week', %L)::text $q$, r2, v_when + interval '1 day'));
  ev_r2 := (v_res::jsonb->>'id')::uuid;
  PERFORM pg_temp.check_eq('an event needs no end and no link',
    (SELECT (ends_at IS NULL)::text || '/' || (link IS NULL)::text FROM calendar_events WHERE id = ev_r2), 'true/true');

  PERFORM pg_temp.check_eq('empty title refused',
    pg_temp.as_user(t, format($q$ SELECT public.create_calendar_event(%L, NULL, '   ', %L)::text $q$, r1, v_when))::jsonb->>'error', 'invalid_event_title');
  PERFORM pg_temp.check_eq('a 121-character title refused',
    pg_temp.as_user(t, format($q$ SELECT public.create_calendar_event(%L, NULL, %L, %L)::text $q$, r1, repeat('a', 121), v_when))::jsonb->>'error', 'invalid_event_title');
  PERFORM pg_temp.check_eq('a 120-character title accepted (boundary)',
    pg_temp.as_user(t, format($q$ SELECT public.create_calendar_event(%L, NULL, %L, %L)::text $q$, r1, repeat('a', 120), v_when))::jsonb->>'ok', 'true');
  PERFORM pg_temp.check_eq('no start refused',
    pg_temp.as_user(t, format($q$ SELECT public.create_calendar_event(%L, NULL, 'x', NULL)::text $q$, r1))::jsonb->>'error', 'invalid_starts_at');
  PERFORM pg_temp.check_eq('infinity start refused',
    pg_temp.as_user(t, format($q$ SELECT public.create_calendar_event(%L, NULL, 'x', 'infinity')::text $q$, r1))::jsonb->>'error', 'invalid_starts_at');
  PERFORM pg_temp.check_eq('an end equal to the start refused',
    pg_temp.as_user(t, format($q$ SELECT public.create_calendar_event(%L, NULL, 'x', %L, %L)::text $q$, r1, v_when, v_when))::jsonb->>'error', 'invalid_event_ends_at');
  PERFORM pg_temp.check_eq('an end before the start refused',
    pg_temp.as_user(t, format($q$ SELECT public.create_calendar_event(%L, NULL, 'x', %L, %L)::text $q$, r1, v_when, v_when - interval '1 hour'))::jsonb->>'error', 'invalid_event_ends_at');
  PERFORM pg_temp.check_eq('an http link refused',
    pg_temp.as_user(t, format($q$ SELECT public.create_calendar_event(%L, NULL, 'x', %L, NULL, 'http://example.com')::text $q$, r1, v_when))::jsonb->>'error', 'invalid_url');
  PERFORM pg_temp.check_eq('a link with a space refused',
    pg_temp.as_user(t, format($q$ SELECT public.create_calendar_event(%L, NULL, 'x', %L, NULL, 'https://a b')::text $q$, r1, v_when))::jsonb->>'error', 'invalid_url');
  PERFORM pg_temp.check_eq('a blank link is no link (ok)',
    pg_temp.as_user(t, format($q$ SELECT public.create_calendar_event(%L, NULL, 'blank', %L, NULL, '   ')::text $q$, r1, v_when))::jsonb->>'ok', 'true');
  PERFORM pg_temp.check_eq('...stored as NULL',
    (SELECT (link IS NULL)::text FROM calendar_events WHERE title = 'blank'), 'true');
  PERFORM pg_temp.check_eq('neither run nor group refused',
    pg_temp.as_user(t, format($q$ SELECT public.create_calendar_event(NULL, NULL, 'x', %L)::text $q$, v_when))::jsonb->>'error', 'invalid_scope');
  PERFORM pg_temp.check_eq('both run and group refused',
    pg_temp.as_user(t, format($q$ SELECT public.create_calendar_event(%L, %L, 'x', %L)::text $q$, r1, g, v_when))::jsonb->>'error', 'invalid_scope');
  PERFORM pg_temp.check_eq('an unknown run',
    pg_temp.as_user(t, format($q$ SELECT public.create_calendar_event(%L, NULL, 'x', %L)::text $q$, gen_random_uuid(), v_when))::jsonb->>'error', 'run_not_found');
  -- The constraints hold even for a writer that skips the RPCs (postgres here).
  BEGIN
    INSERT INTO calendar_events (run_id, group_id, teacher_id, title, starts_at) VALUES (r1, g, t, 'both', v_when);
    PERFORM pg_temp.check_eq('direct INSERT with a run AND a group', 'inserted', 'check_violation');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.check_eq('direct INSERT with a run AND a group', 'check_violation', 'check_violation');
  END;
  BEGIN
    INSERT INTO calendar_events (title, starts_at) VALUES ('neither', v_when);
    PERFORM pg_temp.check_eq('direct INSERT with neither', 'inserted', 'check_violation');
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.check_eq('direct INSERT with neither', 'check_violation', 'check_violation');
  END;
  BEGIN
    INSERT INTO calendar_events (group_id, teacher_id, title, starts_at) VALUES (g, t2, 'wrong teacher', v_when);
    PERFORM pg_temp.check_eq('direct INSERT naming a group under another teacher', 'inserted', 'fk');
  EXCEPTION WHEN foreign_key_violation THEN
    PERFORM pg_temp.check_eq('direct INSERT naming a group under another teacher', 'fk', 'fk');
  END;

  -- 3. a teacher adds a group event --------------------------------------------
  v_res := pg_temp.as_user(t, format(
    $q$ SELECT public.create_calendar_event(NULL, %L, 'Group quiz', %L)::text $q$, g, v_when + interval '2 days'));
  PERFORM pg_temp.check_eq('t adds a group event to G: ok', (v_res::jsonb->>'ok'), 'true');
  ev_g := (v_res::jsonb->>'id')::uuid;
  PERFORM pg_temp.check_eq('the event stores the group''s own teacher',
    (SELECT teacher_id::text FROM calendar_events WHERE id = ev_g), t::text);

  -- 4. who may write: nobody else -----------------------------------------------
  PERFORM pg_temp.check_eq('t2 (edits C2, not C1) cannot add to R1: forbidden',
    pg_temp.as_user(t2, format($q$ SELECT public.create_calendar_event(%L, NULL, 'x', %L)::text $q$, r1, v_when))::jsonb->>'error', 'forbidden');
  PERFORM pg_temp.check_eq('...and t2 CAN add to its own R3 (positive control)',
    pg_temp.as_user(t2, format($q$ SELECT public.create_calendar_event(%L, NULL, 'R3 event', %L)::text $q$, r3, v_when))::jsonb->>'ok', 'true');
  ev_r3 := (SELECT id FROM calendar_events WHERE title = 'R3 event');
  PERFORM pg_temp.check_eq('t2 cannot add to t''s group G: group_not_found (same as unknown)',
    pg_temp.as_user(t2, format($q$ SELECT public.create_calendar_event(NULL, %L, 'x', %L)::text $q$, g, v_when))::jsonb->>'error', 'group_not_found');
  PERFORM pg_temp.check_eq('...and t2 CAN add to its own G2 (positive control)',
    pg_temp.as_user(t2, format($q$ SELECT public.create_calendar_event(NULL, %L, 'G2 event', %L)::text $q$, g2, v_when))::jsonb->>'ok', 'true');
  ev_g2 := (SELECT id FROM calendar_events WHERE title = 'G2 event');
  PERFORM pg_temp.check_eq('an enrolee cannot add a run event: forbidden',
    pg_temp.as_user(e2, format($q$ SELECT public.create_calendar_event(%L, NULL, 'x', %L)::text $q$, r1, v_when))::jsonb->>'error', 'forbidden');
  PERFORM pg_temp.check_eq('a group member cannot add a group event: group_not_found',
    pg_temp.as_user(m1, format($q$ SELECT public.create_calendar_event(NULL, %L, 'x', %L)::text $q$, g, v_when))::jsonb->>'error', 'group_not_found');
  PERFORM pg_temp.check_eq('t2 cannot update t''s event: forbidden',
    pg_temp.as_user(t2, format($q$ SELECT public.update_calendar_event(%L, 'hijack', %L, NULL, NULL)::text $q$, ev_r1, v_when))::jsonb->>'error', 'forbidden');
  PERFORM pg_temp.check_eq('t2 cannot update t''s group event: event_not_found',
    pg_temp.as_user(t2, format($q$ SELECT public.update_calendar_event(%L, 'hijack', %L, NULL, NULL)::text $q$, ev_g, v_when))::jsonb->>'error', 'event_not_found');
  PERFORM pg_temp.check_eq('t2 cannot delete t''s group event: event_not_found',
    pg_temp.as_user(t2, format($q$ SELECT public.delete_calendar_event(%L)::text $q$, ev_g))::jsonb->>'error', 'event_not_found');
  PERFORM pg_temp.check_eq('t2 cannot delete t''s run event: forbidden',
    pg_temp.as_user(t2, format($q$ SELECT public.delete_calendar_event(%L)::text $q$, ev_r1))::jsonb->>'error', 'forbidden');
  PERFORM pg_temp.check_eq('an unknown event',
    pg_temp.as_user(t, format($q$ SELECT public.delete_calendar_event(%L)::text $q$, gen_random_uuid()))::jsonb->>'error', 'event_not_found');
  PERFORM pg_temp.check_eq('after all that, t''s events are intact (title unchanged, still 2 + group)',
    (SELECT title FROM calendar_events WHERE id = ev_r1), 'Test day');

  -- 5. the one reader: who sees what --------------------------------------------
  PERFORM pg_temp.check_eq('e2 (live, extended) sees both of R1''s events and the long-title one (positive control: 4 R1 events exist)',
    pg_temp.as_user(e2, $q$ SELECT count(*)::text FROM public.calendar_events() $q$), (SELECT count(*)::text FROM calendar_events WHERE run_id = r1));
  PERFORM pg_temp.check_eq('e1 (live, basic) sees the same R1 events: either tier',
    pg_temp.as_user(e1, $q$ SELECT count(*)::text FROM public.calendar_events() $q$), (SELECT count(*)::text FROM calendar_events WHERE run_id = r1));
  PERFORM pg_temp.check_eq('e1 sees "Test day"',
    pg_temp.as_user(e1, $q$ SELECT count(*)::text FROM public.calendar_events() WHERE title = 'Test day' $q$), '1');
  PERFORM pg_temp.check_eq('e1 sees nothing of R2 (R2''s event exists)',
    pg_temp.as_user(e1, $q$ SELECT count(*)::text FROM public.calendar_events() WHERE title = 'No call this week' $q$), '0');
  PERFORM pg_temp.check_eq('eo (live in R2 only) sees exactly R2''s event',
    pg_temp.as_user(eo, $q$ SELECT string_agg(title, ',') FROM public.calendar_events() $q$), 'No call this week');
  PERFORM pg_temp.check_eq('ev (REVOKED from R1; their row exists) sees nothing',
    pg_temp.as_user(ev, $q$ SELECT count(*)::text FROM public.calendar_events() $q$), '0');
  PERFORM pg_temp.check_eq('...the revoked row is really there (positive control)',
    (SELECT count(*)::text FROM run_enrolments WHERE user_id = ev AND run_id = r1 AND revoked_at IS NOT NULL), '1');
  PERFORM pg_temp.check_eq('x (nobody''s) sees nothing, though events exist',
    pg_temp.as_user(x, $q$ SELECT count(*)::text FROM public.calendar_events() $q$), '0');
  PERFORM pg_temp.check_eq('...events exist (positive control)',
    (SELECT (count(*) > 0)::text FROM calendar_events), 'true');
  PERFORM pg_temp.check_eq('another run''s ENROLEE does not see R1''s events: eo sees none of "Test day"',
    pg_temp.as_user(eo, $q$ SELECT count(*)::text FROM public.calendar_events() WHERE title = 'Test day' $q$), '0');
  PERFORM pg_temp.check_eq('m1 (member of G) sees the group event',
    pg_temp.as_user(m1, $q$ SELECT string_agg(title, ',') FROM public.calendar_events() $q$), 'Group quiz');
  PERFORM pg_temp.check_eq('m1 gets NO group id and NO run id on it',
    pg_temp.as_user(m1, $q$ SELECT (group_id IS NULL)::text || '/' || (run_id IS NULL)::text || '/' || can_manage::text FROM public.calendar_events() $q$), 'true/true/false');
  PERFORM pg_temp.check_eq('nm (linked to t, NOT in G) does not see the group event',
    pg_temp.as_user(nm, $q$ SELECT count(*)::text FROM public.calendar_events() $q$), '0');
  PERFORM pg_temp.check_eq('t2 does not see t''s run or group events (only its own two)',
    pg_temp.as_user(t2, $q$ SELECT string_agg(title, ',' ORDER BY title) FROM public.calendar_events() $q$), 'G2 event,R3 event');
  PERFORM pg_temp.check_eq('t sees its own events with can_manage, and the group id',
    pg_temp.as_user(t, format($q$ SELECT (group_id = %L)::text || '/' || can_manage::text FROM public.calendar_events() WHERE scope = 'group' $q$, g)), 'true/true');
  PERFORM pg_temp.check_eq('e1 cannot manage',
    pg_temp.as_user(e1, $q$ SELECT bool_or(can_manage)::text FROM public.calendar_events() $q$), 'false');
  PERFORM pg_temp.check_eq('the reader orders by start',
    pg_temp.as_user(t, $q$ SELECT (array_agg(starts_at ORDER BY ord))::text = (array_agg(starts_at ORDER BY starts_at, event_id))::text FROM (SELECT *, row_number() OVER () ord FROM public.calendar_events()) q $q$), 'true');

  -- 6. update and delete by the author ------------------------------------------
  PERFORM pg_temp.check_eq('t updates "Test day": ok',
    pg_temp.as_user(t, format($q$ SELECT public.update_calendar_event(%L, 'Final test', %L, NULL, NULL)::text $q$, ev_r1, v_when + interval '1 hour'))::jsonb->>'ok', 'true');
  PERFORM pg_temp.check_eq('...the update replaced title, end and link',
    (SELECT title || '|' || (ends_at IS NULL)::text || '|' || (link IS NULL)::text FROM calendar_events WHERE id = ev_r1), 'Final test|true|true');
  PERFORM pg_temp.check_eq('...and an invalid update changes nothing',
    pg_temp.as_user(t, format($q$ SELECT public.update_calendar_event(%L, '', %L, NULL, NULL)::text $q$, ev_r1, v_when))::jsonb->>'error', 'invalid_event_title');
  PERFORM pg_temp.check_eq('...title still "Final test"',
    (SELECT title FROM calendar_events WHERE id = ev_r1), 'Final test');
  PERFORM pg_temp.check_eq('the learner sees the edit',
    pg_temp.as_user(e1, $q$ SELECT count(*)::text FROM public.calendar_events() WHERE title = 'Final test' $q$), '1');
  PERFORM pg_temp.check_eq('t deletes the group event: ok',
    pg_temp.as_user(t, format($q$ SELECT public.delete_calendar_event(%L)::text $q$, ev_g))::jsonb->>'ok', 'true');
  PERFORM pg_temp.check_eq('...the member no longer sees it',
    pg_temp.as_user(m1, $q$ SELECT count(*)::text FROM public.calendar_events() $q$), '0');

  -- 7. a group event follows membership; a link that ends takes the student out --
  v_res := pg_temp.as_user(t, format($q$ SELECT public.create_calendar_event(NULL, %L, 'Group quiz 2', %L)::text $q$, g, v_when));
  ev_g := (v_res::jsonb->>'id')::uuid;
  PERFORM pg_temp.check_eq('seed: m1 sees the new group event',
    pg_temp.as_user(m1, $q$ SELECT count(*)::text FROM public.calendar_events() $q$), '1');
  INSERT INTO teacher_group_members (group_id, teacher_id, student_id) VALUES (g, t, nm);
  PERFORM pg_temp.check_eq('nm added to G: now sees it',
    pg_temp.as_user(nm, $q$ SELECT count(*)::text FROM public.calendar_events() $q$), '1');
  DELETE FROM teacher_group_members WHERE group_id = g AND student_id = nm;
  PERFORM pg_temp.check_eq('nm removed from G: sees nothing again',
    pg_temp.as_user(nm, $q$ SELECT count(*)::text FROM public.calendar_events() $q$), '0');
  UPDATE teacher_student_links SET ended_at = now(), ended_by = t WHERE teacher_id = t AND student_id = m1;
  PERFORM pg_temp.check_eq('m1''s link to t ends: their membership went (077 trigger) and so did the event',
    pg_temp.as_user(m1, $q$ SELECT count(*)::text FROM public.calendar_events() $q$), '0');
  PERFORM pg_temp.check_eq('...the event itself is still there (positive control)',
    (SELECT count(*)::text FROM calendar_events WHERE id = ev_g), '1');

  -- 8. a revoked enrolee loses sight at once -------------------------------------
  PERFORM pg_temp.check_eq('seed: e1 sees R1''s events',
    pg_temp.as_user(e1, $q$ SELECT (count(*) > 0)::text FROM public.calendar_events() $q$), 'true');
  UPDATE run_enrolments SET revoked_at = now() WHERE run_id = r1 AND user_id = e1;
  PERFORM pg_temp.check_eq('e1 revoked: sees nothing',
    pg_temp.as_user(e1, $q$ SELECT count(*)::text FROM public.calendar_events() $q$), '0');
  PERFORM pg_temp.check_eq('...e2, still live, still sees them (positive control)',
    pg_temp.as_user(e2, $q$ SELECT (count(*) > 0)::text FROM public.calendar_events() $q$), 'true');

  -- 9. a lapsed seat reads but does not write (083) ------------------------------
  INSERT INTO calendar_events (run_id, title, starts_at) VALUES (r4, 'R4 event', v_when) RETURNING id INTO ev_r4;
  INSERT INTO calendar_events (group_id, teacher_id, title, starts_at) VALUES (gf, tf, 'GF event', v_when) RETURNING id INTO ev_gf;
  PERFORM pg_temp.check_eq('tf (lapsed) still READS its events',
    pg_temp.as_user(tf, $q$ SELECT count(*)::text FROM public.calendar_events() $q$), '2');
  PERFORM pg_temp.check_eq('tf cannot create a run event: seat_lapsed',
    pg_temp.as_user(tf, format($q$ SELECT public.create_calendar_event(%L, NULL, 'x', %L)::text $q$, r4, v_when))::jsonb->>'error', 'seat_lapsed');
  PERFORM pg_temp.check_eq('tf cannot create a group event: seat_lapsed',
    pg_temp.as_user(tf, format($q$ SELECT public.create_calendar_event(NULL, %L, 'x', %L)::text $q$, gf, v_when))::jsonb->>'error', 'seat_lapsed');
  PERFORM pg_temp.check_eq('tf cannot update: seat_lapsed',
    pg_temp.as_user(tf, format($q$ SELECT public.update_calendar_event(%L, 'x', %L, NULL, NULL)::text $q$, ev_r4, v_when))::jsonb->>'error', 'seat_lapsed');
  PERFORM pg_temp.check_eq('tf cannot delete: seat_lapsed',
    pg_temp.as_user(tf, format($q$ SELECT public.delete_calendar_event(%L)::text $q$, ev_gf))::jsonb->>'error', 'seat_lapsed');
  PERFORM pg_temp.check_eq('...nothing changed (both rows still there, titles intact)',
    (SELECT string_agg(title, ',' ORDER BY title) FROM calendar_events WHERE id IN (ev_r4, ev_gf)), 'GF event,R4 event');
  PERFORM pg_temp.check_eq('a lapsed seat does not hide a learner''s events: positive control, e2 still sees R1',
    pg_temp.as_user(e2, $q$ SELECT (count(*) > 0)::text FROM public.calendar_events() $q$), 'true');

  -- 10. deletion: a run, a group, an account -------------------------------------
  PERFORM pg_temp.check_eq('seed: R3 has an event',
    (SELECT count(*)::text FROM calendar_events WHERE run_id = r3), '1');
  DELETE FROM course_runs WHERE id = r3;
  PERFORM pg_temp.check_eq('deleting the run takes its events',
    (SELECT count(*)::text FROM calendar_events WHERE id = ev_r3), '0');
  PERFORM pg_temp.check_eq('seed: G2 has an event',
    (SELECT count(*)::text FROM calendar_events WHERE group_id = g2), '1');
  PERFORM pg_temp.check_eq('t2 deletes the account: ok',
    pg_temp.as_user(t2, $q$ SELECT public.delete_my_account()::text $q$)::jsonb->>'ok', 'true');
  PERFORM pg_temp.check_eq('...the group and its events are gone',
    (SELECT (SELECT count(*) FROM teacher_groups WHERE id = g2)::text || '/' ||
            (SELECT count(*) FROM calendar_events WHERE id = ev_g2)::text), '0/0');
  PERFORM pg_temp.check_eq('...t''s events untouched by another account''s deletion (positive control)',
    (SELECT (count(*) > 0)::text FROM calendar_events WHERE teacher_id = t OR run_id = r1), 'true');

  RAISE NOTICE 'COH-014 PASS';
END;
$$;

ROLLBACK;
