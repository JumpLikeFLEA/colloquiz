-- ============================================================
-- supabase/verify/082_author_seats.sql
--
-- TCH-007 full protocol for migration 082 (needs 029, 041, 067, 073, 076,
-- 080 applied). NOT a migration: run after 082 is applied, as postgres.
-- Seeds its own data and ROLLS BACK. A failed assertion aborts with
-- "TCH-007 FAIL: ...". Every denial is paired with a positive control: the
-- same call succeeding for the caller who should be able to make it.
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
    RAISE EXCEPTION 'TCH-007 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

-- SQL text builders. They run as postgres; the text they return runs as the
-- caller and touches only public and built-in names.
CREATE FUNCTION pg_temp.q(p_call TEXT, p_key TEXT)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT format('SELECT (%s)->>%L', p_call, p_key)
$$;

DO $$
DECLARE
  a  UUID := gen_random_uuid();   -- admin, no seat
  p  UUID := gen_random_uuid();   -- plain user: no seat, no editor row
  e  UUID := gen_random_uuid();   -- old-style editor: course_editors row, NO seat
  t  UUID := gen_random_uuid();   -- seated teacher, open-ended, no course yet
  tl UUID := gen_random_uuid();   -- seated teacher whose seat has lapsed
  tn UUID := gen_random_uuid();   -- target of add_author_seat by email (blank display_name)
  tm UUID := gen_random_uuid();   -- target of add_author_seat, with a display_name
  td UUID := gen_random_uuid();   -- deleted account (deleted_at set)
  s1 UUID := gen_random_uuid();   -- students linked to t
  s2 UUID := gen_random_uuid();
  v_course UUID;
  v_n INTEGER;
  v_n2 INTEGER;
  v_res TEXT;
  v_exp TIMESTAMPTZ;
  v_exp2 TIMESTAMPTZ;
  v_unseeded_holders INTEGER;
  v_unseeded_unseated INTEGER;
  v_long TEXT := repeat('x', 1001);
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (a,  'authenticated', 'authenticated', 'a-'  || a  || '@verify.test'),
    (p,  'authenticated', 'authenticated', 'p-'  || p  || '@verify.test'),
    (e,  'authenticated', 'authenticated', 'e-'  || e  || '@verify.test'),
    (t,  'authenticated', 'authenticated', 't-'  || t  || '@verify.test'),
    (tl, 'authenticated', 'authenticated', 'tl-' || tl || '@verify.test'),
    (tn, 'authenticated', 'authenticated', 'tn-' || tn || '@Verify.Test'),
    (tm, 'authenticated', 'authenticated', 'tm-' || tm || '@verify.test'),
    (td, 'authenticated', 'authenticated', 'td-' || td || '@verify.test'),
    (s1, 'authenticated', 'authenticated', 's1-' || s1 || '@verify.test'),
    (s2, 'authenticated', 'authenticated', 's2-' || s2 || '@verify.test');
  UPDATE profiles SET role = 'admin' WHERE id = a;
  UPDATE profiles SET display_name = '   ' WHERE id = tn;
  UPDATE profiles SET display_name = 'Handle TM', full_name = 'Real Name TM' WHERE id = tm;
  UPDATE profiles SET deleted_at = now() WHERE id = td;

  -- The backfill ran when 082 was applied, before this script. Its evidence:
  -- every non-deleted course_editors holder that this script did NOT seed has
  -- a seat, and there are such holders (an empty set would prove nothing).
  SELECT count(DISTINCT ce.user_id) INTO v_unseeded_holders
    FROM course_editors ce JOIN profiles pr ON pr.id = ce.user_id
   WHERE pr.deleted_at IS NULL;
  PERFORM pg_temp.check_eq('backfill: there are course_editors holders to check (guards an empty set)',
    (v_unseeded_holders > 0)::text, 'true');
  SELECT count(DISTINCT ce.user_id) INTO v_unseeded_unseated
    FROM course_editors ce JOIN profiles pr ON pr.id = ce.user_id
   WHERE pr.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM author_seats s WHERE s.user_id = ce.user_id);
  PERFORM pg_temp.check_eq('backfill: every existing editor holds a seat', v_unseeded_unseated::text, '0');
  PERFORM pg_temp.check_eq('backfill: those seats are open-ended teacher seats',
    (SELECT count(*)::text FROM author_seats s
      WHERE s.user_id IN (SELECT user_id FROM course_editors)
        AND (s.kind <> 'teacher' OR s.expires_at IS NOT NULL)), '0');

  -- Seed: an old-style editor with no seat (a co-editor an admin granted later),
  -- a seated open-ended teacher, a seated teacher whose seat has lapsed.
  INSERT INTO courses (slug, title, level, status) VALUES ('v82-e', 'Editor course', 'A2', 'draft')
    RETURNING id INTO v_course;
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES (v_course, e, a);
  INSERT INTO author_seats (user_id, kind, public_name, expires_at, notes, granted_by) VALUES
    (t,  'teacher', 'Seat T',  NULL,                          'private note T', a),
    (tl, 'teacher', 'Seat TL', now() - interval '3 days',     NULL,             a);
  INSERT INTO teacher_student_links (teacher_id, student_id, source) VALUES (t, s1, 'join_link'), (t, s2, 'join_link');
  UPDATE teacher_student_links SET ended_at = now(), ended_by = t WHERE teacher_id = t AND student_id = s2;

  -- 1. Table privileges ---------------------------------------------------
  PERFORM pg_temp.check_eq('authenticated has no SELECT on author_seats',
    has_table_privilege('authenticated', 'public.author_seats', 'SELECT')::text, 'false');
  PERFORM pg_temp.check_eq('authenticated has no INSERT on author_seats',
    has_table_privilege('authenticated', 'public.author_seats', 'INSERT')::text, 'false');
  PERFORM pg_temp.check_eq('authenticated has no UPDATE on author_seats',
    has_table_privilege('authenticated', 'public.author_seats', 'UPDATE')::text, 'false');
  PERFORM pg_temp.check_eq('authenticated has no DELETE on author_seats',
    has_table_privilege('authenticated', 'public.author_seats', 'DELETE')::text, 'false');
  PERFORM pg_temp.check_eq('anon has no SELECT on author_seats',
    has_table_privilege('anon', 'public.author_seats', 'SELECT')::text, 'false');
  PERFORM pg_temp.check_eq('a direct SELECT as a seated teacher is refused (permission denied)',
    pg_temp.as_user(t, 'SELECT count(*)::text FROM public.author_seats'), 'ERR:42501');
  PERFORM pg_temp.check_eq('a direct SELECT as the admin is refused too: only the functions read',
    pg_temp.as_user(a, 'SELECT count(*)::text FROM public.author_seats'), 'ERR:42501');
  PERFORM pg_temp.check_eq('RLS is on', (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.author_seats'::regclass), 'true');
  PERFORM pg_temp.check_eq('anon cannot call author_seats_list',
    has_function_privilege('anon', 'public.author_seats_list()', 'EXECUTE')::text, 'false');
  PERFORM pg_temp.check_eq('anon cannot call add_author_seat',
    has_function_privilege('anon', 'public.add_author_seat(text,text,timestamptz,text)', 'EXECUTE')::text, 'false');
  PERFORM pg_temp.check_eq('anon cannot call has_author_seat',
    has_function_privilege('anon', 'public.has_author_seat()', 'EXECUTE')::text, 'false');
  PERFORM pg_temp.check_eq('anon cannot call my_author_seat_export',
    has_function_privilege('anon', 'public.my_author_seat_export()', 'EXECUTE')::text, 'false');
  PERFORM pg_temp.check_eq('authenticated cannot call the internal _author_seat_active',
    has_function_privilege('authenticated', 'public._author_seat_active(uuid)', 'EXECUTE')::text, 'false');
  PERFORM pg_temp.check_eq('authenticated can call author_seats_list (positive control: the gate is inside)',
    has_function_privilege('authenticated', 'public.author_seats_list()', 'EXECUTE')::text, 'true');

  -- 2. A non-admin cannot read seats --------------------------------------
  PERFORM pg_temp.check_eq('a plain user cannot list seats',
    pg_temp.as_user(p, 'SELECT count(*)::text FROM public.author_seats_list()'), 'ERR:42501');
  PERFORM pg_temp.check_eq('a seated teacher cannot list seats',
    pg_temp.as_user(t, 'SELECT count(*)::text FROM public.author_seats_list()'), 'ERR:42501');
  PERFORM pg_temp.check_eq('an old-style editor cannot list seats',
    pg_temp.as_user(e, 'SELECT count(*)::text FROM public.author_seats_list()'), 'ERR:42501');
  PERFORM pg_temp.check_eq('anon cannot list seats',
    pg_temp.as_anon('SELECT count(*)::text FROM public.author_seats_list()'), 'ERR:42501');
  v_n := (pg_temp.as_user(a, 'SELECT count(*)::text FROM public.author_seats_list()'))::INTEGER;
  PERFORM pg_temp.check_eq('the admin lists every seat (positive control: matches the table)',
    v_n::text, (SELECT count(*)::text FROM author_seats));
  PERFORM pg_temp.check_eq('...and there are at least the two seeded seats', (v_n >= 2)::text, 'true');

  -- 3. A non-admin cannot change seats ------------------------------------
  PERFORM pg_temp.check_eq('plain user: add_author_seat forbidden',
    pg_temp.as_user(p, pg_temp.q(format('public.add_author_seat(%L)', 'tm-' || tm || '@verify.test'), 'error')), 'forbidden');
  PERFORM pg_temp.check_eq('seated teacher: add_author_seat forbidden',
    pg_temp.as_user(t, pg_temp.q(format('public.add_author_seat(%L)', 'tm-' || tm || '@verify.test'), 'error')), 'forbidden');
  PERFORM pg_temp.check_eq('seated teacher: update own seat forbidden',
    pg_temp.as_user(t, pg_temp.q(format('public.update_author_seat(%L, %L, %L)', t, 'Hijack', 'x'), 'error')), 'forbidden');
  PERFORM pg_temp.check_eq('seated teacher: extend own seat forbidden',
    pg_temp.as_user(tl, pg_temp.q(format('public.set_author_seat_expiry(%L, now() + interval ''30 days'')', tl), 'error')), 'forbidden');
  PERFORM pg_temp.check_eq('seated teacher: freeze another seat forbidden',
    pg_temp.as_user(tl, pg_temp.q(format('public.freeze_author_seat(%L)', t), 'error')), 'forbidden');
  PERFORM pg_temp.check_eq('seated teacher: make self house forbidden',
    pg_temp.as_user(t, pg_temp.q(format('public.set_author_seat_kind(%L, %L)', t, 'house'), 'error')), 'forbidden');
  PERFORM pg_temp.check_eq('anon: add_author_seat refused',
    pg_temp.as_anon(pg_temp.q(format('public.add_author_seat(%L)', 'tm-' || tm || '@verify.test'), 'error')), 'ERR:42501');
  PERFORM pg_temp.check_eq('...no seat was added, renamed, extended, frozen or re-kinded',
    (SELECT count(*)::text FROM author_seats
      WHERE (user_id = tm) OR (user_id = t AND (public_name <> 'Seat T' OR expires_at IS NOT NULL OR kind <> 'teacher'))
         OR (user_id = tl AND expires_at > now())), '0');

  -- positive controls: the admin makes the same calls
  PERFORM pg_temp.check_eq('admin: update_author_seat ok (positive control for the denial above)',
    pg_temp.as_user(a, pg_temp.q(format('public.update_author_seat(%L, %L, %L)', t, 'Seat T renamed', 'new note'), 'ok')), 'true');
  PERFORM pg_temp.check_eq('...the rename landed',
    (SELECT public_name || '|' || notes FROM author_seats WHERE user_id = t), 'Seat T renamed|new note');

  -- 4. add_author_seat ----------------------------------------------------
  PERFORM pg_temp.check_eq('add: blank email',
    pg_temp.as_user(a, pg_temp.q('public.add_author_seat(''   '')', 'error')), 'invalid_email');
  PERFORM pg_temp.check_eq('add: unknown email',
    pg_temp.as_user(a, pg_temp.q('public.add_author_seat(''nobody@verify.test'')', 'error')), 'user_not_found');
  PERFORM pg_temp.check_eq('add: a deleted account is not found',
    pg_temp.as_user(a, pg_temp.q(format('public.add_author_seat(%L)', 'td-' || td || '@verify.test'), 'error')), 'user_not_found');
  PERFORM pg_temp.check_eq('add: already seated',
    pg_temp.as_user(a, pg_temp.q(format('public.add_author_seat(%L)', 't-' || t || '@verify.test'), 'error')), 'already_seated');
  PERFORM pg_temp.check_eq('add: expiry in the past',
    pg_temp.as_user(a, pg_temp.q(format('public.add_author_seat(%L, %L, now() - interval ''1 day'')', 'tm-' || tm || '@verify.test', 'N'), 'error')), 'expiry_in_past');
  PERFORM pg_temp.check_eq('add: notes over 1,000 characters',
    pg_temp.as_user(a, pg_temp.q(format('public.add_author_seat(%L, %L, NULL, %L)', 'tm-' || tm || '@verify.test', 'N', v_long), 'error')), 'invalid_notes');
  PERFORM pg_temp.check_eq('add: no name and no display_name',
    pg_temp.as_user(a, pg_temp.q(format('public.add_author_seat(%L)', 'tn-' || tn || '@verify.test'), 'error')), 'invalid_name');
  PERFORM pg_temp.check_eq('add: a name over 80 characters',
    pg_temp.as_user(a, pg_temp.q(format('public.add_author_seat(%L, %L)', 'tm-' || tm || '@verify.test', repeat('n', 81)), 'error')), 'invalid_name');
  PERFORM pg_temp.check_eq('...none of the refused adds created a seat',
    (SELECT count(*)::text FROM author_seats WHERE user_id IN (tm, tn, td)), '0');
  -- the email match ignores case and surrounding space (tn's email has "Verify.Test")
  PERFORM pg_temp.check_eq('add: matched case-insensitively, with the given name, expiry and notes',
    pg_temp.as_user(a, pg_temp.q(format('public.add_author_seat(%L, %L, now() + interval ''30 days'', %L)',
      '  ' || upper('tn-' || tn || '@verify.test') || ' ', 'Seat TN', 'a note'), 'ok')), 'true');
  PERFORM pg_temp.check_eq('...stored as a teacher seat granted by the admin',
    (SELECT kind || '|' || public_name || '|' || notes || '|' || (granted_by = a)::text || '|' || (expires_at > now())::text
       FROM author_seats WHERE user_id = tn), 'teacher|Seat TN|a note|true|true');
  PERFORM pg_temp.check_eq('add: a blank name falls back to display_name, never full_name',
    pg_temp.as_user(a, pg_temp.q(format('public.add_author_seat(%L)', 'tm-' || tm || '@verify.test'), 'ok')), 'true');
  PERFORM pg_temp.check_eq('...Handle TM, open-ended',
    (SELECT public_name || '|' || (expires_at IS NULL)::text FROM author_seats WHERE user_id = tm), 'Handle TM|true');

  -- 5. Expiry, freeze, kind -----------------------------------------------
  PERFORM pg_temp.check_eq('expiry in the past is refused (use freeze)',
    pg_temp.as_user(a, pg_temp.q(format('public.set_author_seat_expiry(%L, now() - interval ''1 hour'')', t), 'error')), 'expiry_in_past');
  PERFORM pg_temp.check_eq('...and left the seat open-ended',
    (SELECT (expires_at IS NULL)::text FROM author_seats WHERE user_id = t), 'true');
  PERFORM pg_temp.check_eq('set a future expiry',
    pg_temp.as_user(a, pg_temp.q(format('public.set_author_seat_expiry(%L, now() + interval ''10 days'')', t), 'ok')), 'true');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  PERFORM pg_temp.check_eq('...active, 10 days left in the list',
    (SELECT is_active::text || '|' || days_left::text FROM author_seats_list() WHERE user_id = t), 'true|10');
  PERFORM pg_temp.check_eq('NULL makes it open-ended again',
    pg_temp.as_user(a, pg_temp.q(format('public.set_author_seat_expiry(%L, NULL)', t), 'ok')), 'true');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  PERFORM pg_temp.check_eq('...no days left to show',
    (SELECT (days_left IS NULL)::text || '|' || is_active::text FROM author_seats_list() WHERE user_id = t), 'true|true');
  PERFORM pg_temp.check_eq('freeze now',
    pg_temp.as_user(a, pg_temp.q(format('public.freeze_author_seat(%L)', t), 'ok')), 'true');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  PERFORM pg_temp.check_eq('...the seat is no longer active',
    (SELECT is_active::text FROM author_seats_list() WHERE user_id = t), 'false');
  SELECT expires_at INTO v_exp FROM author_seats WHERE user_id = t;
  PERFORM pg_temp.check_eq('...its expiry is now (within a minute)',
    (v_exp <= now() AND v_exp > now() - interval '1 minute')::text, 'true');
  PERFORM pg_temp.check_eq('freezing a lapsed seat again is ok...',
    pg_temp.as_user(a, pg_temp.q(format('public.freeze_author_seat(%L)', tl), 'ok')), 'true');
  PERFORM pg_temp.check_eq('...and keeps the earlier lapse date (3 days ago, not now)',
    (SELECT (expires_at < now() - interval '2 days')::text FROM author_seats WHERE user_id = tl), 'true');
  PERFORM pg_temp.check_eq('extend a lapsed seat',
    pg_temp.as_user(a, pg_temp.q(format('public.set_author_seat_expiry(%L, now() + interval ''90 days'')', t), 'ok')), 'true');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  PERFORM pg_temp.check_eq('...it is active again',
    (SELECT is_active::text FROM author_seats_list() WHERE user_id = t), 'true');
  PERFORM pg_temp.check_eq('set_author_seat_expiry on an unknown user',
    pg_temp.as_user(a, pg_temp.q(format('public.set_author_seat_expiry(%L, NULL)', gen_random_uuid()), 'error')), 'seat_not_found');
  PERFORM pg_temp.check_eq('freeze on an unknown user',
    pg_temp.as_user(a, pg_temp.q(format('public.freeze_author_seat(%L)', gen_random_uuid()), 'error')), 'seat_not_found');
  PERFORM pg_temp.check_eq('update on an unknown user',
    pg_temp.as_user(a, pg_temp.q(format('public.update_author_seat(%L, %L, NULL)', gen_random_uuid(), 'N'), 'error')), 'seat_not_found');
  PERFORM pg_temp.check_eq('update: blank name',
    pg_temp.as_user(a, pg_temp.q(format('public.update_author_seat(%L, %L, NULL)', t, '  '), 'error')), 'invalid_name');
  PERFORM pg_temp.check_eq('update: notes over 1,000',
    pg_temp.as_user(a, pg_temp.q(format('public.update_author_seat(%L, %L, %L)', t, 'N', v_long), 'error')), 'invalid_notes');
  PERFORM pg_temp.check_eq('update: empty notes are stored as NULL',
    pg_temp.as_user(a, pg_temp.q(format('public.update_author_seat(%L, %L, %L)', t, 'Seat T', '   '), 'ok')), 'true');
  PERFORM pg_temp.check_eq('...NULL', (SELECT (notes IS NULL)::text FROM author_seats WHERE user_id = t), 'true');

  PERFORM pg_temp.check_eq('mark the house seat',
    pg_temp.as_user(a, pg_temp.q(format('public.set_author_seat_kind(%L, %L)', tm, 'house'), 'ok')), 'true');
  PERFORM pg_temp.check_eq('set_author_seat_kind: invalid kind',
    pg_temp.as_user(a, pg_temp.q(format('public.set_author_seat_kind(%L, %L)', tm, 'owner'), 'error')), 'invalid_kind');
  PERFORM pg_temp.check_eq('set_author_seat_kind: unknown user',
    pg_temp.as_user(a, pg_temp.q(format('public.set_author_seat_kind(%L, %L)', gen_random_uuid(), 'house'), 'error')), 'seat_not_found');
  PERFORM pg_temp.check_eq('the table CHECK refuses a kind of its own',
    (SELECT (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.author_seats'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%house%teacher%')::text), '1');

  -- 6. The list: contact, counts, order -----------------------------------
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES (v_course, t, a);
  INSERT INTO courses (slug, title, level, status, author_id) VALUES ('v82-t', 'Authored by T', 'A2', 'draft', t);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  PERFORM pg_temp.check_eq('list: courses counts editor rows and authored courses once each (editor of 1, author of 1 = 2)',
    (SELECT courses::text FROM author_seats_list() WHERE user_id = t), '2');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  PERFORM pg_temp.check_eq('list: linked students count only the active link (positive control: 2 rows exist, 1 ended)',
    (SELECT linked_students::text || '/' || (SELECT count(*) FROM teacher_student_links WHERE teacher_id = t)::text
       FROM author_seats_list() WHERE user_id = t), '1/2');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  PERFORM pg_temp.check_eq('list: contact is the account email',
    (SELECT contact FROM author_seats_list() WHERE user_id = t), 't-' || t || '@verify.test');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  PERFORM pg_temp.check_eq('list: a lapsed seat is inactive with no days left',
    (SELECT is_active::text || '|' || (days_left <= 0)::text FROM author_seats_list() WHERE user_id = tl), 'false|true');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  PERFORM pg_temp.check_eq('list: the house seat comes first',
    (SELECT user_id::text FROM author_seats_list() LIMIT 1), tm::text);
  PERFORM pg_temp.check_eq('list: the notes are returned to the admin',
    pg_temp.as_user(a, format('SELECT notes FROM public.author_seats_list() WHERE user_id = %L', tn)), 'a note');

  -- 7. create_course --------------------------------------------------------
  v_n := (SELECT count(*) FROM courses);
  PERFORM pg_temp.check_eq('create_course: no seat, no editor row -> forbidden',
    pg_temp.as_user(p, pg_temp.q($q$public.create_course('v82-p', 'P course', 'A2')$q$, 'error')), 'forbidden');
  PERFORM pg_temp.check_eq('create_course: an editor of a course WITHOUT a seat -> forbidden (the behaviour change from 067)',
    pg_temp.as_user(e, pg_temp.q($q$public.create_course('v82-e2', 'E course 2', 'A2')$q$, 'error')), 'forbidden');
  PERFORM pg_temp.check_eq('create_course: anon refused',
    pg_temp.as_anon(pg_temp.q($q$public.create_course('v82-anon', 'Anon', 'A2')$q$, 'error')), 'ERR:42501');
  PERFORM pg_temp.check_eq('...none of the refused calls created a course',
    ((SELECT count(*) FROM courses) = v_n)::text, 'true');
  PERFORM pg_temp.check_eq('create_course: a lapsed seat -> seat_lapsed',
    pg_temp.as_user(tl, pg_temp.q($q$public.create_course('v82-tl', 'TL course', 'A2')$q$, 'error')), 'seat_lapsed');
  PERFORM pg_temp.check_eq('...no course for the lapsed seat',
    (SELECT count(*)::text FROM courses WHERE slug = 'v82-tl'), '0');
  PERFORM pg_temp.check_eq('create_course: a seat that expires in the future -> ok (positive control)',
    pg_temp.as_user(t, pg_temp.q($q$public.create_course('v82-t2', 'T course 2', 'A2')$q$, 'ok')), 'true');
  PERFORM pg_temp.check_eq('...the creator became its editor and author',
    (SELECT (SELECT count(*) FROM course_editors ce WHERE ce.course_id = c.id AND ce.user_id = t)::text || '|' || (c.author_id = t)::text
       FROM courses c WHERE c.slug = 'v82-t2'), '1|true');
  PERFORM pg_temp.check_eq('create_course: an open-ended seat -> ok (positive control)',
    pg_temp.as_user(tm, pg_temp.q($q$public.create_course('v82-tm', 'TM course', 'A2')$q$, 'ok')), 'true');
  PERFORM pg_temp.check_eq('create_course: the admin without a seat -> ok, and no editor row',
    pg_temp.as_user(a, pg_temp.q($q$public.create_course('v82-a', 'A course', 'A2')$q$, 'ok')), 'true');
  PERFORM pg_temp.check_eq('...no editor row for the admin',
    (SELECT count(*)::text FROM course_editors ce JOIN courses c ON c.id = ce.course_id WHERE c.slug = 'v82-a'), '0');
  -- the rest of the function is unchanged: its own refusals still fire
  PERFORM pg_temp.check_eq('create_course: invalid slug still refused for a seated teacher',
    pg_temp.as_user(t, pg_temp.q($q$public.create_course('Bad Slug', 'x', 'A2')$q$, 'error')), 'invalid_slug');
  PERFORM pg_temp.check_eq('create_course: slug taken still refused',
    pg_temp.as_user(t, pg_temp.q($q$public.create_course('v82-t2', 'x', 'A2')$q$, 'error')), 'slug_taken');
  PERFORM pg_temp.check_eq('create_course: invalid level still refused',
    pg_temp.as_user(t, pg_temp.q($q$public.create_course('v82-lv', 'x', 'Z9')$q$, 'error')), 'invalid_level');
  -- a freeze takes effect on the very next call, an extension too
  PERFORM pg_temp.check_eq('freeze the seat that just created a course',
    pg_temp.as_user(a, pg_temp.q(format('public.freeze_author_seat(%L)', tm), 'ok')), 'true');
  PERFORM pg_temp.check_eq('...the next create_course is seat_lapsed',
    pg_temp.as_user(tm, pg_temp.q($q$public.create_course('v82-tm2', 'TM 2', 'A2')$q$, 'error')), 'seat_lapsed');
  PERFORM pg_temp.check_eq('...extend it and create_course works again (positive control)',
    pg_temp.as_user(a, pg_temp.q(format('public.set_author_seat_expiry(%L, NULL)', tm), 'ok')), 'true');
  PERFORM pg_temp.check_eq('...ok',
    pg_temp.as_user(tm, pg_temp.q($q$public.create_course('v82-tm3', 'TM 3', 'A2')$q$, 'ok')), 'true');

  -- 8. has_author_seat and _is_teacher --------------------------------------
  PERFORM pg_temp.check_eq('has_author_seat: seated -> true',
    pg_temp.as_user(t, 'SELECT public.has_author_seat()::text'), 'true');
  PERFORM pg_temp.check_eq('has_author_seat: a lapsed seat still counts -> true',
    pg_temp.as_user(tl, 'SELECT public.has_author_seat()::text'), 'true');
  PERFORM pg_temp.check_eq('has_author_seat: plain user -> false',
    pg_temp.as_user(p, 'SELECT public.has_author_seat()::text'), 'false');
  PERFORM pg_temp.check_eq('has_author_seat: an editor without a seat -> false',
    pg_temp.as_user(e, 'SELECT public.has_author_seat()::text'), 'false');
  PERFORM pg_temp.check_eq('anon: has_author_seat refused',
    pg_temp.as_anon('SELECT public.has_author_seat()::text'), 'ERR:42501');
  PERFORM pg_temp.check_eq('_is_teacher: a seated user with no editor row is a teacher',
    public._is_teacher(tl)::text, 'true');
  PERFORM pg_temp.check_eq('_is_teacher: an editor without a seat still is (nothing narrowed)',
    public._is_teacher(e)::text, 'true');
  PERFORM pg_temp.check_eq('_is_teacher: the admin still is',
    public._is_teacher(a)::text, 'true');
  PERFORM pg_temp.check_eq('_is_teacher: a plain user is not (negative control)',
    public._is_teacher(p)::text, 'false');
  PERFORM pg_temp.check_eq('_is_teacher: NULL is not',
    COALESCE(public._is_teacher(NULL)::text, 'null'), 'false');
  PERFORM pg_temp.check_eq('a seated user with no course mints a student link (the widened path, positive control)',
    (pg_temp.as_user(t, 'SELECT (public.rotate_teacher_join_token())->>''ok''')), 'true');
  -- TCH-008 (083): this cell used tl, whose seat has lapsed. A lapsed seat is still a
  -- teacher (the cell above) but 083 freezes the rotation; its refusal is in
  -- supabase/verify/083_seat_freeze.sql.
  PERFORM pg_temp.check_eq('...a plain user still cannot (denial)',
    (pg_temp.as_user(p, 'SELECT (public.rotate_teacher_join_token())->>''error''')), 'forbidden');

  -- 9. Export ---------------------------------------------------------------
  PERFORM pg_temp.check_eq('export: a seated teacher gets exactly their own seat, with the notes',
    pg_temp.as_user(tn, 'SELECT count(*)::text || ''|'' || min(public_name) || ''|'' || min(notes) FROM public.my_author_seat_export()'), '1|Seat TN|a note');
  PERFORM pg_temp.check_eq('export: another seated teacher gets only theirs (not tn''s)',
    pg_temp.as_user(t, 'SELECT count(*)::text || ''|'' || min(public_name) FROM public.my_author_seat_export()'), '1|Seat T');
  PERFORM pg_temp.check_eq('export: a plain user gets no rows (negative control)',
    pg_temp.as_user(p, 'SELECT count(*)::text FROM public.my_author_seat_export()'), '0');

  -- 10. Deletion --------------------------------------------------------------
  PERFORM pg_temp.check_eq('delete_my_account by a seated teacher: ok',
    pg_temp.as_user(tn, 'SELECT (public.delete_my_account())->>''ok'''), 'true');
  PERFORM pg_temp.check_eq('...their seat, with the public name and notes, is gone',
    (SELECT count(*)::text FROM author_seats WHERE user_id = tn), '0');
  PERFORM pg_temp.check_eq('...the profile row is anonymised, not deleted',
    (SELECT (deleted_at IS NOT NULL)::text || '|' || display_name FROM profiles WHERE id = tn), 'true|Deleted user');
  PERFORM pg_temp.check_eq('...other seats are untouched (positive control)',
    (SELECT count(*)::text FROM author_seats WHERE user_id IN (t, tl, tm)), '3');
  PERFORM pg_temp.check_eq('delete_my_account by a user with no seat: ok',
    pg_temp.as_user(p, 'SELECT (public.delete_my_account())->>''ok'''), 'true');

  RAISE NOTICE 'TCH-007 PASS: 082 full protocol';
END;
$$;

ROLLBACK;
