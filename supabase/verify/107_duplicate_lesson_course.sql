-- ============================================================
-- supabase/verify/107_duplicate_lesson_course.sql
--
-- AUTH-022 full protocol for migration 107 (needs 029, 041, 044, 082, 083
-- applied). NOT a migration: run after 107 is applied, as postgres. Seeds its
-- own data and ROLLS BACK. A failed assertion aborts with "AUTH-022 FAIL: ...".
-- Every denial is paired with a positive control proving the cell succeeds for
-- the caller who should.
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
    RAISE EXCEPTION 'AUTH-022 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

DO $$
DECLARE
  t   UUID := gen_random_uuid();   -- teacher, active seat, edits C
  lap UUID := gen_random_uuid();   -- teacher whose seat has lapsed, edits C2
  oth UUID := gen_random_uuid();   -- another teacher, edits nothing here
  adm UUID := gen_random_uuid();   -- admin
  n   UUID := gen_random_uuid();   -- learner with an entitlement and an open on C
  v_c UUID; v_c2 UUID; v_l1 UUID; v_l2 UUID; v_l3 UUID; v_l4 UUID; v_v1 UUID; v_v1b UUID; v_l5 UUID;
  v_new UUID := gen_random_uuid();
  v_new2 UUID := gen_random_uuid();
  v_new3 UUID := gen_random_uuid();
  v_r JSONB;
  v_copy UUID;
  v_old TEXT := 'http://x/storage/v1/object/public/lesson-images/AAA/old.webp';
  v_nw  TEXT := 'http://x/storage/v1/object/public/lesson-images/BBB/new.webp';
  v_before_l INT; v_before_v INT;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (t,   'authenticated', 'authenticated', 't-'   || t   || '@verify.test'),
    (lap, 'authenticated', 'authenticated', 'lap-' || lap || '@verify.test'),
    (oth, 'authenticated', 'authenticated', 'oth-' || oth || '@verify.test'),
    (adm, 'authenticated', 'authenticated', 'adm-' || adm || '@verify.test'),
    (n,   'authenticated', 'authenticated', 'n-'   || n   || '@verify.test');
  UPDATE profiles SET role = 'admin' WHERE id = adm;
  INSERT INTO author_seats (user_id, kind, public_name, expires_at) VALUES
    (t,   'teacher', 'T',   NULL),
    (lap, 'teacher', 'Lap', now() - interval '1 day'),
    (oth, 'teacher', 'Oth', NULL);

  INSERT INTO courses (slug, title, level, status, format, subtitle, description, cover_image_url, listed, how_to_join_url)
  VALUES ('v107-c', 'Course C', 'B1', 'published', 'cohort', 'sub', 'desc', v_old, true, 'https://join.example')
  RETURNING id INTO v_c;
  INSERT INTO courses (slug, title, level, status, format)
  VALUES ('v107-c2', 'Course C2', 'A2', 'draft', 'self_paced') RETURNING id INTO v_c2;
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES (v_c, t, t), (v_c2, lap, lap);

  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, estimated_minutes, description)
  VALUES (v_c, 1, 'One', 'one', 'anyone', 12, 'd1') RETURNING id INTO v_l1;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level)
  VALUES (v_c, 2, 'Two', 'two', 'signed_in') RETURNING id INTO v_l2;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, archived_at)
  VALUES (v_c, 3, 'Gone', 'gone', 'entitled', now()) RETURNING id INTO v_l3;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week)
  VALUES (v_c, 4, 'Empty', 'empty', 'entitled', 2) RETURNING id INTO v_l4;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level)
  VALUES (v_c2, 1, 'Other', 'other', 'anyone') RETURNING id INTO v_l5;

  -- lesson One: an older version and a newer one; the copy must take the newer.
  INSERT INTO lesson_versions (lesson_id, document, source, created_at)
  VALUES (v_l1, jsonb_build_array(jsonb_build_object('id', 'old', 'kind', 'theory', 'type', 'paragraph')), 'editor', now() - interval '2 hours')
  RETURNING id INTO v_v1;
  INSERT INTO lesson_versions (lesson_id, document, source, created_at)
  VALUES (v_l1, jsonb_build_array(
            jsonb_build_object('id', 'img', 'kind', 'theory', 'type', 'image', 'url', v_old),
            jsonb_build_object('id', 'keep', 'kind', 'theory', 'type', 'image', 'url', 'https://elsewhere/x.png')),
          'editor', now() - interval '1 hour')
  RETURNING id INTO v_v1b;
  UPDATE lessons SET published_version_id = v_v1, published_item_count = 3 WHERE id = v_l1;

  -- learner-side rows on C: none may be copied
  INSERT INTO course_entitlements (user_id, course_id, source) VALUES (n, v_c, 'grant');
  INSERT INTO lesson_opens (user_id, lesson_id) VALUES (n, v_l1);
  INSERT INTO course_runs (course_id, title, starts_at, ends_at) VALUES (v_c, 'run', now(), now() + interval '28 days');
  v_before_l := (SELECT count(*) FROM lessons);
  v_before_v := (SELECT count(*) FROM lesson_versions);

  PERFORM pg_temp.check_eq('seed: course C has 4 lessons (one archived), 2 versions on lesson One, 1 entitlement, 1 open, 1 run (not empty)',
    (SELECT count(*) FROM lessons WHERE course_id = v_c)::text || '/' ||
    (SELECT count(*) FROM lesson_versions WHERE lesson_id = v_l1)::text || '/' ||
    (SELECT count(*) FROM course_entitlements WHERE course_id = v_c)::text || '/' ||
    (SELECT count(*) FROM lesson_opens WHERE lesson_id = v_l1)::text || '/' ||
    (SELECT count(*) FROM course_runs WHERE course_id = v_c)::text, '4/2/1/1/1');

  -- ── 0. Static facts ---------------------------------------------------------
  PERFORM pg_temp.check_eq('anon cannot execute duplicate_lesson / duplicate_course',
    (SELECT count(*)::text FROM pg_proc WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('duplicate_lesson', 'duplicate_course')
      AND has_function_privilege('anon', oid, 'EXECUTE')), '0');
  PERFORM pg_temp.check_eq('authenticated can execute both (positive control)',
    (SELECT count(*)::text FROM pg_proc WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('duplicate_lesson', 'duplicate_course')
      AND has_function_privilege('authenticated', oid, 'EXECUTE')), '2');
  PERFORM pg_temp.check_eq('the helpers are not executable by authenticated',
    (SELECT count(*)::text FROM pg_proc WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('_apply_url_map', '_free_lesson_slug')
      AND has_function_privilege('authenticated', oid, 'EXECUTE')), '0');

  -- ── 1. duplicate_lesson: denials, each beside a positive control ------------
  PERFORM pg_temp.check_eq('anon: refused',
    pg_temp.as_anon(format('SELECT public.duplicate_lesson(%L)::text', v_l1)), 'ERR:42501');
  PERFORM pg_temp.check_eq('a seated teacher who does not edit C: forbidden',
    pg_temp.res(oth, format('public.duplicate_lesson(%L)', v_l1)), 'forbidden');
  PERFORM pg_temp.check_eq('a learner: forbidden',
    pg_temp.res(n, format('public.duplicate_lesson(%L)', v_l1)), 'forbidden');
  PERFORM pg_temp.check_eq('lapsed seat, editor of C2: seat_lapsed',
    pg_temp.res(lap, format('public.duplicate_lesson(%L)', v_l5)), 'seat_lapsed');
  PERFORM pg_temp.check_eq('...nothing was written by the denials',
    (SELECT count(*) FROM lessons)::text, v_before_l::text);
  PERFORM pg_temp.check_eq('unknown lesson',
    pg_temp.res(t, format('public.duplicate_lesson(%L)', gen_random_uuid())), 'lesson_not_found');
  PERFORM pg_temp.check_eq('an archived lesson',
    pg_temp.res(t, format('public.duplicate_lesson(%L)', v_l3)), 'lesson_archived');

  v_r := pg_temp.as_user(t, format('SELECT public.duplicate_lesson(%L, %L::jsonb)::text', v_l1,
          jsonb_build_object(v_old, v_nw)::text))::jsonb;
  PERFORM pg_temp.check_eq('editor with an active seat: ok (positive control)', v_r->>'ok', 'true');
  v_copy := (v_r->>'lesson_id')::uuid;
  PERFORM pg_temp.check_eq('copy: same course, ordinal 5 (after the archived one), slug one-copy',
    (SELECT course_id = v_c AND ordinal = 5 AND slug = 'one-copy' FROM lessons WHERE id = v_copy)::text, 'true');
  PERFORM pg_temp.check_eq('copy: title, description, minutes, access level carried',
    (SELECT title || '/' || description || '/' || estimated_minutes || '/' || access_level FROM lessons WHERE id = v_copy),
    'One (copy)/d1/12/anyone');
  PERFORM pg_temp.check_eq('copy: unpublished, count 0',
    (SELECT (published_version_id IS NULL)::text || '/' || published_item_count FROM lessons WHERE id = v_copy), 'true/0');
  PERFORM pg_temp.check_eq('copy: exactly one version, source editor, made by t, from the LATEST document (2 blocks)',
    (SELECT count(*)::text || '/' || min(source) || '/' || bool_and(created_by = t)::text || '/' || max(jsonb_array_length(document))::text
       FROM lesson_versions WHERE lesson_id = v_copy), '1/editor/true/2');
  PERFORM pg_temp.check_eq('copy: the mapped URL is replaced, the unmapped one is kept',
    (SELECT (document->0->>'url') || ' ' || (document->1->>'url') FROM lesson_versions WHERE lesson_id = v_copy),
    v_nw || ' https://elsewhere/x.png');
  PERFORM pg_temp.check_eq('original lesson untouched (still the old URL, its 2 versions)',
    (SELECT (SELECT (document->0->>'url') FROM lesson_versions WHERE id = v_v1b) || ' ' || count(*) FROM lesson_versions WHERE lesson_id = v_l1),
    v_old || ' 2');
  v_r := pg_temp.as_user(t, format('SELECT public.duplicate_lesson(%L)::text', v_l1))::jsonb;
  PERFORM pg_temp.check_eq('a second copy gets the next free slug',
    (SELECT slug FROM lessons WHERE id = (v_r->>'lesson_id')::uuid), 'one-copy-2');
  v_r := pg_temp.as_user(t, format('SELECT public.duplicate_lesson(%L)::text', v_l4))::jsonb;
  PERFORM pg_temp.check_eq('a lesson with no version copies with none',
    (SELECT count(*)::text FROM lesson_versions WHERE lesson_id = (v_r->>'lesson_id')::uuid), '0');
  PERFORM pg_temp.check_eq('admin may copy any lesson (positive control)',
    pg_temp.res(adm, format('public.duplicate_lesson(%L)', v_l5)), 'ok');

  -- ── 2. duplicate_course: denials, each beside a positive control ------------
  PERFORM pg_temp.check_eq('anon: refused',
    pg_temp.as_anon(format('SELECT public.duplicate_course(%L, %L)::text', v_c, v_new)), 'ERR:42501');
  PERFORM pg_temp.check_eq('a seated teacher who does not edit C: forbidden',
    pg_temp.res(oth, format('public.duplicate_course(%L, %L)', v_c, v_new)), 'forbidden');
  PERFORM pg_temp.check_eq('a learner: forbidden',
    pg_temp.res(n, format('public.duplicate_course(%L, %L)', v_c, v_new)), 'forbidden');
  PERFORM pg_temp.check_eq('lapsed seat, editor of C2: seat_lapsed',
    pg_temp.res(lap, format('public.duplicate_course(%L, %L)', v_c2, v_new)), 'seat_lapsed');
  PERFORM pg_temp.check_eq('an unknown course',
    pg_temp.res(t, format('public.duplicate_course(%L, %L)', gen_random_uuid(), v_new)), 'course_not_found');
  PERFORM pg_temp.check_eq('...no course was made by the denials',
    (SELECT count(*)::text FROM courses WHERE slug LIKE 'v107-c%copy%'), '0');
  PERFORM pg_temp.check_eq('a new id that is already a course: id_taken',
    pg_temp.res(t, format('public.duplicate_course(%L, %L)', v_c, v_c2)), 'id_taken');

  v_r := pg_temp.as_user(t, format('SELECT public.duplicate_course(%L, %L, %L::jsonb)::text', v_c, v_new,
          jsonb_build_object(v_old, v_nw)::text))::jsonb;
  PERFORM pg_temp.check_eq('editor with an active seat: ok (positive control)', v_r->>'ok', 'true');
  PERFORM pg_temp.check_eq('copy reports 6 lessons (the archived one is left out)', v_r->>'lessons', '6');
  PERFORM pg_temp.check_eq('copy: draft, NOT listed, author is the caller, title and slug',
    (SELECT status || '/' || listed::text || '/' || (author_id = t)::text || '/' || title || '/' || slug
       FROM courses WHERE id = v_new), 'draft/false/true/Course C (copy)/v107-c-copy');
  PERFORM pg_temp.check_eq('copy: neither listed nor published, and the original is still published and listed',
    (SELECT count(*) FILTER (WHERE listed OR status = 'published')::text FROM courses WHERE id = v_new) || '/' ||
    (SELECT (status = 'published' AND listed)::text FROM courses WHERE id = v_c), '0/true');
  PERFORM pg_temp.check_eq('copy: metadata carried (level, format, subtitle, description, join link) and the cover mapped',
    (SELECT level || '/' || format || '/' || subtitle || '/' || description || '/' || how_to_join_url || '/' || cover_image_url
       FROM courses WHERE id = v_new), 'B1/cohort/sub/desc/https://join.example/' || v_nw);
  PERFORM pg_temp.check_eq('copy: the caller is its editor, and only the caller',
    (SELECT string_agg(user_id::text, ',') FROM course_editors WHERE course_id = v_new), t::text);
  PERFORM pg_temp.check_eq('copy: lessons in order, none published, access levels and slugs carried',
    (SELECT string_agg(ordinal || ':' || slug || ':' || access_level || ':' || COALESCE(week::text, '-') || ':' || (published_version_id IS NULL)::text, ',' ORDER BY ordinal)
       FROM lessons WHERE course_id = v_new), '1:one:anyone:-:true,2:two:signed_in:-:true,3:empty:entitled:2:true,4:one-copy:anyone:-:true,5:one-copy-2:anyone:-:true,6:empty-copy:entitled:2:true');
  PERFORM pg_temp.check_eq('copy: lesson One has one version with the latest document and the mapped URL',
    (SELECT count(*)::text || '/' || max(document->0->>'url') FROM lesson_versions
      WHERE lesson_id = (SELECT id FROM lessons WHERE course_id = v_new AND slug = 'one')), '1/' || v_nw);
  PERFORM pg_temp.check_eq('nothing learner-side is copied: entitlements, opens, runs, editors',
    (SELECT count(*) FROM course_entitlements WHERE course_id = v_new)::text || '/' ||
    (SELECT count(*) FROM lesson_opens WHERE lesson_id IN (SELECT id FROM lessons WHERE course_id = v_new))::text || '/' ||
    (SELECT count(*) FROM course_runs WHERE course_id = v_new)::text, '0/0/0');
  PERFORM pg_temp.check_eq('...while the original still has its entitlement, open and run (the tables are not empty)',
    (SELECT count(*) FROM course_entitlements WHERE course_id = v_c)::text || '/' ||
    (SELECT count(*) FROM lesson_opens WHERE lesson_id = v_l1)::text || '/' ||
    (SELECT count(*) FROM course_runs WHERE course_id = v_c)::text, '1/1/1');
  PERFORM pg_temp.check_eq('the original course keeps its 7 lessons',
    (SELECT count(*)::text FROM lessons WHERE course_id = v_c), '7');

  v_r := pg_temp.as_user(t, format('SELECT public.duplicate_course(%L, %L)::text', v_c, v_new2))::jsonb;
  PERFORM pg_temp.check_eq('a second copy gets the next free slug',
    (SELECT slug FROM courses WHERE id = v_new2), 'v107-c-copy-2');
  v_r := pg_temp.as_user(adm, format('SELECT public.duplicate_course(%L, %L)::text', v_c, v_new3))::jsonb;
  PERFORM pg_temp.check_eq('admin: ok, and gets no course_editors row (create_course precedent)',
    (v_r->>'ok') || '/' || (SELECT count(*)::text FROM course_editors WHERE course_id = v_new3), 'true/0');

  -- Deleting the original's rows does not touch the copy.
  DELETE FROM lessons WHERE course_id = v_c;
  PERFORM pg_temp.check_eq('the copy survives deleting the original lessons (own rows, own versions)',
    (SELECT count(*)::text FROM lesson_versions WHERE lesson_id IN (SELECT id FROM lessons WHERE course_id = v_new)), '3');

  RAISE NOTICE 'AUTH-022 PASS: 107 full protocol (% asserted cells)', (SELECT cells FROM pg_temp.tally);
END;
$$;

ROLLBACK;
