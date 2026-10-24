-- ============================================================
-- supabase/verify/102_course_import_grant.sql
--
-- AUTH-021 full protocol for migration 102 (needs 082 applied). NOT a
-- migration: run after 102 is applied, as postgres. Seeds its own data and
-- ROLLS BACK. A failed assertion aborts with "AUTH-021 FAIL: ...". Every
-- denial is paired with a positive control: the same call succeeding for the
-- caller who should be able to make it.
-- ============================================================
BEGIN;

-- Runs p_sql as the user; returns its single text value, or 'ERR:<sqlstate>'.
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

CREATE FUNCTION pg_temp.check_eq(p_label TEXT, p_got TEXT, p_want TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE '% -> got % (want %)', p_label, p_got, p_want;
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'AUTH-021 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

DO $$
DECLARE
  a   UUID := gen_random_uuid();  -- admin, no seat
  p   UUID := gen_random_uuid();  -- plain user: no seat
  tg  UUID := gen_random_uuid();  -- seated, active (open-ended), granted
  tgs UUID := gen_random_uuid();  -- seated, active (expires in the future), granted
  tl  UUID := gen_random_uuid();  -- seated, LAPSED, granted
  tu  UUID := gen_random_uuid();  -- seated, active, NOT granted
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (a,   'authenticated', 'authenticated', 'a-'   || a   || '@verify.test'),
    (p,   'authenticated', 'authenticated', 'p-'   || p   || '@verify.test'),
    (tg,  'authenticated', 'authenticated', 'tg-'  || tg  || '@verify.test'),
    (tgs, 'authenticated', 'authenticated', 'tgs-' || tgs || '@verify.test'),
    (tl,  'authenticated', 'authenticated', 'tl-'  || tl  || '@verify.test'),
    (tu,  'authenticated', 'authenticated', 'tu-'  || tu  || '@verify.test');
  UPDATE profiles SET role = 'admin' WHERE id = a;

  INSERT INTO author_seats (user_id, kind, public_name, expires_at, granted_by) VALUES
    (tg,  'teacher', 'Seat TG',  NULL,                        a),
    (tgs, 'teacher', 'Seat TGS', now() + interval '30 days',  a),
    (tl,  'teacher', 'Seat TL',  now() - interval '3 days',   a),
    (tu,  'teacher', 'Seat TU',  NULL,                        a);

  -- 1. The column's default -------------------------------------------------
  PERFORM pg_temp.check_eq('a seat added without the grant has can_import = false',
    (SELECT can_import::text FROM author_seats WHERE user_id = tu), 'false');
  PERFORM pg_temp.check_eq('...and no seat anywhere has it before the admin grants it (guards an empty set)',
    (SELECT count(*)::text || '/' || count(*) FILTER (WHERE can_import)::text FROM author_seats
      WHERE user_id IN (tg, tgs, tl, tu)), '4/0');

  -- 2. Privileges -------------------------------------------------------------
  PERFORM pg_temp.check_eq('authenticated cannot call _can_import directly',
    has_function_privilege('authenticated', 'public._can_import(uuid)', 'EXECUTE')::text, 'false');
  PERFORM pg_temp.check_eq('anon cannot call _can_import directly',
    has_function_privilege('anon', 'public._can_import(uuid)', 'EXECUTE')::text, 'false');
  PERFORM pg_temp.check_eq('a direct _can_import call as an admin is refused (42501)',
    pg_temp.as_user(a, format('SELECT public._can_import(%L)::text', a)), 'ERR:42501');
  PERFORM pg_temp.check_eq('anon cannot call can_import_course',
    has_function_privilege('anon', 'public.can_import_course()', 'EXECUTE')::text, 'false');
  PERFORM pg_temp.check_eq('authenticated can call can_import_course (positive control)',
    has_function_privilege('authenticated', 'public.can_import_course()', 'EXECUTE')::text, 'true');
  PERFORM pg_temp.check_eq('anon cannot call set_author_seat_import',
    has_function_privilege('anon', 'public.set_author_seat_import(uuid, boolean)', 'EXECUTE')::text, 'false');
  PERFORM pg_temp.check_eq('authenticated can call set_author_seat_import (positive control: the gate is inside)',
    has_function_privilege('authenticated', 'public.set_author_seat_import(uuid, boolean)', 'EXECUTE')::text, 'true');
  PERFORM pg_temp.check_eq('authenticated has no UPDATE on author_seats (the column cannot be written directly)',
    has_table_privilege('authenticated', 'public.author_seats', 'UPDATE')::text, 'false');
  PERFORM pg_temp.check_eq('a direct UPDATE of can_import as the seated teacher is refused (42501)',
    pg_temp.as_user(tu, format('WITH u AS (UPDATE public.author_seats SET can_import = true WHERE user_id = %L RETURNING 1) SELECT count(*)::text FROM u', tu)),
    'ERR:42501');
  PERFORM pg_temp.check_eq('...and the row is still ungranted',
    (SELECT can_import::text FROM author_seats WHERE user_id = tu), 'false');

  -- 3. Who can set the grant ---------------------------------------------------
  PERFORM pg_temp.check_eq('a seated, ungranted teacher cannot grant themselves',
    pg_temp.as_user(tu, format('SELECT (public.set_author_seat_import(%L, true))->>''error''', tu)), 'forbidden');
  PERFORM pg_temp.check_eq('a plain user cannot set the grant',
    pg_temp.as_user(p, format('SELECT (public.set_author_seat_import(%L, true))->>''error''', tu)), 'forbidden');
  PERFORM pg_temp.check_eq('anon is refused outright (42501)',
    pg_temp.as_anon(format('SELECT (public.set_author_seat_import(%L, true))->>''error''', tu)), 'ERR:42501');
  PERFORM pg_temp.check_eq('...none of those changed the row',
    (SELECT can_import::text FROM author_seats WHERE user_id = tu), 'false');

  PERFORM pg_temp.check_eq('the admin grants tg (positive control)',
    pg_temp.as_user(a, format('SELECT (public.set_author_seat_import(%L, true))->>''ok''', tg)), 'true');
  PERFORM pg_temp.check_eq('...the row says so',
    (SELECT can_import::text FROM author_seats WHERE user_id = tg), 'true');
  PERFORM pg_temp.check_eq('a granted teacher still cannot grant a colleague (holding the grant is not admin)',
    pg_temp.as_user(tg, format('SELECT (public.set_author_seat_import(%L, true))->>''error''', tu)), 'forbidden');
  PERFORM pg_temp.check_eq('...tu is still ungranted',
    (SELECT can_import::text FROM author_seats WHERE user_id = tu), 'false');
  PERFORM pg_temp.check_eq('the admin grants tgs',
    pg_temp.as_user(a, format('SELECT (public.set_author_seat_import(%L, true))->>''ok''', tgs)), 'true');
  PERFORM pg_temp.check_eq('the admin grants tl (a lapsed seat can still hold the flag)',
    pg_temp.as_user(a, format('SELECT (public.set_author_seat_import(%L, true))->>''ok''', tl)), 'true');
  PERFORM pg_temp.check_eq('a grant for a user with no seat: seat_not_found',
    pg_temp.as_user(a, format('SELECT (public.set_author_seat_import(%L, true))->>''error''', p)), 'seat_not_found');
  PERFORM pg_temp.check_eq('a NULL value is refused: invalid_value',
    pg_temp.as_user(a, format('SELECT (public.set_author_seat_import(%L, NULL))->>''error''', tg)), 'invalid_value');
  PERFORM pg_temp.check_eq('...and left the row granted',
    (SELECT can_import::text FROM author_seats WHERE user_id = tg), 'true');
  PERFORM pg_temp.check_eq('...the untouched seat tu is still ungranted',
    (SELECT can_import::text FROM author_seats WHERE user_id = tu), 'false');

  -- 4. can_import_course() for each caller -------------------------------------
  PERFORM pg_temp.check_eq('admin without a seat: true',
    pg_temp.as_user(a, 'SELECT public.can_import_course()::text'), 'true');
  PERFORM pg_temp.check_eq('granted, active, open-ended seat: true',
    pg_temp.as_user(tg, 'SELECT public.can_import_course()::text'), 'true');
  PERFORM pg_temp.check_eq('granted, active seat expiring in the future: true',
    pg_temp.as_user(tgs, 'SELECT public.can_import_course()::text'), 'true');
  PERFORM pg_temp.check_eq('granted but LAPSED seat: false (the flag is still on, the seat is not)',
    pg_temp.as_user(tl, 'SELECT public.can_import_course()::text'), 'false');
  PERFORM pg_temp.check_eq('...the lapsed seat does hold the flag (so the false is the lapse, not a missing grant)',
    (SELECT can_import::text FROM author_seats WHERE user_id = tl), 'true');
  PERFORM pg_temp.check_eq('ungranted active seat: false',
    pg_temp.as_user(tu, 'SELECT public.can_import_course()::text'), 'false');
  PERFORM pg_temp.check_eq('plain user with no seat: false',
    pg_temp.as_user(p, 'SELECT public.can_import_course()::text'), 'false');
  PERFORM pg_temp.check_eq('anon: refused (42501)',
    pg_temp.as_anon('SELECT public.can_import_course()::text'), 'ERR:42501');

  -- 5. The grant lapses with the seat, and returns with it ---------------------
  PERFORM pg_temp.check_eq('freezing tg ends the seat',
    pg_temp.as_user(a, format('SELECT (public.freeze_author_seat(%L))->>''ok''', tg)), 'true');
  PERFORM pg_temp.check_eq('...so tg can no longer import',
    pg_temp.as_user(tg, 'SELECT public.can_import_course()::text'), 'false');
  PERFORM pg_temp.check_eq('extending the seat again',
    pg_temp.as_user(a, format('SELECT (public.set_author_seat_expiry(%L, NULL))->>''ok''', tg)), 'true');
  PERFORM pg_temp.check_eq('...gives the import back with no second grant (positive control)',
    pg_temp.as_user(tg, 'SELECT public.can_import_course()::text'), 'true');
  PERFORM pg_temp.check_eq('revoking the grant: ok',
    pg_temp.as_user(a, format('SELECT (public.set_author_seat_import(%L, false))->>''ok''', tg)), 'true');
  PERFORM pg_temp.check_eq('...tg can no longer import, though the seat is active',
    pg_temp.as_user(tg, 'SELECT public.can_import_course()::text'), 'false');
  PERFORM pg_temp.check_eq('...and nobody else''s grant moved (tgs still can)',
    pg_temp.as_user(tgs, 'SELECT public.can_import_course()::text'), 'true');

  -- 6. author_seats_list ------------------------------------------------------
  -- Ordered by public_name: Seat TG, Seat TGS, Seat TL, Seat TU. Run as the admin:
  -- the function raises for postgres, which has no auth.uid().
  PERFORM pg_temp.check_eq('the admin''s list carries can_import per seat (tg false, tgs true, tl true, tu false)',
    pg_temp.as_user(a, format(
      'SELECT string_agg(user_id::text || ''='' || can_import::text, '','' ORDER BY public_name) FROM public.author_seats_list() WHERE user_id IN (%L, %L, %L, %L)',
      tg, tgs, tl, tu)),
    tg || '=false,' || tgs || '=true,' || tl || '=true,' || tu || '=false');
  PERFORM pg_temp.check_eq('a seated teacher still cannot read the list (42501)',
    pg_temp.as_user(tgs, 'SELECT count(*)::text FROM public.author_seats_list()'), 'ERR:42501');
  PERFORM pg_temp.check_eq('anon still cannot call the list',
    has_function_privilege('anon', 'public.author_seats_list()', 'EXECUTE')::text, 'false');
  PERFORM pg_temp.check_eq('the admin can (positive control)',
    ((pg_temp.as_user(a, 'SELECT count(*)::text FROM public.author_seats_list()'))::INTEGER >= 4)::text, 'true');

  -- 7. Deleting the account removes the flag with the seat --------------------
  PERFORM pg_temp.check_eq('delete_my_account by a granted teacher: ok',
    pg_temp.as_user(tgs, 'SELECT (public.delete_my_account())->>''ok'''), 'true');
  PERFORM pg_temp.check_eq('...their seat, and so the grant, is gone',
    (SELECT count(*)::text FROM author_seats WHERE user_id = tgs), '0');
  PERFORM pg_temp.check_eq('...a deleted account cannot import',
    pg_temp.as_user(tgs, 'SELECT public.can_import_course()::text'), 'false');

  RAISE NOTICE 'AUTH-021 PASS: 102 full protocol';
END;
$$;

ROLLBACK;
