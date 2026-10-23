-- ============================================================
-- supabase/verify/099_telegram_week_pings.sql
--
-- COH-012 full protocol for migration 099 (needs 058, 090 and 096 applied).
-- NOT a migration: run after 099 is applied, as postgres. Seeds its own data
-- and ROLLS BACK. A failed assertion aborts with "COH-012 FAIL: ...". Every
-- denial is paired with a positive control proving the rows it would have
-- hidden exist (a learner is left out for ONE reason, then that reason is
-- removed and the learner is claimed). The clock is moved through the claim's
-- p_now; nothing here waits.
-- ============================================================
BEGIN;

CREATE FUNCTION pg_temp.as_role(p_role TEXT, p_user UUID, p_sql TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_user IS NULL THEN json_build_object('role', p_role)::text
         ELSE json_build_object('sub', p_user, 'role', p_role)::text END, true);
  PERFORM set_config('role', p_role, true);
  EXECUTE p_sql INTO v;
  PERFORM set_config('role', 'postgres', true);
  RETURN COALESCE(v, 'null');
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('role', 'postgres', true);
  RETURN 'ERR:' || SQLSTATE;
END;
$$;

CREATE FUNCTION pg_temp.as_user(p_user UUID, p_sql TEXT) RETURNS TEXT LANGUAGE sql AS
$$ SELECT pg_temp.as_role('authenticated', p_user, p_sql) $$;
CREATE FUNCTION pg_temp.as_anon(p_sql TEXT) RETURNS TEXT LANGUAGE sql AS
$$ SELECT pg_temp.as_role('anon', NULL, p_sql) $$;
CREATE FUNCTION pg_temp.as_service(p_sql TEXT) RETURNS TEXT LANGUAGE sql AS
$$ SELECT pg_temp.as_role('service_role', NULL, p_sql) $$;

CREATE FUNCTION pg_temp.check_eq(p_label TEXT, p_got TEXT, p_want TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE '% -> got % (want %)', p_label, p_got, p_want;
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'COH-012 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

-- SQL that claims at a given clock and returns "name:week,name:week" (or "-"), the names
-- coming from a VALUES list built while still postgres (the role switch takes away USAGE
-- on pg_temp). With p_times each item also carries the claimed opened_at as epoch seconds.
CREATE FUNCTION pg_temp.claim_sql(p_names TEXT, p_now TIMESTAMPTZ, p_times BOOLEAN DEFAULT false)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT format(
    $f$ SELECT COALESCE(string_agg(n.name || ':' || x.week %s, ',' ORDER BY n.name, x.week), '-')
        FROM public.telegram_week_ping_claim(100, %L) x
        JOIN (VALUES %s) n(id, name) ON n.id = x.recipient_id $f$,
    CASE WHEN p_times THEN $e$ || ':' || extract(epoch FROM x.opened_at)::bigint $e$ ELSE '' END,
    p_now, p_names)
$$;

DO $$
DECLARE
  t0 TIMESTAMPTZ := now();
  a UUID := gen_random_uuid();   -- enrolled and linked before the run: gets every week
  b UUID := gen_random_uuid();   -- linked, enrolment REVOKED
  c UUID := gen_random_uuid();   -- enrolled, link STOPPED
  d UUID := gen_random_uuid();   -- enrolled, NEVER linked
  e UUID := gen_random_uuid();   -- enrolled and linked 12 h AFTER the run started
  f UUID := gen_random_uuid();   -- enrolled before, linked 6 h AFTER the run started
  g UUID := gen_random_uuid();   -- enrolled and linked, but the course is a draft
  h UUID := gen_random_uuid();   -- like a, created late: the 3-day freshness cap
  v_c UUID; v_c2 UUID; v_run UUID; v_run2 UUID;
  l1 UUID; l2 UUID; l3 UUID; l4 UUID; l5 UUID; v UUID; vv UUID;
  ea UUID; eb UUID; ec UUID; ed UUID; ee UUID; ef UUID; eg UUID; eh UUID;
  v_start TIMESTAMPTZ;
  names TEXT;
  r TEXT;
  n_before INT; n_e INT;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (a, 'authenticated', 'authenticated', 'a-' || a || '@verify.test'),
    (b, 'authenticated', 'authenticated', 'b-' || b || '@verify.test'),
    (c, 'authenticated', 'authenticated', 'c-' || c || '@verify.test'),
    (d, 'authenticated', 'authenticated', 'd-' || d || '@verify.test'),
    (e, 'authenticated', 'authenticated', 'e-' || e || '@verify.test'),
    (f, 'authenticated', 'authenticated', 'f-' || f || '@verify.test'),
    (g, 'authenticated', 'authenticated', 'g-' || g || '@verify.test'),
    (h, 'authenticated', 'authenticated', 'h-' || h || '@verify.test');
  names := format('(%L::uuid,''a''),(%L::uuid,''b''),(%L::uuid,''c''),(%L::uuid,''d''),'
                  '(%L::uuid,''e''),(%L::uuid,''f''),(%L::uuid,''g''),(%L::uuid,''h'')',
                  a, b, c, d, e, f, g, h);

  -- the course: lessons in weeks 1, 2, 3 (a DRAFT at first), 4 and 5 ------------------
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v99-c', 'Verify Course', 'A2', 'published', 'cohort', 's', 'c') RETURNING id INTO v_c;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week) VALUES (v_c, 1, 'L1', 'v99-l1', 'entitled', 1) RETURNING id INTO l1;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week) VALUES (v_c, 2, 'L2', 'v99-l2', 'entitled', 2) RETURNING id INTO l2;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week) VALUES (v_c, 3, 'L3', 'v99-l3', 'entitled', 3) RETURNING id INTO l3;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week) VALUES (v_c, 4, 'L4', 'v99-l4', 'entitled', 4) RETURNING id INTO l4;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week) VALUES (v_c, 5, 'L5', 'v99-l5', 'entitled', 5) RETURNING id INTO l5;
  -- publish every lesson but l3
  FOR v IN SELECT unnest(ARRAY[l1, l2, l4, l5]) LOOP
    INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v, '[]'::jsonb, 'editor') RETURNING id INTO vv;
    UPDATE lessons SET published_version_id = vv WHERE id = v;
  END LOOP;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (l3, '[]'::jsonb, 'editor');

  -- the run started a day ago and ends 28 days after it started (weeks 1..4 open before it,
  -- week 5 would open exactly at the end)
  v_start := t0 - interval '1 day';
  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (v_c, 'R', v_start, v_start + interval '28 days') RETURNING id INTO v_run;

  -- a draft course with one enrolled, linked learner
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v99-draft', 'Draft Course', 'A2', 'draft', 'cohort', 's', 'c') RETURNING id INTO v_c2;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week) VALUES (v_c2, 1, 'D1', 'v99-d1', 'entitled', 1);
  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (v_c2, 'R2', v_start, v_start + interval '7 days') RETURNING id INTO v_run2;

  INSERT INTO run_enrolments (run_id, user_id, tier, enrolled_at) VALUES (v_run, a, 'basic', t0 - interval '5 days') RETURNING id INTO ea;
  INSERT INTO run_enrolments (run_id, user_id, tier, enrolled_at, revoked_at)
    VALUES (v_run, b, 'basic', t0 - interval '5 days', t0 - interval '2 days') RETURNING id INTO eb;
  INSERT INTO run_enrolments (run_id, user_id, tier, enrolled_at) VALUES (v_run, c, 'basic', t0 - interval '5 days') RETURNING id INTO ec;
  INSERT INTO run_enrolments (run_id, user_id, tier, enrolled_at) VALUES (v_run, d, 'basic', t0 - interval '5 days') RETURNING id INTO ed;
  INSERT INTO run_enrolments (run_id, user_id, tier, enrolled_at) VALUES (v_run, e, 'extended', t0 - interval '12 hours') RETURNING id INTO ee;
  INSERT INTO run_enrolments (run_id, user_id, tier, enrolled_at) VALUES (v_run, f, 'basic', t0 - interval '5 days') RETURNING id INTO ef;
  INSERT INTO run_enrolments (run_id, user_id, tier, enrolled_at) VALUES (v_run2, g, 'basic', t0 - interval '5 days') RETURNING id INTO eg;

  INSERT INTO telegram_links (user_id, chat_id, lang, linked_at) VALUES
    (a, 9900001, 'ru', t0 - interval '5 days'),
    (b, 9900002, 'en', t0 - interval '5 days'),
    (e, 9900005, 'en', t0 - interval '12 hours'),
    (f, 9900006, 'ru', t0 - interval '6 hours'),
    (g, 9900007, 'en', t0 - interval '5 days');
  INSERT INTO telegram_links (user_id, chat_id, lang, linked_at, stopped_at)
    VALUES (c, 9900003, 'en', t0 - interval '5 days', t0 - interval '1 day');

  -- 0. seed sanity: the learners that must be left out exist, with one reason each ----------
  PERFORM pg_temp.check_eq('seed: 7 enrolments in the run + 1 in the draft course, 1 revoked; 4 active links on the run, 1 stopped, d has none',
    (SELECT count(*)::text FROM run_enrolments WHERE run_id = v_run) || '/' ||
    (SELECT count(*)::text FROM run_enrolments WHERE run_id = v_run2) || '/' ||
    (SELECT count(*)::text FROM run_enrolments WHERE run_id = v_run AND revoked_at IS NOT NULL) || '/' ||
    (SELECT count(*)::text FROM telegram_links WHERE user_id IN (a, b, e, f) AND stopped_at IS NULL) || '/' ||
    (SELECT count(*)::text FROM telegram_links WHERE user_id = c AND stopped_at IS NOT NULL) || '/' ||
    (SELECT count(*)::text FROM telegram_links WHERE user_id = d) || '/' ||
    (SELECT count(*)::text FROM telegram_week_pings),
    '6/1/1/4/1/0/0');
  PERFORM pg_temp.check_eq('seed: lessons in weeks 1,2,4,5 published, week 3 a draft',
    (SELECT string_agg(week::text, ',' ORDER BY week) FROM lessons WHERE course_id = v_c AND published_version_id IS NOT NULL) || '|' ||
    (SELECT count(*)::text FROM lessons WHERE course_id = v_c AND week = 3 AND published_version_id IS NULL),
    '1,2,4,5|1');

  -- 1. the table and the function are closed ---------------------------------------------------
  PERFORM pg_temp.check_eq('authenticated and anon cannot read or write the log',
    pg_temp.as_user(a, $q$ SELECT count(*)::text FROM public.telegram_week_pings $q$) || '|' ||
    pg_temp.as_anon($q$ SELECT count(*)::text FROM public.telegram_week_pings $q$) || '|' ||
    pg_temp.as_user(a, $q$ INSERT INTO public.telegram_week_pings (enrolment_id, week) VALUES (gen_random_uuid(), 1) RETURNING 'x' $q$),
    'ERR:42501|ERR:42501|ERR:42501');
  PERFORM pg_temp.check_eq('authenticated and anon cannot call the claim',
    pg_temp.as_user(a, pg_temp.claim_sql(names, t0)) || '|' || pg_temp.as_anon(pg_temp.claim_sql(names, t0)),
    'ERR:42501|ERR:42501');
  PERFORM pg_temp.check_eq('...service_role may (positive control for the denials above)',
    has_function_privilege('service_role', 'public.telegram_week_ping_claim(integer, timestamptz)', 'EXECUTE')::text || '|' ||
    has_function_privilege('authenticated', 'public.telegram_week_ping_claim(integer, timestamptz)', 'EXECUTE')::text,
    'true|false');
  PERFORM pg_temp.check_eq('claiming wrote nothing yet',
    (SELECT count(*)::text FROM telegram_week_pings), '0');

  -- 2. week 1 ("the course has started"): exactly the learner who qualifies --------------------
  PERFORM pg_temp.check_eq('t0: only a is claimed, week 1; b revoked, c stopped, d never linked, e and f joined after it opened, g draft course, h not yet created',
    pg_temp.as_service(pg_temp.claim_sql(names, t0)), 'a:1');
  PERFORM pg_temp.check_eq('...one log row, for a''s enrolment and week 1',
    (SELECT count(*)::text || '/' || bool_and(enrolment_id = ea AND week = 1)::text FROM telegram_week_pings), '1/true');
  PERFORM pg_temp.check_eq('a second cron run at the same clock sends nothing new; still one log row',
    pg_temp.as_service(pg_temp.claim_sql(names, t0)) || '|' || (SELECT count(*)::text FROM telegram_week_pings), '-|1');
  -- the draft course: left out above; publishing it is the only change, and g is claimed ------
  UPDATE courses SET status = 'published' WHERE id = v_c2;
  PERFORM pg_temp.check_eq('g: the course is published now, nothing else changed: claimed week 1',
    pg_temp.as_service(pg_temp.claim_sql(names, t0)), 'g:1');

  -- 3. a week that has not opened gets nothing, then it opens -----------------------------------
  -- week 2 opens at start + 7 days = t0 + 6 days
  PERFORM pg_temp.check_eq('t0+6d-1h: week 2 is not open yet: nobody',
    pg_temp.as_service(pg_temp.claim_sql(names, t0 + interval '6 days' - interval '1 hour')), '-');
  PERFORM pg_temp.check_eq('the access function agrees: l2 is scheduled for a at that clock, opening at the claim''s moment',
    (SELECT state || '|' || (opens_at = v_start + interval '7 days')::text
       FROM public._lesson_access_at(l2, a, t0 + interval '6 days' - interval '1 hour')), 'scheduled|true');
  r := pg_temp.as_service(pg_temp.claim_sql(names, t0 + interval '6 days' + interval '1 hour', true));
  PERFORM pg_temp.check_eq('t0+6d+1h: week 2 is open: a, e and f (they joined before it opened), with opened_at = start + 7 days',
    r, format('a:2:%s,e:2:%s,f:2:%s',
      extract(epoch FROM v_start + interval '7 days')::bigint,
      extract(epoch FROM v_start + interval '7 days')::bigint,
      extract(epoch FROM v_start + interval '7 days')::bigint));
  PERFORM pg_temp.check_eq('the access function agrees: l2 is open for a at that clock',
    (SELECT state FROM public._lesson_access_at(l2, a, t0 + interval '6 days' + interval '1 hour')), 'open');
  PERFORM pg_temp.check_eq('a second cron run at that clock sends nothing; a has week 1 and 2 once each',
    pg_temp.as_service(pg_temp.claim_sql(names, t0 + interval '6 days' + interval '1 hour')) || '|' ||
    (SELECT string_agg(week::text, ',' ORDER BY week) FROM telegram_week_pings WHERE enrolment_id = ea),
    '-|1,2');

  -- 4. a week with no published lesson is not announced; publishing the lesson announces it -----
  PERFORM pg_temp.check_eq('t0+13d+1h: week 3 opened but only a draft lesson is in it: nobody',
    pg_temp.as_service(pg_temp.claim_sql(names, t0 + interval '13 days' + interval '1 hour')), '-');
  UPDATE lessons SET published_version_id = (SELECT id FROM lesson_versions WHERE lesson_id = l3) WHERE id = l3;
  PERFORM pg_temp.check_eq('...the lesson is published, nothing else changed: a, e, f get week 3',
    pg_temp.as_service(pg_temp.claim_sql(names, t0 + interval '13 days' + interval '1 hour')), 'a:3,e:3,f:3');

  -- 5. week 4 (start + 21 days) -------------------------------------------------------------------
  PERFORM pg_temp.check_eq('t0+20d+1h: week 4 is open: a, e, f',
    pg_temp.as_service(pg_temp.claim_sql(names, t0 + interval '20 days' + interval '1 hour')), 'a:4,e:4,f:4');

  -- 6. a message that is more than 3 days old is not sent -----------------------------------------
  INSERT INTO run_enrolments (run_id, user_id, tier, enrolled_at) VALUES (v_run, h, 'basic', t0 - interval '5 days') RETURNING id INTO eh;
  INSERT INTO telegram_links (user_id, chat_id, lang, linked_at) VALUES (h, 9900008, 'en', t0 - interval '5 days');
  PERFORM pg_temp.check_eq('h (enrolled and linked long before): at t0+24d week 4 opened 4 days ago: too old, nobody',
    pg_temp.as_service(pg_temp.claim_sql(names, t0 + interval '24 days')), '-');
  PERFORM pg_temp.check_eq('...at t0+22d+23h the same week opened 2 days 23 h ago: only h, week 4 (the cap was the only reason)',
    pg_temp.as_service(pg_temp.claim_sql(names, t0 + interval '22 days' + interval '23 hours')), 'h:4');

  -- 7. each exclusion removed on its own: the learner is claimed ---------------------------------
  -- a revocation is final (058); re-enrolling adds a new row (0093 c)
  INSERT INTO run_enrolments (run_id, user_id, tier, enrolled_at) VALUES (v_run, b, 'basic', t0 - interval '5 days');
  UPDATE telegram_links SET stopped_at = NULL WHERE user_id = c;
  INSERT INTO telegram_links (user_id, chat_id, lang, linked_at) VALUES (d, 9900004, 'en', t0 - interval '5 days');
  PERFORM pg_temp.check_eq('b re-enrolled (a new row), c''s link restarted, linked d: at the same clock b, c, d are claimed (week 4)',
    pg_temp.as_service(pg_temp.claim_sql(names, t0 + interval '22 days' + interval '23 hours')), 'b:4,c:4,d:4');

  -- 7b. a week that would open at or after the run's end is not announced ----------------------------
  -- (the run's stored end is start + 35 days: week 5 opens at start + 28 days, inside it)
  PERFORM pg_temp.check_eq('seed: the run ends after week 5 opens; week 5 has a published lesson',
    (SELECT (ends_at = v_start + interval '35 days')::text FROM course_runs WHERE id = v_run) || '|' ||
    (SELECT count(*)::text FROM lessons WHERE course_id = v_c AND week = 5 AND published_version_id IS NOT NULL), 'true|1');
  BEGIN
    -- probe, rolled back: with the run still open, week 5 at t0+28d+1h is due to all seven
    r := pg_temp.as_service(pg_temp.claim_sql(names, t0 + interval '28 days' + interval '1 hour'));
    RAISE EXCEPTION 'probe_done' USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    NULL;
  END;
  PERFORM pg_temp.check_eq('positive control (probe, rolled back): week 5 is due to a, b, c, d, e, f, h while the run is open',
    r || '|' || (SELECT count(*)::text FROM telegram_week_pings WHERE week = 5), 'a:5,b:5,c:5,d:5,e:5,f:5,h:5|0');
  UPDATE course_runs SET ends_at = v_start + interval '28 days' WHERE id = v_run;
  PERFORM pg_temp.check_eq('the run closes early, at the moment week 5 would open: nobody is told it is open',
    pg_temp.as_service(pg_temp.claim_sql(names, t0 + interval '28 days' + interval '1 hour')) || '|' ||
    (SELECT count(*)::text FROM telegram_week_pings WHERE week = 5), '-|0');

  -- 8. the key is the enrolment and the week ------------------------------------------------------
  PERFORM pg_temp.check_eq('a duplicate log row is refused by the primary key',
    pg_temp.as_role('postgres', NULL,
      format($q$ INSERT INTO public.telegram_week_pings (enrolment_id, week) VALUES (%L, 1) RETURNING 'x' $q$, ea)),
    'ERR:23505');
  PERFORM pg_temp.check_eq('a week below 1 is refused',
    pg_temp.as_role('postgres', NULL,
      format($q$ INSERT INTO public.telegram_week_pings (enrolment_id, week) VALUES (%L, 0) RETURNING 'x' $q$, ea)),
    'ERR:23514');

  -- 9. account deletion removes the logs --------------------------------------------------------------
  SELECT count(*) INTO n_before FROM telegram_week_pings;
  SELECT count(*) INTO n_e FROM telegram_week_pings WHERE enrolment_id = ee;
  PERFORM pg_temp.check_eq('seed: e has 3 log rows (weeks 2, 3, 4) out of the total', n_e::text, '3');
  PERFORM pg_temp.check_eq('e deletes the account: ok',
    (pg_temp.as_user(e, $q$ SELECT public.delete_my_account()::text $q$)::jsonb)->>'ok', 'true');
  PERFORM pg_temp.check_eq('...e''s log rows are gone and nobody else''s changed (positive control)',
    (SELECT count(*) FROM telegram_week_pings WHERE enrolment_id = ee)::text || '|' ||
    ((SELECT count(*) FROM telegram_week_pings) = n_before - n_e)::text, '0|true');

  RAISE NOTICE 'COH-012 PASS';
END;
$$;

ROLLBACK;
