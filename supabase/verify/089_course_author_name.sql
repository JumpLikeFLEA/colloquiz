-- ============================================================
-- supabase/verify/089_course_author_name.sql
--
-- TCH-011 full protocol for migration 089 (needs 028, 067, 082
-- applied). NOT a migration: run after 089 is applied, as postgres. Seeds its
-- own data and ROLLS BACK. A failed assertion aborts with "TCH-011 FAIL: ...".
-- Every denial is paired with a positive control proving the cell succeeds for
-- the caller who should; the seat table is shown to stay closed to anon and
-- authenticated.
-- ============================================================
BEGIN;

CREATE TEMP TABLE tally (cells INTEGER NOT NULL);
INSERT INTO tally VALUES (0);

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

CREATE FUNCTION pg_temp.try_user(p_user UUID, p_sql TEXT)
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

-- 'ok' | the error code
CREATE FUNCTION pg_temp.res(p_user UUID, p_call TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v JSONB;
BEGIN
  v := pg_temp.as_user(p_user, 'SELECT ' || p_call || '::text')::jsonb;
  RETURN CASE WHEN (v->>'ok') = 'true' THEN 'ok' ELSE v->>'error' END;
END;
$$;

CREATE FUNCTION pg_temp.check_eq(p_label TEXT, p_got TEXT, p_want TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE '% -> got % (want %)', p_label, p_got, p_want;
  UPDATE pg_temp.tally SET cells = cells + 1;
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'TCH-011 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

DO $$
DECLARE
  tt  UUID := gen_random_uuid();   -- teacher seat (kind teacher), authors T
  hh  UUID := gen_random_uuid();   -- house seat, authors H
  lp  UUID := gen_random_uuid();   -- lapsed teacher seat, authors L
  nn  UUID := gen_random_uuid();   -- no seat, authors N
  v_t UUID; v_h UUID; v_l UUID; v_n UUID; v_d UUID; v_x UUID;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (tt, 'authenticated', 'authenticated', 'tt-' || tt || '@verify.test'),
    (hh, 'authenticated', 'authenticated', 'hh-' || hh || '@verify.test'),
    (lp, 'authenticated', 'authenticated', 'lp-' || lp || '@verify.test'),
    (nn, 'authenticated', 'authenticated', 'nn-' || nn || '@verify.test');
  INSERT INTO author_seats (user_id, kind, public_name, expires_at) VALUES
    (tt, 'teacher', '  Ms Teacher  ', NULL),
    (hh, 'house',   'The House', NULL),
    (lp, 'teacher', 'Lapsed Lee', now() - interval '1 day');

  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url, author_id)
  VALUES ('v89-t', 'T', 'A2', 'published', 'self_paced', 's', 'c', tt) RETURNING id INTO v_t;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url, author_id)
  VALUES ('v89-h', 'H', 'A2', 'published', 'self_paced', 's', 'c', hh) RETURNING id INTO v_h;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url, author_id)
  VALUES ('v89-l', 'L', 'A2', 'published', 'self_paced', 's', 'c', lp) RETURNING id INTO v_l;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url, author_id)
  VALUES ('v89-n', 'N', 'A2', 'published', 'self_paced', 's', 'c', nn) RETURNING id INTO v_n;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url, author_id)
  VALUES ('v89-d', 'D', 'A2', 'draft', 'self_paced', 's', 'c', tt) RETURNING id INTO v_d;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v89-x', 'X', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO v_x;

  PERFORM pg_temp.check_eq('seed: 6 verify courses, 3 seats (the tables are not empty)',
    (SELECT count(*) FROM courses WHERE slug LIKE 'v89-%')::text || '/' ||
    (SELECT count(*) FROM author_seats WHERE user_id IN (tt, hh, lp))::text, '6/3');

  PERFORM pg_temp.check_eq('function: anon and authenticated can execute',
    (SELECT count(*)::text FROM pg_proc WHERE proname = 'course_author_name' AND pronamespace = 'public'::regnamespace
       AND has_function_privilege('anon', oid, 'EXECUTE') AND has_function_privilege('authenticated', oid, 'EXECUTE')), '1');
  PERFORM pg_temp.check_eq('anon: a teacher course returns the trimmed public name (positive control)',
    pg_temp.as_anon(format('SELECT public.course_author_name(%L)', v_t)), 'Ms Teacher');
  PERFORM pg_temp.check_eq('a signed-in learner gets the same',
    pg_temp.as_user(nn, format('SELECT public.course_author_name(%L)', v_t)), 'Ms Teacher');
  PERFORM pg_temp.check_eq('anon: a HOUSE seat''s course returns nothing',
    COALESCE(pg_temp.as_anon(format('SELECT public.course_author_name(%L)', v_h)), 'null'), 'null');
  PERFORM pg_temp.check_eq('anon: a course whose author has no seat returns nothing',
    COALESCE(pg_temp.as_anon(format('SELECT public.course_author_name(%L)', v_n)), 'null'), 'null');
  PERFORM pg_temp.check_eq('anon: a course with no author returns nothing',
    COALESCE(pg_temp.as_anon(format('SELECT public.course_author_name(%L)', v_x)), 'null'), 'null');
  PERFORM pg_temp.check_eq('anon: a DRAFT course returns nothing (the seat name does not leak early)',
    COALESCE(pg_temp.as_anon(format('SELECT public.course_author_name(%L)', v_d)), 'null'), 'null');
  PERFORM pg_temp.check_eq('anon: an unknown course returns nothing',
    COALESCE(pg_temp.as_anon(format('SELECT public.course_author_name(%L)', gen_random_uuid())), 'null'), 'null');
  PERFORM pg_temp.check_eq('anon: a LAPSED seat still names its course (authorship does not expire)',
    pg_temp.as_anon(format('SELECT public.course_author_name(%L)', v_l)), 'Lapsed Lee');

  -- The seat itself stays closed.
  PERFORM pg_temp.check_eq('anon: author_seats is still unreadable',
    pg_temp.as_anon('SELECT count(*)::text FROM public.author_seats'), 'ERR:42501');
  PERFORM pg_temp.check_eq('authenticated: author_seats is still unreadable',
    pg_temp.try_user(nn, 'SELECT count(*)::text FROM public.author_seats'), 'ERR:42501');

  RAISE NOTICE 'TCH-011 PASS: 089 full protocol (% asserted cells)', (SELECT cells FROM pg_temp.tally);
END;
$$;

ROLLBACK;
