-- ============================================================
-- supabase/verify/100_telegram_call_pings.sql
--
-- COH-013 full protocol for migration 100 (needs 058, 090 and 096 applied).
-- NOT a migration: run after 100 is applied, as postgres. Seeds its own data
-- and ROLLS BACK. A failed assertion aborts with "COH-013 FAIL: ...". Every
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
    RAISE EXCEPTION 'COH-013 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

-- SQL that claims at a given clock and returns "name:callTitle,..." (or "-"), the names
-- coming from a VALUES list built while still postgres (the role switch takes away USAGE
-- on pg_temp). p_extra is appended to each item (e.g. the saved zone).
CREATE FUNCTION pg_temp.claim_sql(p_names TEXT, p_now TIMESTAMPTZ, p_extra TEXT DEFAULT '')
RETURNS TEXT LANGUAGE sql AS $$
  SELECT format(
    $f$ SELECT COALESCE(string_agg(n.name || ':' || x.call_title %s, ',' ORDER BY n.name, x.call_title), '-')
        FROM public.telegram_call_ping_claim(100, %L) x
        JOIN (VALUES %s) n(id, name) ON n.id = x.recipient_id $f$,
    p_extra, p_now, p_names)
$$;

DO $$
DECLARE
  t0 TIMESTAMPTZ := now();
  a UUID := gen_random_uuid();   -- extended, linked (ru, Europe/Belgrade): gets its run's calls
  b UUID := gen_random_uuid();   -- extended, linked, enrolment REVOKED
  c UUID := gen_random_uuid();   -- extended, link STOPPED
  d UUID := gen_random_uuid();   -- extended, NEVER linked
  e UUID := gen_random_uuid();   -- BASIC, linked
  f UUID := gen_random_uuid();   -- extended, linked, but the course is a draft
  g UUID := gen_random_uuid();   -- extended, linked, in ANOTHER run of the course
  v_c UUID; v_c2 UUID; v_runA UUID; v_runB UUID; v_runD UUID;
  kA0 UUID; kA1 UUID; kA2 UUID; kA3 UUID; kA4 UUID; kB1 UUID; kD1 UUID;
  ea UUID; eb UUID; ec UUID; ed UUID; ee UUID; ef UUID; eg UUID;
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
    (g, 'authenticated', 'authenticated', 'g-' || g || '@verify.test');
  names := format('(%L::uuid,''a''),(%L::uuid,''b''),(%L::uuid,''c''),(%L::uuid,''d''),'
                  '(%L::uuid,''e''),(%L::uuid,''f''),(%L::uuid,''g'')',
                  a, b, c, d, e, f, g);

  -- the course, two runs of it, and a draft course with a run ---------------------------------
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v100-c', 'Verify Course', 'A2', 'published', 'cohort', 's', 'c') RETURNING id INTO v_c;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v100-draft', 'Draft Course', 'A2', 'draft', 'cohort', 's', 'c') RETURNING id INTO v_c2;
  -- a run needs a scheduled lesson (058's guard derives its end from the lessons' weeks)
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week) VALUES (v_c, 1, 'L1', 'v100-l1', 'entitled', 1);
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week) VALUES (v_c2, 1, 'D1', 'v100-d1', 'entitled', 1);
  v_start := t0 - interval '1 day';
  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (v_c, 'RA', v_start, v_start + interval '28 days') RETURNING id INTO v_runA;
  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (v_c, 'RB', v_start, v_start + interval '28 days') RETURNING id INTO v_runB;
  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (v_c2, 'RD', v_start, v_start + interval '28 days') RETURNING id INTO v_runD;

  -- run A's calls: one already started, then +10 h, +24 h 30 min (inside 25 h, beyond 24 h),
  -- +25 h 30 min (outside). Run B and the draft run each have one at +12 h.
  INSERT INTO run_calls (run_id, starts_at, meet_url, title) VALUES (v_runA, t0 - interval '1 hour', 'https://meet.test/a0', 'A0') RETURNING id INTO kA0;
  INSERT INTO run_calls (run_id, starts_at, meet_url, title) VALUES (v_runA, t0 + interval '10 hours', 'https://meet.test/a1', 'A1') RETURNING id INTO kA1;
  INSERT INTO run_calls (run_id, starts_at, meet_url, title) VALUES (v_runA, t0 + interval '24 hours 30 minutes', 'https://meet.test/a2', 'A2') RETURNING id INTO kA2;
  INSERT INTO run_calls (run_id, starts_at, meet_url, title) VALUES (v_runA, t0 + interval '25 hours 30 minutes', 'https://meet.test/a3', 'A3') RETURNING id INTO kA3;
  INSERT INTO run_calls (run_id, starts_at, meet_url, title) VALUES (v_runB, t0 + interval '12 hours', 'https://meet.test/b1', 'B1') RETURNING id INTO kB1;
  INSERT INTO run_calls (run_id, starts_at, meet_url, title) VALUES (v_runD, t0 + interval '12 hours', 'https://meet.test/d1', 'D1') RETURNING id INTO kD1;

  INSERT INTO run_enrolments (run_id, user_id, tier, enrolled_at) VALUES (v_runA, a, 'extended', t0 - interval '5 days') RETURNING id INTO ea;
  INSERT INTO run_enrolments (run_id, user_id, tier, enrolled_at, revoked_at)
    VALUES (v_runA, b, 'extended', t0 - interval '5 days', t0 - interval '2 days') RETURNING id INTO eb;
  INSERT INTO run_enrolments (run_id, user_id, tier, enrolled_at) VALUES (v_runA, c, 'extended', t0 - interval '5 days') RETURNING id INTO ec;
  INSERT INTO run_enrolments (run_id, user_id, tier, enrolled_at) VALUES (v_runA, d, 'extended', t0 - interval '5 days') RETURNING id INTO ed;
  INSERT INTO run_enrolments (run_id, user_id, tier, enrolled_at) VALUES (v_runA, e, 'basic', t0 - interval '5 days') RETURNING id INTO ee;
  INSERT INTO run_enrolments (run_id, user_id, tier, enrolled_at) VALUES (v_runD, f, 'extended', t0 - interval '5 days') RETURNING id INTO ef;
  INSERT INTO run_enrolments (run_id, user_id, tier, enrolled_at) VALUES (v_runB, g, 'extended', t0 - interval '5 days') RETURNING id INTO eg;

  INSERT INTO telegram_links (user_id, chat_id, lang, time_zone, linked_at) VALUES
    (a, 9910001, 'ru', 'Europe/Belgrade', t0 - interval '5 days'),
    (b, 9910002, 'en', NULL, t0 - interval '5 days'),
    (e, 9910005, 'en', NULL, t0 - interval '5 days'),
    (f, 9910006, 'en', NULL, t0 - interval '5 days'),
    (g, 9910007, 'en', 'Asia/Tokyo', t0 - interval '5 days');
  INSERT INTO telegram_links (user_id, chat_id, lang, linked_at, stopped_at)
    VALUES (c, 9910003, 'en', t0 - interval '5 days', t0 - interval '1 day');

  -- 0. seed sanity: each learner that must be left out exists, with one reason ----------------
  PERFORM pg_temp.check_eq('seed: 5 enrolments in run A (1 revoked, 1 basic), 1 in B, 1 in the draft run; 5 active links, 1 stopped, d has none; 6 calls + 1 already started; nothing logged',
    (SELECT count(*)::text FROM run_enrolments WHERE run_id = v_runA) || '/' ||
    (SELECT count(*)::text FROM run_enrolments WHERE run_id = v_runA AND revoked_at IS NOT NULL) || '/' ||
    (SELECT count(*)::text FROM run_enrolments WHERE run_id = v_runA AND tier = 'basic') || '/' ||
    (SELECT count(*)::text FROM run_enrolments WHERE run_id IN (v_runB, v_runD)) || '/' ||
    (SELECT count(*)::text FROM telegram_links WHERE user_id IN (a, b, e, f, g) AND stopped_at IS NULL) || '/' ||
    (SELECT count(*)::text FROM telegram_links WHERE user_id = c AND stopped_at IS NOT NULL) || '/' ||
    (SELECT count(*)::text FROM telegram_links WHERE user_id = d) || '/' ||
    (SELECT count(*)::text FROM run_calls WHERE run_id IN (v_runA, v_runB, v_runD)) || '/' ||
    (SELECT count(*)::text FROM telegram_call_pings),
    '5/1/1/2/5/1/0/6/0');

  -- 1. the table and the function are closed ---------------------------------------------------
  PERFORM pg_temp.check_eq('authenticated and anon cannot read or write the log',
    pg_temp.as_user(a, $q$ SELECT count(*)::text FROM public.telegram_call_pings $q$) || '|' ||
    pg_temp.as_anon($q$ SELECT count(*)::text FROM public.telegram_call_pings $q$) || '|' ||
    pg_temp.as_user(a, $q$ INSERT INTO public.telegram_call_pings (enrolment_id, call_id) VALUES (gen_random_uuid(), gen_random_uuid()) RETURNING 'x' $q$),
    'ERR:42501|ERR:42501|ERR:42501');
  PERFORM pg_temp.check_eq('authenticated and anon cannot call the claim',
    pg_temp.as_user(a, pg_temp.claim_sql(names, t0)) || '|' || pg_temp.as_anon(pg_temp.claim_sql(names, t0)),
    'ERR:42501|ERR:42501');
  PERFORM pg_temp.check_eq('...service_role may (positive control for the denials above)',
    has_function_privilege('service_role', 'public.telegram_call_ping_claim(integer, timestamptz)', 'EXECUTE')::text || '|' ||
    has_function_privilege('authenticated', 'public.telegram_call_ping_claim(integer, timestamptz)', 'EXECUTE')::text,
    'true|false');
  PERFORM pg_temp.check_eq('claiming wrote nothing yet', (SELECT count(*)::text FROM telegram_call_pings), '0');

  -- 2. who is told about which call (the first cron run) ----------------------------------------
  -- a: A1 (+10 h) and A2 (+24 h 30 min, beyond 24 h but inside the 25 h window); NOT A0 (already
  -- started) or A3 (+25 h 30 min); NOT run B's call. g: only run B's call. Everyone else: a reason.
  PERFORM pg_temp.check_eq('t0: a gets A1 and A2 (run A only), g gets B1 (run B only); b revoked, c stopped, d never linked, e basic, f draft course get nothing',
    pg_temp.as_service(pg_temp.claim_sql(names, t0)), 'a:A1,a:A2,g:B1');
  PERFORM pg_temp.check_eq('...three log rows, none for A0, A3 or D1',
    (SELECT count(*)::text FROM telegram_call_pings) || '|' ||
    (SELECT count(*)::text FROM telegram_call_pings WHERE call_id IN (kA0, kA3, kD1)), '3|0');
  PERFORM pg_temp.check_eq('a second cron run at the same clock sends nothing new; still three log rows',
    pg_temp.as_service(pg_temp.claim_sql(names, t0)) || '|' || (SELECT count(*)::text FROM telegram_call_pings), '-|3');

  -- 2b. the same rows, read once more through a probe: the columns the text needs -------------------
  BEGIN
    DELETE FROM telegram_call_pings;
    r := pg_temp.as_service(pg_temp.claim_sql(names, t0,
      $e$ || ':' || x.lang || ':' || coalesce(x.time_zone, '-') || ':' || x.meet_url || ':' || x.course_slug || ':' || x.course_title $e$));
    RAISE EXCEPTION 'probe_done' USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    NULL;
  END;
  PERFORM pg_temp.check_eq('probe (rolled back, log cleared in it): every column the text needs is returned',
    r, 'a:A1:ru:Europe/Belgrade:https://meet.test/a1:v100-c:Verify Course,'
    || 'a:A2:ru:Europe/Belgrade:https://meet.test/a2:v100-c:Verify Course,'
    || 'g:B1:en:Asia/Tokyo:https://meet.test/b1:v100-c:Verify Course');
  PERFORM pg_temp.check_eq('...and the probe rolled the log back: still three rows',
    (SELECT count(*)::text FROM telegram_call_pings), '3');

  -- 3. 058's rule agrees: what a learner sees through course_calls is what the claim announces -----
  PERFORM pg_temp.check_eq('course_calls for a (run A, extended) lists A0..A3 and no other run''s call',
    pg_temp.as_user(a, format($q$ SELECT string_agg(title, ',' ORDER BY starts_at) FROM public.course_calls(%L) $q$, v_c)),
    'A0,A1,A2,A3');
  PERFORM pg_temp.check_eq('course_calls for g lists only run B''s call (so the claim''s B1 for g is within it)',
    pg_temp.as_user(g, format($q$ SELECT string_agg(title, ',' ORDER BY starts_at) FROM public.course_calls(%L) $q$, v_c)), 'B1');
  PERFORM pg_temp.check_eq('course_calls for the learners left out (revoked b, basic e): nothing',
    pg_temp.as_user(b, format($q$ SELECT count(*)::text FROM public.course_calls(%L) $q$, v_c)) || '|' ||
    pg_temp.as_user(e, format($q$ SELECT count(*)::text FROM public.course_calls(%L) $q$, v_c)), '0|0');

  -- 4. each exclusion removed on its own: the learner is claimed -----------------------------------
  -- a revocation is final (058); re-enrolling adds a new row (0093 c)
  INSERT INTO run_enrolments (run_id, user_id, tier, enrolled_at) VALUES (v_runA, b, 'extended', t0 - interval '5 days');
  PERFORM pg_temp.check_eq('b re-enrolled (a new row): b gets A1 and A2, and course_calls agrees',
    pg_temp.as_service(pg_temp.claim_sql(names, t0)) || '|' ||
    pg_temp.as_user(b, format($q$ SELECT string_agg(title, ',' ORDER BY starts_at) FROM public.course_calls(%L) WHERE starts_at > %L AND starts_at <= %L $q$, v_c, t0, t0 + interval '25 hours')),
    'b:A1,b:A2|A1,A2');
  UPDATE telegram_links SET stopped_at = NULL WHERE user_id = c;
  PERFORM pg_temp.check_eq('c''s link restarted: c gets A1 and A2',
    pg_temp.as_service(pg_temp.claim_sql(names, t0)), 'c:A1,c:A2');
  INSERT INTO telegram_links (user_id, chat_id, lang, linked_at) VALUES (d, 9910004, 'en', t0 - interval '5 days');
  PERFORM pg_temp.check_eq('d linked: d gets A1 and A2',
    pg_temp.as_service(pg_temp.claim_sql(names, t0)), 'd:A1,d:A2');
  UPDATE run_enrolments SET tier = 'extended' WHERE id = ee;
  PERFORM pg_temp.check_eq('e moved to extended: e gets A1 and A2, and course_calls now lists run A''s calls for e',
    pg_temp.as_service(pg_temp.claim_sql(names, t0)) || '|' ||
    pg_temp.as_user(e, format($q$ SELECT count(*)::text FROM public.course_calls(%L) $q$, v_c)),
    'e:A1,e:A2|4');
  UPDATE courses SET status = 'published' WHERE id = v_c2;
  PERFORM pg_temp.check_eq('f''s course published: f gets D1',
    pg_temp.as_service(pg_temp.claim_sql(names, t0)), 'f:D1');
  PERFORM pg_temp.check_eq('a final run at the same clock sends nothing; 2 per learner of A1 and A2 (a to e), B1, D1 = 12 rows',
    pg_temp.as_service(pg_temp.claim_sql(names, t0)) || '|' || (SELECT count(*)::text FROM telegram_call_pings), '-|12');

  -- 5. a later run: a call is announced when it comes into the window, never twice ---------------------
  -- t0+1 day: A1 and B1, D1 have started; A2 is still ahead but already announced; A3 (+25 h 30 min)
  -- is now 30 min away and new to everyone in run A.
  PERFORM pg_temp.check_eq('t0+1d: only A3 is new, to the five who are in run A and linked and extended (a, b, c, d, e)',
    pg_temp.as_service(pg_temp.claim_sql(names, t0 + interval '1 day')), 'a:A3,b:A3,c:A3,d:A3,e:A3');
  PERFORM pg_temp.check_eq('...and again at that clock: nothing',
    pg_temp.as_service(pg_temp.claim_sql(names, t0 + interval '1 day')), '-');

  -- 6. a moved call is not announced again; a new call is --------------------------------------------
  UPDATE run_calls SET starts_at = t0 + interval '3 days' WHERE id = kA1;
  INSERT INTO run_calls (run_id, starts_at, meet_url, title) VALUES (v_runA, t0 + interval '3 days', 'https://meet.test/a4', 'A4') RETURNING id INTO kA4;
  PERFORM pg_temp.check_eq('A1 moved to t0+3d (announced already) is skipped; A4, new at the same time, goes to a, b, c, d, e (positive control)',
    pg_temp.as_service(pg_temp.claim_sql(names, t0 + interval '3 days' - interval '2 hours')), 'a:A4,b:A4,c:A4,d:A4,e:A4');

  -- 7. the key is the enrolment and the call ----------------------------------------------------------
  PERFORM pg_temp.check_eq('a duplicate log row is refused by the primary key',
    pg_temp.as_role('postgres', NULL,
      format($q$ INSERT INTO public.telegram_call_pings (enrolment_id, call_id) VALUES (%L, %L) RETURNING 'x' $q$, ea, kA2)),
    'ERR:23505');
  PERFORM pg_temp.check_eq('a log row for a call that does not exist is refused',
    pg_temp.as_role('postgres', NULL,
      format($q$ INSERT INTO public.telegram_call_pings (enrolment_id, call_id) VALUES (%L, gen_random_uuid()) RETURNING 'x' $q$, ea)),
    'ERR:23503');

  -- 8. deleting a call or an account removes the logs ---------------------------------------------------
  SELECT count(*) INTO n_before FROM telegram_call_pings;
  PERFORM pg_temp.check_eq('seed: A4 has 5 log rows', (SELECT count(*)::text FROM telegram_call_pings WHERE call_id = kA4), '5');
  DELETE FROM run_calls WHERE id = kA4;
  PERFORM pg_temp.check_eq('deleting the call deletes its rows and no one else''s (positive control)',
    (SELECT count(*)::text FROM telegram_call_pings WHERE call_id = kA4) || '|' ||
    ((SELECT count(*) FROM telegram_call_pings) = n_before - 5)::text, '0|true');

  SELECT count(*) INTO n_before FROM telegram_call_pings;
  SELECT count(*) INTO n_e FROM telegram_call_pings WHERE enrolment_id = ee;
  PERFORM pg_temp.check_eq('seed: e has 3 log rows (A1, A2, A3)', n_e::text, '3');
  PERFORM pg_temp.check_eq('e deletes the account: ok',
    (pg_temp.as_user(e, $q$ SELECT public.delete_my_account()::text $q$)::jsonb)->>'ok', 'true');
  PERFORM pg_temp.check_eq('...e''s log rows are gone and nobody else''s changed (positive control)',
    (SELECT count(*) FROM telegram_call_pings WHERE enrolment_id = ee)::text || '|' ||
    ((SELECT count(*) FROM telegram_call_pings) = n_before - n_e)::text, '0|true');

  RAISE NOTICE 'COH-013 PASS';
END;
$$;

ROLLBACK;
