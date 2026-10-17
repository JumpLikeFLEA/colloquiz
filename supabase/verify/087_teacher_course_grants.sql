-- ============================================================
-- supabase/verify/087_teacher_course_grants.sql
--
-- TCH-009 full protocol for migration 087 (needs 041, 058, 076, 082, 083
-- applied). NOT a migration: run after 087 is applied, as postgres. Seeds its
-- own data and ROLLS BACK. A failed assertion aborts with "TCH-009 FAIL: ...".
-- Every denial is paired with a positive control proving the cell succeeds for
-- the caller who should; the "anonymous-path rows" (PLAY-006, docs/decisions/
-- 0056 Decision 4) are re-run at the start and the end.
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

-- As above, but a refusal comes back as 'ERR:<sqlstate>' instead of aborting.
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

-- 'ok' | the error code | 'ok:already'
CREATE FUNCTION pg_temp.res(p_user UUID, p_call TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v JSONB;
BEGIN
  v := pg_temp.as_user(p_user, 'SELECT ' || p_call || '::text')::jsonb;
  RETURN CASE WHEN (v->>'ok') = 'true' THEN 'ok' || CASE WHEN (v->>'already') = 'true' THEN ':already' ELSE '' END
              ELSE v->>'error' END;
END;
$$;

CREATE FUNCTION pg_temp.check_eq(p_label TEXT, p_got TEXT, p_want TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE '% -> got % (want %)', p_label, p_got, p_want;
  UPDATE pg_temp.tally SET cells = cells + 1;
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'TCH-009 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

DO $$
DECLARE
  t   UUID := gen_random_uuid();   -- teacher: edits E (self-paced) and C (cohort); linked to s, s2, sc, sr, sx
  t2  UUID := gen_random_uuid();   -- another teacher: edits E2, linked to nobody
  adm UUID := gen_random_uuid();   -- admin, no seat needed
  s   UUID := gen_random_uuid();   -- student linked to t
  s2  UUID := gen_random_uuid();   -- student linked to t, link ends during the run
  sc  UUID := gen_random_uuid();   -- linked, holds an ACTIVE purchase on E
  sr  UUID := gen_random_uuid();   -- linked, a purchase on E revoked (refund)
  sx  UUID := gen_random_uuid();   -- linked, never granted (the "not everyone" control)
  sa  UUID := gen_random_uuid();   -- linked, an ACTIVE admin grant (source_ref NULL) on E
  n   UUID := gen_random_uuid();   -- not linked to anyone
  v_e UUID; v_e2 UUID; v_c UUID;
  v_e0 UUID; v_e1 UUID; v_e21 UUID; v_c1 UUID;
  v_ve0 UUID; v_ve1 UUID; v_ve21 UUID; v_vc1 UUID;
  v_doc JSONB;
  v_before TEXT; v_after TEXT;
  v_pol INTEGER;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (t,   'authenticated', 'authenticated', 't-'   || t   || '@verify.test'),
    (t2,  'authenticated', 'authenticated', 't2-'  || t2  || '@verify.test'),
    (adm, 'authenticated', 'authenticated', 'adm-' || adm || '@verify.test'),
    (s,   'authenticated', 'authenticated', 's-'   || s   || '@verify.test'),
    (s2,  'authenticated', 'authenticated', 's2-'  || s2  || '@verify.test'),
    (sc,  'authenticated', 'authenticated', 'sc-'  || sc  || '@verify.test'),
    (sr,  'authenticated', 'authenticated', 'sr-'  || sr  || '@verify.test'),
    (sx,  'authenticated', 'authenticated', 'sx-'  || sx  || '@verify.test'),
    (sa,  'authenticated', 'authenticated', 'sa-'  || sa  || '@verify.test'),
    (n,   'authenticated', 'authenticated', 'n-'   || n   || '@verify.test');
  UPDATE profiles SET role = 'admin' WHERE id = adm;

  v_doc := jsonb_build_array(
    jsonb_build_object('id', 'th1', 'kind', 'theory', 'type', 'paragraph'),
    jsonb_build_object('id', 'ex1', 'kind', 'practice', 'type', 'selection',
      'payload', jsonb_build_object('prompt', 'Pick')));

  -- E: published self-paced, edited by t: one anyone lesson E0, one ENTITLED lesson E1.
  -- E2: published self-paced, edited by t2, one entitled lesson. C: cohort, edited by t.
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v87-e', 'E', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO v_e;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v87-e2', 'E2', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO v_e2;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v87-c', 'C', 'A2', 'draft', 'cohort', 's', 'c') RETURNING id INTO v_c;
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES
    (v_e, t, t), (v_c, t, t), (v_e2, t2, t2);
  INSERT INTO author_seats (user_id, kind, public_name)
  SELECT DISTINCT ce.user_id, 'teacher', 'Verify seat' FROM course_editors ce
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_e,  1, 'E0', 'e0', 'anyone')   RETURNING id INTO v_e0;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_e,  2, 'E1', 'e1', 'entitled') RETURNING id INTO v_e1;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_e2, 1, 'F1', 'f1', 'entitled') RETURNING id INTO v_e21;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_c,  1, 'C1', 'c1', 'entitled') RETURNING id INTO v_c1;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_e0,  v_doc, 'editor') RETURNING id INTO v_ve0;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_e1,  v_doc, 'editor') RETURNING id INTO v_ve1;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_e21, v_doc, 'editor') RETURNING id INTO v_ve21;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_c1,  v_doc, 'editor') RETURNING id INTO v_vc1;
  UPDATE lessons SET published_version_id = v_ve0  WHERE id = v_e0;
  UPDATE lessons SET published_version_id = v_ve1  WHERE id = v_e1;
  UPDATE lessons SET published_version_id = v_ve21 WHERE id = v_e21;
  UPDATE lessons SET published_version_id = v_vc1  WHERE id = v_c1;

  INSERT INTO teacher_student_links (teacher_id, student_id, source) VALUES
    (t, s, 'join_link'), (t, s2, 'join_link'), (t, sc, 'join_link'),
    (t, sr, 'join_link'), (t, sx, 'join_link'), (t, sa, 'join_link');
  INSERT INTO course_entitlements (user_id, course_id, source, source_ref) VALUES
    (sc, v_e, 'purchase', 'pay-1'),
    (sa, v_e, 'grant', NULL);
  INSERT INTO course_entitlements (user_id, course_id, source, source_ref, revoked_at) VALUES
    (sr, v_e, 'purchase', 'pay-2', now() - interval '1 day');

  PERFORM pg_temp.check_eq('seed: 6 live links, 3 entitlement rows, 4 lessons (the tables are not empty)',
    (SELECT count(*) FROM teacher_student_links WHERE teacher_id = t AND ended_at IS NULL)::text || '/' ||
    (SELECT count(*) FROM course_entitlements WHERE course_id = v_e)::text || '/' ||
    (SELECT count(*) FROM lessons WHERE course_id IN (v_e, v_e2, v_c))::text, '6/3/4');

  -- ── 0. Static facts ----------------------------------------------------------
  PERFORM pg_temp.check_eq('anon cannot execute any of the four functions',
    (SELECT count(*)::text FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
        AND proname IN ('teacher_grant_course', 'teacher_revoke_course_grant', 'teacher_grantable_courses', 'course_grantees')
        AND has_function_privilege('anon', oid, 'EXECUTE')), '0');
  PERFORM pg_temp.check_eq('authenticated can execute all four (positive control)',
    (SELECT count(*)::text FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
        AND proname IN ('teacher_grant_course', 'teacher_revoke_course_grant', 'teacher_grantable_courses', 'course_grantees')
        AND has_function_privilege('authenticated', oid, 'EXECUTE')), '4');
  PERFORM pg_temp.check_eq('anon: grant refused',
    pg_temp.as_anon(format('SELECT public.teacher_grant_course(%L, %L)::text', v_e, s)), 'ERR:42501');
  PERFORM pg_temp.check_eq('anon: revoke refused',
    pg_temp.as_anon(format('SELECT public.teacher_revoke_course_grant(%L, %L)::text', v_e, s)), 'ERR:42501');
  PERFORM pg_temp.check_eq('course_entitlements: still exactly one policy (owner read), unchanged by 087',
    (SELECT string_agg(policyname, ',') FROM pg_policies WHERE tablename = 'course_entitlements'),
    'course_entitlements: owner read');
  PERFORM pg_temp.check_eq('no app role holds INSERT, UPDATE or DELETE on course_entitlements',
    (SELECT count(*)::text FROM information_schema.role_table_grants
      WHERE table_name = 'course_entitlements' AND table_schema = 'public'
        AND grantee IN ('anon', 'authenticated') AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')), '0');
  PERFORM pg_temp.check_eq('control: the owner-read grant is still there',
    (SELECT count(*)::text FROM information_schema.role_table_grants
      WHERE table_name = 'course_entitlements' AND table_schema = 'public'
        AND grantee = 'authenticated' AND privilege_type = 'SELECT'), '1');
  PERFORM pg_temp.check_eq('a student cannot write their own entitlement directly',
    pg_temp.try_user(s, format($q$ INSERT INTO course_entitlements (user_id, course_id, source) VALUES (%L, %L, 'grant') RETURNING 'x' $q$, s, v_e)),
    'ERR:42501');

  -- ── 1. Anonymous-path rows, before ------------------------------------------
  v_before :=
    COALESCE(pg_temp.as_anon(format('SELECT public.can_read_lesson(%L)::text', v_e0)), 'null') || '/' ||
    COALESCE(pg_temp.as_anon(format('SELECT public.can_read_lesson(%L)::text', v_e1)), 'null') || '/' ||
    pg_temp.as_user(n, format('SELECT public.can_read_lesson(%L)::text', v_e0)) || '/' ||
    pg_temp.as_user(n, format('SELECT public.can_read_lesson(%L)::text', v_e1)) || '/' ||
    pg_temp.as_user(sc, format('SELECT public.can_read_lesson(%L)::text', v_e1)) || '/' ||
    pg_temp.as_user(t, format('SELECT public.can_read_lesson(%L)::text', v_e1));
  RAISE NOTICE 'anonymous-path rows BEFORE (anon free / anon paid / user free / user paid / purchaser paid / editor paid): %', v_before;
  PERFORM pg_temp.check_eq('anonymous-path rows before: anon free yes, anon paid no, user free yes, user paid no, purchaser yes, editor yes',
    v_before, 'true/false/true/false/true/true');

  PERFORM pg_temp.check_eq('before: s cannot open the entitled lesson',
    pg_temp.as_user(s, format('SELECT public.can_read_lesson(%L)::text', v_e1)), 'false');

  -- ── 2. Refusals (each next to the success it is the control for) ------------
  PERFORM pg_temp.check_eq('another teacher (t2) grants s on E: forbidden',
    pg_temp.res(t2, format('public.teacher_grant_course(%L, %L)', v_e, s)), 'forbidden');
  PERFORM pg_temp.check_eq('t grants s on E2 (a course t does not edit): forbidden',
    pg_temp.res(t, format('public.teacher_grant_course(%L, %L)', v_e2, s)), 'forbidden');
  PERFORM pg_temp.check_eq('a plain user (n) grants s on E: forbidden',
    pg_temp.res(n, format('public.teacher_grant_course(%L, %L)', v_e, s)), 'forbidden');
  PERFORM pg_temp.check_eq('t grants n (not linked to t) on E: not_linked',
    pg_temp.res(t, format('public.teacher_grant_course(%L, %L)', v_e, n)), 'not_linked');
  PERFORM pg_temp.check_eq('t grants t2 (an editor, but not a linked student) on E: not_linked',
    pg_temp.res(t, format('public.teacher_grant_course(%L, %L)', v_e, t2)), 'not_linked');
  PERFORM pg_temp.check_eq('t grants s on the cohort course C: cohort_course',
    pg_temp.res(t, format('public.teacher_grant_course(%L, %L)', v_c, s)), 'cohort_course');
  PERFORM pg_temp.check_eq('t grants s on a course id that does not exist: forbidden',
    pg_temp.res(t, format('public.teacher_grant_course(%L, %L)', gen_random_uuid(), s)), 'forbidden');
  PERFORM pg_temp.check_eq('t grants NULL: forbidden',
    pg_temp.res(t, 'public.teacher_grant_course(NULL, NULL)'), 'forbidden');
  PERFORM pg_temp.check_eq('none of those wrote a row: entitlement rows on E are still the 3 seeded',
    (SELECT count(*)::text FROM course_entitlements WHERE course_id IN (v_e, v_e2, v_c)), '3');
  PERFORM pg_temp.check_eq('and s still cannot open the paid lesson',
    pg_temp.as_user(s, format('SELECT public.can_read_lesson(%L)::text', v_e1)), 'false');

  -- Existing entitlements are not reopened or duplicated.
  PERFORM pg_temp.check_eq('t grants sc (active purchase): has_access',
    pg_temp.res(t, format('public.teacher_grant_course(%L, %L)', v_e, sc)), 'has_access');
  PERFORM pg_temp.check_eq('t grants sa (active admin grant): has_access',
    pg_temp.res(t, format('public.teacher_grant_course(%L, %L)', v_e, sa)), 'has_access');
  PERFORM pg_temp.check_eq('t grants sr (a refunded purchase): not_grantable',
    pg_temp.res(t, format('public.teacher_grant_course(%L, %L)', v_e, sr)), 'not_grantable');
  PERFORM pg_temp.check_eq('t revokes sc (a purchase is not a teacher grant): not_granted',
    pg_temp.res(t, format('public.teacher_revoke_course_grant(%L, %L)', v_e, sc)), 'not_granted');
  PERFORM pg_temp.check_eq('t revokes sa (an admin grant): not_granted',
    pg_temp.res(t, format('public.teacher_revoke_course_grant(%L, %L)', v_e, sa)), 'not_granted');
  PERFORM pg_temp.check_eq('sc, sa and sr rows are untouched (revoked_at null, null, set)',
    (SELECT string_agg((revoked_at IS NULL)::text, ',' ORDER BY user_id = sc DESC, user_id = sa DESC)
       FROM course_entitlements WHERE course_id = v_e AND user_id IN (sc, sa, sr)), 'true,true,false');
  PERFORM pg_temp.check_eq('control: sc still opens the paid lesson',
    pg_temp.as_user(sc, format('SELECT public.can_read_lesson(%L)::text', v_e1)), 'true');

  -- ── 3. Grant: the positive control ------------------------------------------
  PERFORM pg_temp.check_eq('t grants s on E: ok',
    pg_temp.res(t, format('public.teacher_grant_course(%L, %L)', v_e, s)), 'ok');
  PERFORM pg_temp.check_eq('the row is a teacher grant for s',
    (SELECT source || ':' || (source_ref = 'teacher:' || t::text)::text || ':' || (revoked_at IS NULL)::text
       FROM course_entitlements WHERE user_id = s AND course_id = v_e), 'grant:true:true');
  PERFORM pg_temp.check_eq('a granted student opens the entitled lesson',
    pg_temp.as_user(s, format('SELECT public.can_read_lesson(%L)::text', v_e1)), 'true');
  PERFORM pg_temp.check_eq('the grant is per course: s still cannot open E2''s paid lesson',
    pg_temp.as_user(s, format('SELECT public.can_read_lesson(%L)::text', v_e21)), 'false');
  PERFORM pg_temp.check_eq('and not everyone: sx (linked, not granted) still cannot open it',
    pg_temp.as_user(sx, format('SELECT public.can_read_lesson(%L)::text', v_e1)), 'false');
  PERFORM pg_temp.check_eq('s reads the row through the owner policy',
    pg_temp.as_user(s, format($q$ SELECT count(*)::text FROM course_entitlements WHERE course_id = %L $q$, v_e)), '1');
  PERFORM pg_temp.check_eq('grant again: ok, already, nothing changes',
    pg_temp.res(t, format('public.teacher_grant_course(%L, %L)', v_e, s)), 'ok:already');
  PERFORM pg_temp.check_eq('still one row for s on E',
    (SELECT count(*)::text FROM course_entitlements WHERE user_id = s AND course_id = v_e), '1');

  -- ── 4. Reads ------------------------------------------------------------------
  PERFORM pg_temp.check_eq('course_grantees(E) as t: exactly s',
    pg_temp.as_user(t, format($q$ SELECT string_agg(student_id::text, ',') FROM public.course_grantees(%L) $q$, v_e)), s::text);
  PERFORM pg_temp.check_eq('course_grantees(E) as t2 (does not edit E): nothing',
    pg_temp.as_user(t2, format($q$ SELECT count(*)::text FROM public.course_grantees(%L) $q$, v_e)), '0');
  PERFORM pg_temp.check_eq('course_grantees(E) as n: nothing',
    pg_temp.as_user(n, format($q$ SELECT count(*)::text FROM public.course_grantees(%L) $q$, v_e)), '0');
  PERFORM pg_temp.check_eq('the purchaser and the admin-comped student are not listed as grantees',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.course_grantees(%L) WHERE student_id IN (%L, %L, %L) $q$, v_e, sc, sa, sr)), '0');
  PERFORM pg_temp.check_eq('teacher_grantable_courses(s) as t: E only (E2 is not t''s, C is cohort), state granted',
    pg_temp.as_user(t, format($q$ SELECT string_agg(title || ':' || state, ',' ORDER BY title) FROM public.teacher_grantable_courses(%L) $q$, s)), 'E:granted');
  PERFORM pg_temp.check_eq('...for sx: E:none',
    pg_temp.as_user(t, format($q$ SELECT string_agg(title || ':' || state, ',') FROM public.teacher_grantable_courses(%L) $q$, sx)), 'E:none');
  PERFORM pg_temp.check_eq('...for sc: E:other; sa: E:other; sr: E:unavailable',
    pg_temp.as_user(t, format($q$ SELECT string_agg(state, ',' ORDER BY ord) FROM (
        SELECT 1 AS ord, state FROM public.teacher_grantable_courses(%L)
        UNION ALL SELECT 2, state FROM public.teacher_grantable_courses(%L)
        UNION ALL SELECT 3, state FROM public.teacher_grantable_courses(%L)) q $q$, sc, sa, sr)), 'other,other,unavailable');
  PERFORM pg_temp.check_eq('teacher_grantable_courses(n) as t (not linked): nothing',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.teacher_grantable_courses(%L) $q$, n)), '0');
  PERFORM pg_temp.check_eq('teacher_grantable_courses(s) as t2 (s is not t2''s student): nothing',
    pg_temp.as_user(t2, format($q$ SELECT count(*)::text FROM public.teacher_grantable_courses(%L) $q$, s)), '0');
  PERFORM pg_temp.check_eq('teacher_grantable_courses(s) as an admin who is not s''s teacher: nothing (the link scopes it)',
    pg_temp.as_user(adm, format($q$ SELECT count(*)::text FROM public.teacher_grantable_courses(%L) $q$, s)), '0');

  -- ── 5. Revoke --------------------------------------------------------------------
  PERFORM pg_temp.check_eq('t2 revokes s''s grant on E: forbidden',
    pg_temp.res(t2, format('public.teacher_revoke_course_grant(%L, %L)', v_e, s)), 'forbidden');
  PERFORM pg_temp.check_eq('t revokes n (not linked): not_linked',
    pg_temp.res(t, format('public.teacher_revoke_course_grant(%L, %L)', v_e, n)), 'not_linked');
  PERFORM pg_temp.check_eq('control: s still opens it after those refusals',
    pg_temp.as_user(s, format('SELECT public.can_read_lesson(%L)::text', v_e1)), 'true');
  PERFORM pg_temp.check_eq('t revokes sx (never granted): not_granted',
    pg_temp.res(t, format('public.teacher_revoke_course_grant(%L, %L)', v_e, sx)), 'not_granted');
  PERFORM pg_temp.check_eq('t revokes s: ok',
    pg_temp.res(t, format('public.teacher_revoke_course_grant(%L, %L)', v_e, s)), 'ok');
  PERFORM pg_temp.check_eq('a revoked student cannot open the entitled lesson',
    pg_temp.as_user(s, format('SELECT public.can_read_lesson(%L)::text', v_e1)), 'false');
  PERFORM pg_temp.check_eq('the row is kept, with revoked_at set',
    (SELECT (revoked_at IS NOT NULL)::text FROM course_entitlements WHERE user_id = s AND course_id = v_e), 'true');
  PERFORM pg_temp.check_eq('revoke again: not_granted',
    pg_temp.res(t, format('public.teacher_revoke_course_grant(%L, %L)', v_e, s)), 'not_granted');
  PERFORM pg_temp.check_eq('course_grantees(E) as t: empty now',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.course_grantees(%L) $q$, v_e)), '0');
  PERFORM pg_temp.check_eq('teacher_grantable_courses(s): E:revoked',
    pg_temp.as_user(t, format($q$ SELECT string_agg(title || ':' || state, ',') FROM public.teacher_grantable_courses(%L) $q$, s)), 'E:revoked');
  PERFORM pg_temp.check_eq('grant again after a teacher''s revoke: ok (reopened)',
    pg_temp.res(t, format('public.teacher_grant_course(%L, %L)', v_e, s)), 'ok');
  PERFORM pg_temp.check_eq('s opens it again, still one row',
    pg_temp.as_user(s, format('SELECT public.can_read_lesson(%L)::text', v_e1)) || '/' ||
    (SELECT count(*)::text FROM course_entitlements WHERE user_id = s AND course_id = v_e), 'true/1');

  -- ── 6. A link that ends ---------------------------------------------------------
  PERFORM pg_temp.check_eq('t grants s2 while linked: ok',
    pg_temp.res(t, format('public.teacher_grant_course(%L, %L)', v_e, s2)), 'ok');
  UPDATE teacher_student_links SET ended_at = now() WHERE teacher_id = t AND student_id = s2 AND ended_at IS NULL;
  PERFORM pg_temp.check_eq('after the link ended: s2 still opens the paid lesson (nobody loses access)',
    pg_temp.as_user(s2, format('SELECT public.can_read_lesson(%L)::text', v_e1)), 'true');
  PERFORM pg_temp.check_eq('...t can no longer revoke it: not_linked',
    pg_temp.res(t, format('public.teacher_revoke_course_grant(%L, %L)', v_e, s2)), 'not_linked');
  PERFORM pg_temp.check_eq('...nor grant again: not_linked',
    pg_temp.res(t, format('public.teacher_grant_course(%L, %L)', v_e, s2)), 'not_linked');
  PERFORM pg_temp.check_eq('...and s2 drops out of t''s grantee list (s stays: positive control)',
    pg_temp.as_user(t, format($q$ SELECT string_agg(student_id::text, ',') FROM public.course_grantees(%L) $q$, v_e)), s::text);

  -- ── 7. A frozen seat -------------------------------------------------------------
  UPDATE author_seats SET expires_at = now() - interval '1 second' WHERE user_id = t;
  PERFORM pg_temp.check_eq('lapsed seat: grant is seat_lapsed',
    pg_temp.res(t, format('public.teacher_grant_course(%L, %L)', v_e, sx)), 'seat_lapsed');
  PERFORM pg_temp.check_eq('lapsed seat: revoke is seat_lapsed',
    pg_temp.res(t, format('public.teacher_revoke_course_grant(%L, %L)', v_e, s)), 'seat_lapsed');
  PERFORM pg_temp.check_eq('lapsed seat, a stranger course: still forbidden, not seat_lapsed (083 Decision 2)',
    pg_temp.res(t, format('public.teacher_grant_course(%L, %L)', v_e2, sx)), 'forbidden');
  PERFORM pg_temp.check_eq('lapsed seat: nothing was written (sx has no row, s still granted)',
    (SELECT count(*)::text FROM course_entitlements WHERE user_id = sx) || '/' ||
    (SELECT (revoked_at IS NULL)::text FROM course_entitlements WHERE user_id = s AND course_id = v_e), '0/true');
  PERFORM pg_temp.check_eq('lapsed seat: s keeps access',
    pg_temp.as_user(s, format('SELECT public.can_read_lesson(%L)::text', v_e1)), 'true');
  PERFORM pg_temp.check_eq('lapsed seat: the reads still answer',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.course_grantees(%L) $q$, v_e)) || '/' ||
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.teacher_grantable_courses(%L) $q$, sx)), '1/1');
  UPDATE author_seats SET expires_at = NULL WHERE user_id = t;
  PERFORM pg_temp.check_eq('seat renewed: the same grant call by the same teacher is ok (positive control)',
    pg_temp.res(t, format('public.teacher_grant_course(%L, %L)', v_e, sx)), 'ok');
  PERFORM pg_temp.check_eq('...and revoke is ok',
    pg_temp.res(t, format('public.teacher_revoke_course_grant(%L, %L)', v_e, sx)), 'ok');

  -- ── 8. Account deletion ---------------------------------------------------------
  PERFORM pg_temp.check_eq('t deletes the account: ok',
    pg_temp.as_user(t, $q$ SELECT public.delete_my_account()::text $q$)::jsonb->>'ok', 'true');
  PERFORM pg_temp.check_eq('after the teacher''s account is gone, s still opens the paid lesson (a customer keeps access)',
    pg_temp.as_user(s, format('SELECT public.can_read_lesson(%L)::text', v_e1)), 'true');
  PERFORM pg_temp.check_eq('s deletes the account: ok',
    pg_temp.as_user(s, $q$ SELECT public.delete_my_account()::text $q$)::jsonb->>'ok', 'true');
  PERFORM pg_temp.check_eq('...and s''s entitlement rows are gone',
    (SELECT count(*)::text FROM course_entitlements WHERE user_id = s), '0');

  -- ── 9. Anonymous-path rows, after ----------------------------------------------
  v_after :=
    COALESCE(pg_temp.as_anon(format('SELECT public.can_read_lesson(%L)::text', v_e0)), 'null') || '/' ||
    COALESCE(pg_temp.as_anon(format('SELECT public.can_read_lesson(%L)::text', v_e1)), 'null') || '/' ||
    pg_temp.as_user(n, format('SELECT public.can_read_lesson(%L)::text', v_e0)) || '/' ||
    pg_temp.as_user(n, format('SELECT public.can_read_lesson(%L)::text', v_e1)) || '/' ||
    pg_temp.as_user(sc, format('SELECT public.can_read_lesson(%L)::text', v_e1)) || '/' ||
    pg_temp.as_user(adm, format('SELECT public.can_read_lesson(%L)::text', v_e1));
  RAISE NOTICE 'anonymous-path rows AFTER (anon free / anon paid / user free / user paid / purchaser paid / admin paid): %', v_after;
  PERFORM pg_temp.check_eq('anonymous-path rows after: same as before (admin replaces the deleted editor)',
    v_after, 'true/false/true/false/true/true');

  RAISE NOTICE 'TCH-009 PASS: 087 full protocol (% asserted cells)', (SELECT cells FROM pg_temp.tally);
END;
$$;

ROLLBACK;
