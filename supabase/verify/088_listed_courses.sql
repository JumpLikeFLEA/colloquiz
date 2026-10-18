-- ============================================================
-- supabase/verify/088_listed_courses.sql
--
-- TCH-010 full protocol for migration 088 (needs 028, 041, 076, 080, 082, 083
-- applied). NOT a migration: run after 088 is applied, as postgres. Seeds its
-- own data and ROLLS BACK. A failed assertion aborts with "TCH-010 FAIL: ...".
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
    RAISE EXCEPTION 'TCH-010 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

DO $$
DECLARE
  t   UUID := gen_random_uuid();   -- teacher: edits E (published) and D (draft); linked to s
  t2  UUID := gen_random_uuid();   -- another teacher: edits E2 (published), linked to nobody
  adm UUID := gen_random_uuid();   -- admin
  s   UUID := gen_random_uuid();   -- student linked to t
  n   UUID := gen_random_uuid();   -- unrelated learner
  v_e UUID; v_e2 UUID; v_d UUID;
  v_e0 UUID; v_ve0 UUID; v_f0 UUID; v_vf0 UUID; v_doc JSONB;
  v_before TEXT; v_after TEXT;
  v_perm_before TEXT; v_perm_after TEXT;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (t,   'authenticated', 'authenticated', 't-'   || t   || '@verify.test'),
    (t2,  'authenticated', 'authenticated', 't2-'  || t2  || '@verify.test'),
    (adm, 'authenticated', 'authenticated', 'adm-' || adm || '@verify.test'),
    (s,   'authenticated', 'authenticated', 's-'   || s   || '@verify.test'),
    (n,   'authenticated', 'authenticated', 'n-'   || n   || '@verify.test');
  UPDATE profiles SET role = 'admin' WHERE id = adm;

  v_doc := jsonb_build_array(
    jsonb_build_object('id', 'th1', 'kind', 'theory', 'type', 'paragraph'),
    jsonb_build_object('id', 'ex1', 'kind', 'practice', 'type', 'selection',
      'payload', jsonb_build_object('prompt', 'Pick')));

  -- Inserted AFTER 088, so listed takes its default.
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v88-e', 'E', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO v_e;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v88-e2', 'E2', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO v_e2;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v88-d', 'D', 'A2', 'draft', 'self_paced', 's', 'c') RETURNING id INTO v_d;
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES
    (v_e, t, t), (v_d, t, t), (v_e2, t2, t2);
  INSERT INTO author_seats (user_id, kind, public_name)
  SELECT DISTINCT ce.user_id, 'teacher', 'Verify seat' FROM course_editors ce
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_e, 1, 'E0', 'e0', 'anyone') RETURNING id INTO v_e0;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_e0, v_doc, 'editor') RETURNING id INTO v_ve0;
  UPDATE lessons SET published_version_id = v_ve0 WHERE id = v_e0;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_e2, 1, 'F0', 'f0', 'anyone') RETURNING id INTO v_f0;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_f0, v_doc, 'editor') RETURNING id INTO v_vf0;
  UPDATE lessons SET published_version_id = v_vf0 WHERE id = v_f0;
  INSERT INTO teacher_student_links (teacher_id, student_id, source) VALUES (t, s, 'join_link');

  PERFORM pg_temp.check_eq('seed: 3 verify courses, 2 lessons, 1 live link (the tables are not empty)',
    (SELECT count(*) FROM courses WHERE slug LIKE 'v88-%')::text || '/' ||
    (SELECT count(*) FROM lessons WHERE course_id IN (v_e, v_e2))::text || '/' ||
    (SELECT count(*) FROM teacher_student_links WHERE teacher_id = t AND ended_at IS NULL)::text, '3/2/1');

  -- ── 0. Static facts ----------------------------------------------------------
  PERFORM pg_temp.check_eq('column: listed BOOLEAN NOT NULL DEFAULT false',
    (SELECT data_type || '/' || is_nullable || '/' || column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'listed'),
    'boolean/NO/false');
  PERFORM pg_temp.check_eq('a course created after 088 is not listed (default), published or draft',
    (SELECT count(*) FILTER (WHERE listed)::text FROM courses WHERE slug LIKE 'v88-%'), '0');
  PERFORM pg_temp.check_eq('anon cannot execute either new function',
    (SELECT count(*)::text FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
        AND proname IN ('set_course_listed', 'admin_courses_listing')
        AND has_function_privilege('anon', oid, 'EXECUTE')), '0');
  PERFORM pg_temp.check_eq('authenticated can execute both (positive control)',
    (SELECT count(*)::text FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
        AND proname IN ('set_course_listed', 'admin_courses_listing')
        AND has_function_privilege('authenticated', oid, 'EXECUTE')), '2');
  PERFORM pg_temp.check_eq('no app role can UPDATE courses.listed directly',
    pg_temp.try_user(adm, format($q$ UPDATE public.courses SET listed = true WHERE id = %L RETURNING 'x' $q$, v_e)),
    'ERR:42501');

  -- ── 1. Anonymous-path rows, before --------------------------------------------
  v_before :=
    COALESCE(pg_temp.as_anon(format('SELECT public.can_read_lesson(%L)::text', v_e0)), 'null') || '/' ||
    pg_temp.as_user(n, format('SELECT public.can_read_lesson(%L)::text', v_e0)) || '/' ||
    pg_temp.as_user(t, format('SELECT public.can_read_lesson(%L)::text', v_e0));
  RAISE NOTICE 'anonymous-path rows BEFORE (anon free / user free / editor free): %', v_before;
  PERFORM pg_temp.check_eq('anonymous-path rows before (lesson of an UNLISTED published course)', v_before, 'true/true/true');

  -- ── 2. An unlisted published course still opens by its URL --------------------
  PERFORM pg_temp.check_eq('anon: the unlisted published course E is readable by slug',
    pg_temp.as_anon($q$ SELECT count(*)::text FROM public.courses WHERE slug = 'v88-e' $q$), '1');
  PERFORM pg_temp.check_eq('anon: the catalogue read (published AND listed) does not return E',
    pg_temp.as_anon($q$ SELECT count(*)::text FROM public.courses WHERE slug = 'v88-e' AND status = 'published' AND listed $q$), '0');
  PERFORM pg_temp.check_eq('anon: the draft D is not readable (unchanged)',
    pg_temp.as_anon($q$ SELECT count(*)::text FROM public.courses WHERE slug = 'v88-d' $q$), '0');

  -- ── 3. set_course_listed ------------------------------------------------------
  PERFORM pg_temp.check_eq('anon: set_course_listed refused',
    pg_temp.as_anon(format('SELECT public.set_course_listed(%L, true)::text', v_e)), 'ERR:42501');
  PERFORM pg_temp.check_eq('learner: forbidden',
    pg_temp.res(n, format('public.set_course_listed(%L, true)', v_e)), 'forbidden');
  PERFORM pg_temp.check_eq('the course editor (a teacher, not an admin): forbidden',
    pg_temp.res(t, format('public.set_course_listed(%L, true)', v_e)), 'forbidden');
  PERFORM pg_temp.check_eq('...and E is still unlisted',
    (SELECT listed::text FROM courses WHERE id = v_e), 'false');
  PERFORM pg_temp.check_eq('admin: a NULL flag is refused',
    pg_temp.res(adm, format('public.set_course_listed(%L, NULL)', v_e)), 'forbidden');
  PERFORM pg_temp.check_eq('admin: an unknown course',
    pg_temp.res(adm, format('public.set_course_listed(%L, true)', gen_random_uuid())), 'course_not_found');
  PERFORM pg_temp.check_eq('admin: a draft cannot be listed',
    pg_temp.res(adm, format('public.set_course_listed(%L, true)', v_d)), 'not_published');
  PERFORM pg_temp.check_eq('admin: unlisting an already unlisted draft is ok',
    pg_temp.res(adm, format('public.set_course_listed(%L, false)', v_d)), 'ok');

  -- homework before listing E2 (t2's unlisted published course)
  v_perm_before :=
    pg_temp.as_user(t,  format('SELECT count(*)::text FROM public.homework_assignable() WHERE course_id = %L', v_e)) || '/' ||
    pg_temp.as_user(t,  format('SELECT count(*)::text FROM public.homework_assignable() WHERE course_id = %L', v_e2)) || '/' ||
    pg_temp.as_user(t2, format('SELECT count(*)::text FROM public.homework_assignable() WHERE course_id = %L', v_e2));
  PERFORM pg_temp.check_eq('homework offer, unlisted: t sees own E (1), not t2''s E2 (0); t2 sees own E2 (1)',
    v_perm_before, '1/0/1');
  PERFORM pg_temp.check_eq('assign_homework by t on another teacher''s UNLISTED course: course_not_found',
    pg_temp.res(t, format('public.assign_homework(%L, NULL, NULL, NULL, ARRAY[%L]::uuid[], ARRAY[]::uuid[])', v_e2, s)),
    'course_not_found');
  PERFORM pg_temp.check_eq('assign_homework by t on own unlisted course E: ok (positive control)',
    pg_temp.res(t, format('public.assign_homework(%L, NULL, NULL, NULL, ARRAY[%L]::uuid[], ARRAY[]::uuid[])', v_e, s)),
    'ok');

  -- admin lists E2
  PERFORM pg_temp.check_eq('admin: lists the published course E2',
    pg_temp.res(adm, format('public.set_course_listed(%L, true)', v_e2)), 'ok');
  PERFORM pg_temp.check_eq('...E2 is listed',
    (SELECT listed::text FROM courses WHERE id = v_e2), 'true');
  PERFORM pg_temp.check_eq('anon: the catalogue read now returns E2 and still not E',
    pg_temp.as_anon($q$ SELECT string_agg(slug, ',' ORDER BY slug) FROM public.courses WHERE slug LIKE 'v88-%' AND status = 'published' AND listed $q$),
    'v88-e2');
  PERFORM pg_temp.check_eq('homework offer, E2 listed: t now sees it (1) (positive control for the 0 above)',
    pg_temp.as_user(t, format('SELECT count(*)::text FROM public.homework_assignable() WHERE course_id = %L', v_e2)), '1');
  PERFORM pg_temp.check_eq('assign_homework by t on the now LISTED course E2: ok (the denial above was the flag)',
    pg_temp.res(t, format('public.assign_homework(%L, NULL, NULL, NULL, ARRAY[%L]::uuid[], ARRAY[]::uuid[])', v_e2, s)),
    'ok');
  PERFORM pg_temp.check_eq('admin: unlisting E2 again is ok',
    pg_temp.res(adm, format('public.set_course_listed(%L, false)', v_e2)), 'ok');
  PERFORM pg_temp.check_eq('...an assignment already made to E2 stays',
    (SELECT count(*)::text FROM homework_assignments WHERE teacher_id = t AND course_id = v_e2), '1');

  -- ── 4. admin_courses_listing --------------------------------------------------
  PERFORM pg_temp.check_eq('learner: admin_courses_listing refused',
    pg_temp.try_user(n, 'SELECT count(*)::text FROM public.admin_courses_listing()'), 'ERR:42501');
  PERFORM pg_temp.check_eq('teacher: admin_courses_listing refused',
    pg_temp.try_user(t, 'SELECT count(*)::text FROM public.admin_courses_listing()'), 'ERR:42501');
  PERFORM pg_temp.check_eq('anon: admin_courses_listing refused',
    pg_temp.as_anon('SELECT count(*)::text FROM public.admin_courses_listing()'), 'ERR:42501');
  PERFORM pg_temp.check_eq('admin: sees all 3 verify courses with the author name column (positive control)',
    pg_temp.as_user(adm, $q$ SELECT count(*)::text FROM public.admin_courses_listing() WHERE slug LIKE 'v88-%' $q$), '3');

  -- ── 5. Anonymous-path rows, after ---------------------------------------------
  v_after :=
    COALESCE(pg_temp.as_anon(format('SELECT public.can_read_lesson(%L)::text', v_e0)), 'null') || '/' ||
    pg_temp.as_user(n, format('SELECT public.can_read_lesson(%L)::text', v_e0)) || '/' ||
    pg_temp.as_user(t, format('SELECT public.can_read_lesson(%L)::text', v_e0));
  RAISE NOTICE 'anonymous-path rows AFTER: %', v_after;
  PERFORM pg_temp.check_eq('anonymous-path rows after: same as before', v_after, 'true/true/true');

  RAISE NOTICE 'TCH-010 PASS: 088 full protocol (% asserted cells)', (SELECT cells FROM pg_temp.tally);
END;
$$;

ROLLBACK;
