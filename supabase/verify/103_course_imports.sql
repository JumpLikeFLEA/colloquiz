-- ============================================================
-- supabase/verify/103_course_imports.sql
--
-- CNT-018 full protocol for migration 103 (needs 082, 102 applied). NOT a
-- migration: run after 103 is applied, as postgres. Seeds its own data and
-- ROLLS BACK. A failed assertion aborts with "CNT-018 FAIL: ...". Every denial
-- is paired with a positive control: the same call succeeding for the caller
-- who should be able to make it, and every count that is asserted to be zero
-- has a non-empty set beside it.
-- ============================================================
BEGIN;

CREATE FUNCTION pg_temp.as_role(p_role TEXT, p_user UUID, p_sql TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  IF p_user IS NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('role', p_role)::text, true);
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', p_role)::text, true);
  END IF;
  PERFORM set_config('role', p_role, true);
  EXECUTE p_sql INTO v;
  PERFORM set_config('role', 'postgres', true);
  RETURN v;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('role', 'postgres', true);
  RETURN 'ERR:' || SQLSTATE;
END;
$$;

CREATE FUNCTION pg_temp.as_user(p_user UUID, p_sql TEXT)
RETURNS TEXT LANGUAGE sql AS $$ SELECT pg_temp.as_role('authenticated', p_user, p_sql) $$;

CREATE FUNCTION pg_temp.as_anon(p_sql TEXT)
RETURNS TEXT LANGUAGE sql AS $$ SELECT pg_temp.as_role('anon', NULL, p_sql) $$;

CREATE FUNCTION pg_temp.as_service(p_sql TEXT)
RETURNS TEXT LANGUAGE sql AS $$ SELECT pg_temp.as_role('service_role', NULL, p_sql) $$;

CREATE FUNCTION pg_temp.check_eq(p_label TEXT, p_got TEXT, p_want TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE '% -> got % (want %)', p_label, p_got, p_want;
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'CNT-018 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

-- A bucket object for a user, as the upload would leave it.
CREATE FUNCTION pg_temp.put_object(p_name TEXT, p_age INTERVAL DEFAULT INTERVAL '0')
RETURNS VOID LANGUAGE sql AS $$
  INSERT INTO storage.objects (bucket_id, name, created_at) VALUES ('course-imports', p_name, now() - p_age)
$$;

-- create_course-shaped call, returning the error word or 'ok'.
CREATE FUNCTION pg_temp.create_import(p_user UUID, p_object TEXT, p_slug TEXT, p_format TEXT DEFAULT 'pdf')
RETURNS TEXT LANGUAGE sql AS $$
  SELECT pg_temp.as_user(p_user, format(
    'SELECT COALESCE((public.course_import_create(%L, %L, %L, %L, %L))->>''error'', ''ok'')',
    p_object, p_format, 'Imported course', p_slug, 'B1'))
$$;

DO $$
DECLARE
  a   UUID := gen_random_uuid();  -- admin, no seat
  p   UUID := gen_random_uuid();  -- plain user
  tg  UUID := gen_random_uuid();  -- seated, active, granted
  tl  UUID := gen_random_uuid();  -- seated, LAPSED, granted
  tu  UUID := gen_random_uuid();  -- seated, active, NOT granted
  tc  UUID := gen_random_uuid();  -- seated, active, granted: the daily cap
  tm  UUID := gen_random_uuid();  -- seated, active, granted: the monthly cap
  i1  UUID; i2 UUID; i3 UUID; i4 UUID;
  imp UUID;
  cid UUID;
  r   JSONB;
  n   INTEGER;
  v_detail TEXT;
  v_hint   TEXT;
  doc JSONB := '[{"id":"h1","kind":"theory","type":"heading","level":1,"text":[{"text":"Hi"}]}]'::jsonb;
  two JSONB;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (a,  'authenticated', 'authenticated', 'a-'  || a  || '@verify.test'),
    (p,  'authenticated', 'authenticated', 'p-'  || p  || '@verify.test'),
    (tg, 'authenticated', 'authenticated', 'tg-' || tg || '@verify.test'),
    (tl, 'authenticated', 'authenticated', 'tl-' || tl || '@verify.test'),
    (tu, 'authenticated', 'authenticated', 'tu-' || tu || '@verify.test'),
    (tc, 'authenticated', 'authenticated', 'tc-' || tc || '@verify.test'),
    (tm, 'authenticated', 'authenticated', 'tm-' || tm || '@verify.test');
  UPDATE profiles SET role = 'admin' WHERE id = a;

  INSERT INTO author_seats (user_id, kind, public_name, expires_at, granted_by, can_import) VALUES
    (tg, 'teacher', 'Seat TG', NULL,                      a, TRUE),
    (tl, 'teacher', 'Seat TL', now() - interval '3 days', a, TRUE),
    (tu, 'teacher', 'Seat TU', NULL,                      a, FALSE),
    (tc, 'teacher', 'Seat TC', NULL,                      a, TRUE),
    (tm, 'teacher', 'Seat TM', NULL,                      a, TRUE);

  two := jsonb_build_array(
    jsonb_build_object('slug', 'one', 'title', 'One', 'description', 'First', 'estimatedMinutes', 12, 'document', doc),
    jsonb_build_object('slug', 'two', 'title', 'Two', 'document', doc));

  -- 1. Privileges ------------------------------------------------------------
  PERFORM pg_temp.check_eq('authenticated has no INSERT on course_imports',
    has_table_privilege('authenticated', 'public.course_imports', 'INSERT')::text, 'false');
  PERFORM pg_temp.check_eq('authenticated has no UPDATE on course_imports',
    has_table_privilege('authenticated', 'public.course_imports', 'UPDATE')::text, 'false');
  PERFORM pg_temp.check_eq('authenticated has no DELETE on course_imports',
    has_table_privilege('authenticated', 'public.course_imports', 'DELETE')::text, 'false');
  PERFORM pg_temp.check_eq('anon has no SELECT on course_imports',
    has_table_privilege('anon', 'public.course_imports', 'SELECT')::text, 'false');
  PERFORM pg_temp.check_eq('authenticated may not read the drafted lessons column',
    has_column_privilege('authenticated', 'public.course_imports', 'lessons', 'SELECT')::text, 'false');
  PERFORM pg_temp.check_eq('...nor the lease, the object name or the Anthropic file id',
    (has_column_privilege('authenticated', 'public.course_imports', 'lease_until', 'SELECT')
      OR has_column_privilege('authenticated', 'public.course_imports', 'object_name', 'SELECT')
      OR has_column_privilege('authenticated', 'public.course_imports', 'anthropic_file_id', 'SELECT'))::text, 'false');
  PERFORM pg_temp.check_eq('...but may read the status column (positive control)',
    has_column_privilege('authenticated', 'public.course_imports', 'status', 'SELECT')::text, 'true');

  PERFORM pg_temp.check_eq('anon cannot call course_import_create',
    has_function_privilege('anon', 'public.course_import_create(text,text,text,text,text)', 'EXECUTE')::text, 'false');
  PERFORM pg_temp.check_eq('authenticated can call course_import_create (positive control: the gate is inside)',
    has_function_privilege('authenticated', 'public.course_import_create(text,text,text,text,text)', 'EXECUTE')::text, 'true');
  PERFORM pg_temp.check_eq('no app role can call any step function',
    (SELECT count(*)::text FROM unnest(ARRAY[
        'public.course_import_claim(uuid,integer)',
        'public.course_import_advance(uuid,text,jsonb,integer)',
        'public.course_import_release(uuid)',
        'public.course_import_fail(uuid,text)',
        'public.course_import_cleaned(uuid[])',
        'public.course_import_commit(uuid,jsonb)',
        'public.course_import_sweep(interval)']) f
      WHERE has_function_privilege('authenticated', f, 'EXECUTE') OR has_function_privilege('anon', f, 'EXECUTE')), '0');
  PERFORM pg_temp.check_eq('...and service_role can call all seven (guards the zero above)',
    (SELECT count(*)::text FROM unnest(ARRAY[
        'public.course_import_claim(uuid,integer)',
        'public.course_import_advance(uuid,text,jsonb,integer)',
        'public.course_import_release(uuid)',
        'public.course_import_fail(uuid,text)',
        'public.course_import_cleaned(uuid[])',
        'public.course_import_commit(uuid,jsonb)',
        'public.course_import_sweep(interval)']) f
      WHERE has_function_privilege('service_role', f, 'EXECUTE')), '7');
  PERFORM pg_temp.check_eq('a granted teacher cannot call course_import_commit as authenticated (42501)',
    pg_temp.as_user(tg, format('SELECT public.course_import_commit(%L, ''{}''::jsonb)::text', gen_random_uuid())), 'ERR:42501');
  PERFORM pg_temp.check_eq('...the same call as service_role reaches the function (not_found, positive control)',
    pg_temp.as_service(format('SELECT (public.course_import_commit(%L, ''{}''::jsonb))->>''error''', gen_random_uuid())), 'not_found');
  PERFORM pg_temp.check_eq('a direct INSERT into course_imports as the granted teacher is refused (42501)',
    pg_temp.as_user(tg, format(
      'WITH x AS (INSERT INTO public.course_imports (user_id, format, title, slug, level) VALUES (%L, ''pdf'', ''T'', ''direct'', ''B1'') RETURNING 1) SELECT count(*)::text FROM x', tg)),
    'ERR:42501');

  -- 2. The bucket ---------------------------------------------------------------
  PERFORM pg_temp.check_eq('the bucket is private, 32 MiB, four types',
    (SELECT public::text || '/' || file_size_limit::text || '/' || cardinality(allowed_mime_types)::text
       FROM storage.buckets WHERE id = 'course-imports'), 'false/33554432/4');
  PERFORM pg_temp.check_eq('a granted teacher can add an object in their own folder (positive control)',
    pg_temp.as_user(tg, format('WITH x AS (INSERT INTO storage.objects (bucket_id, name) VALUES (''course-imports'', %L) RETURNING 1) SELECT count(*)::text FROM x', tg || '/up-1.pdf')), '1');
  PERFORM pg_temp.check_eq('...into someone else''s folder: refused (42501)',
    pg_temp.as_user(tg, format('WITH x AS (INSERT INTO storage.objects (bucket_id, name) VALUES (''course-imports'', %L) RETURNING 1) SELECT count(*)::text FROM x', tu || '/up-x.pdf')), 'ERR:42501');
  PERFORM pg_temp.check_eq('an ungranted seat, in its own folder: refused (42501)',
    pg_temp.as_user(tu, format('WITH x AS (INSERT INTO storage.objects (bucket_id, name) VALUES (''course-imports'', %L) RETURNING 1) SELECT count(*)::text FROM x', tu || '/up-1.pdf')), 'ERR:42501');
  PERFORM pg_temp.check_eq('a lapsed granted seat, in its own folder: refused (42501)',
    pg_temp.as_user(tl, format('WITH x AS (INSERT INTO storage.objects (bucket_id, name) VALUES (''course-imports'', %L) RETURNING 1) SELECT count(*)::text FROM x', tl || '/up-1.pdf')), 'ERR:42501');
  PERFORM pg_temp.check_eq('the admin can (positive control)',
    pg_temp.as_user(a, format('WITH x AS (INSERT INTO storage.objects (bucket_id, name) VALUES (''course-imports'', %L) RETURNING 1) SELECT count(*)::text FROM x', a || '/up-1.pdf')), '1');
  PERFORM pg_temp.check_eq('the bucket gives the owner no read (the granted teacher sees 0 of their 1 object)',
    pg_temp.as_user(tg, 'SELECT count(*)::text FROM storage.objects WHERE bucket_id = ''course-imports'''), '0');
  PERFORM pg_temp.check_eq('...although the object exists (guards the zero above)',
    (SELECT count(*)::text FROM storage.objects WHERE bucket_id = 'course-imports' AND name = tg || '/up-1.pdf'), '1');

  -- 3. course_import_create ---------------------------------------------------------
  PERFORM pg_temp.put_object(tu || '/f.pdf');
  PERFORM pg_temp.put_object(tl || '/f.pdf');
  PERFORM pg_temp.put_object(p  || '/f.pdf');
  PERFORM pg_temp.put_object(tg || '/f2.docx');
  PERFORM pg_temp.put_object(tg || '/f3.md');
  PERFORM pg_temp.put_object(tg || '/f4.txt');
  PERFORM pg_temp.put_object(tg || '/f5.pdf');

  PERFORM pg_temp.check_eq('an ungranted active seat is forbidden',
    pg_temp.create_import(tu, tu || '/f.pdf', 'c-tu'), 'forbidden');
  PERFORM pg_temp.check_eq('a plain user is forbidden',
    pg_temp.create_import(p, p || '/f.pdf', 'c-p'), 'forbidden');
  PERFORM pg_temp.check_eq('a lapsed seat that holds the grant is told seat_lapsed',
    pg_temp.create_import(tl, tl || '/f.pdf', 'c-tl'), 'seat_lapsed');
  PERFORM pg_temp.check_eq('anon is refused outright (42501)',
    pg_temp.as_anon(format('SELECT (public.course_import_create(%L, ''pdf'', ''T'', ''c-anon'', ''B1''))->>''error''', tg || '/up-1.pdf')), 'ERR:42501');
  PERFORM pg_temp.check_eq('none of those wrote a row',
    (SELECT count(*)::text FROM course_imports WHERE slug IN ('c-tu', 'c-p', 'c-tl', 'c-anon')), '0');

  PERFORM pg_temp.check_eq('a path in someone else''s folder: file_missing',
    pg_temp.create_import(tg, tu || '/f.pdf', 'c-x'), 'file_missing');
  PERFORM pg_temp.check_eq('a path that names nothing: file_missing',
    pg_temp.create_import(tg, tg || '/nope.pdf', 'c-x'), 'file_missing');
  PERFORM pg_temp.check_eq('a bad slug: invalid_slug',
    pg_temp.create_import(tg, tg || '/up-1.pdf', 'Bad Slug'), 'invalid_slug');
  PERFORM pg_temp.check_eq('a bad format: invalid_format',
    pg_temp.create_import(tg, tg || '/up-1.pdf', 'c-x', 'pptx'), 'invalid_format');
  PERFORM pg_temp.check_eq('a bad level: invalid_level',
    pg_temp.as_user(tg, format('SELECT (public.course_import_create(%L, ''pdf'', ''T'', ''c-x'', ''Z9''))->>''error''', tg || '/up-1.pdf')), 'invalid_level');
  PERFORM pg_temp.check_eq('an empty title: invalid_title',
    pg_temp.as_user(tg, format('SELECT (public.course_import_create(%L, ''pdf'', ''  '', ''c-x'', ''B1''))->>''error''', tg || '/up-1.pdf')), 'invalid_title');
  PERFORM pg_temp.check_eq('...none of those wrote a row',
    (SELECT count(*)::text FROM course_imports WHERE slug = 'c-x'), '0');

  PERFORM pg_temp.check_eq('the granted teacher starts an import (positive control)',
    pg_temp.create_import(tg, tg || '/up-1.pdf', 'imp-one'), 'ok');
  SELECT id INTO imp FROM course_imports WHERE slug = 'imp-one';
  PERFORM pg_temp.check_eq('...it is pending, owned by them, with the title and level they gave',
    (SELECT status || '/' || (user_id = tg)::text || '/' || title || '/' || level || '/' || format FROM course_imports WHERE id = imp),
    'pending/true/Imported course/B1/pdf');
  PERFORM pg_temp.check_eq('the same object cannot start a second import: file_missing',
    pg_temp.create_import(tg, tg || '/up-1.pdf', 'imp-two'), 'file_missing');
  PERFORM pg_temp.check_eq('the same slug while that import is active: slug_taken',
    pg_temp.create_import(tg, tg || '/f2.docx', 'imp-one', 'docx'), 'slug_taken');
  INSERT INTO courses (slug, title, level, status) VALUES ('existing-course', 'Existing', 'B1', 'draft');
  PERFORM pg_temp.check_eq('a slug a course already uses: slug_taken',
    pg_temp.create_import(tg, tg || '/f2.docx', 'existing-course', 'docx'), 'slug_taken');
  PERFORM pg_temp.check_eq('a fresh slug on the same object works (positive control for both slug_taken above)',
    pg_temp.create_import(tg, tg || '/f2.docx', 'imp-docx', 'docx'), 'ok');
  PERFORM pg_temp.check_eq('a markdown import is accepted (the third in the day), the text one after it hits the daily cap',
    pg_temp.create_import(tg, tg || '/f3.md', 'imp-md', 'markdown') || '/' || pg_temp.create_import(tg, tg || '/f4.txt', 'imp-txt', 'text'), 'ok/ERR:PT429');
  PERFORM pg_temp.check_eq('...so tg has 3 import rows, not 4',
    (SELECT count(*)::text FROM course_imports WHERE user_id = tg), '3');

  -- 4. Reading ---------------------------------------------------------------------
  PERFORM pg_temp.check_eq('the owner reads their own rows (positive control)',
    pg_temp.as_user(tg, 'SELECT count(*)::text FROM public.course_imports'), '3');
  PERFORM pg_temp.check_eq('another seated user reads none of them',
    pg_temp.as_user(tu, 'SELECT count(*)::text FROM public.course_imports'), '0');
  PERFORM pg_temp.check_eq('selecting the drafted lessons column is refused (42501)',
    pg_temp.as_user(tg, 'SELECT count(lessons)::text FROM public.course_imports'), 'ERR:42501');
  PERFORM pg_temp.check_eq('anon is refused (42501)',
    pg_temp.as_anon('SELECT count(*)::text FROM public.course_imports'), 'ERR:42501');

  -- 5. Caps ----------------------------------------------------------------------
  PERFORM pg_temp.put_object(tc || '/1.pdf');
  PERFORM pg_temp.put_object(tc || '/2.pdf');
  PERFORM pg_temp.put_object(tc || '/3.pdf');
  PERFORM pg_temp.put_object(tc || '/4.pdf');
  PERFORM pg_temp.put_object(tc || '/5.pdf');
  PERFORM pg_temp.check_eq('tc''s first three imports in a day are accepted',
    pg_temp.create_import(tc, tc || '/1.pdf', 'cap-1') || '/' || pg_temp.create_import(tc, tc || '/2.pdf', 'cap-2')
      || '/' || pg_temp.create_import(tc, tc || '/3.pdf', 'cap-3'), 'ok/ok/ok');
  PERFORM pg_temp.check_eq('the 4th within 24 h is refused with PT429',
    pg_temp.create_import(tc, tc || '/4.pdf', 'cap-4'), 'ERR:PT429');
  PERFORM pg_temp.check_eq('...no 4th row was written',
    (SELECT count(*)::text FROM course_imports WHERE user_id = tc), '3');
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', tc, 'role', 'authenticated')::text, true);
    PERFORM set_config('role', 'authenticated', true);
    PERFORM public.course_import_create(tc || '/4.pdf', 'pdf', 'T', 'cap-4', 'B1');
    RAISE EXCEPTION 'CNT-018 FAIL: the cap did not raise';
  EXCEPTION WHEN SQLSTATE 'PT429' THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL, v_hint = PG_EXCEPTION_HINT;
  END;
  PERFORM set_config('role', 'postgres', true);
  PERFORM pg_temp.check_eq('...the error carries DETAIL daily_cap and an ISO-time HINT for when a place frees up',
    v_detail || '/' || (v_hint ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z$')::text, 'daily_cap/true');
  -- The same user, after one of those rows failed before any model call: a place is free again.
  PERFORM pg_temp.check_eq('a row that failed before any model call does not count: fail one...',
    (SELECT public.course_import_fail(id, 'mode_off')::text FROM course_imports WHERE slug = 'cap-1'), 'true');
  PERFORM pg_temp.check_eq('...so a 4th import is accepted now',
    pg_temp.create_import(tc, tc || '/4.pdf', 'cap-4'), 'ok');
  PERFORM pg_temp.check_eq('...and a 5th is refused again (the failed row is outside the count, three are inside)',
    pg_temp.create_import(tc, tc || '/5.pdf', 'cap-5'), 'ERR:PT429');
  -- A failed row that DID call the model still counts.
  UPDATE course_imports SET usage = '[{"inputTokens":1}]'::jsonb WHERE slug = 'cap-1';
  PERFORM pg_temp.check_eq('a failed row that spent tokens does count: the next is refused',
    pg_temp.create_import(tc, tc || '/5.pdf', 'cap-5'), 'ERR:PT429');
  -- Rows older than 24 h leave the daily window.
  UPDATE course_imports SET created_at = now() - interval '25 hours' WHERE user_id = tc AND slug IN ('cap-1', 'cap-2');
  PERFORM pg_temp.check_eq('rows older than 24 h leave the daily window: an import is accepted',
    pg_temp.create_import(tc, tc || '/5.pdf', 'cap-5'), 'ok');

  -- Monthly cap: ten counted rows inside 30 days, none inside 24 h.
  FOR n IN 1..10 LOOP
    INSERT INTO course_imports (user_id, format, title, slug, level, status, created_at, finished_at, usage)
    VALUES (tm, 'pdf', 'M', 'month-' || n, 'B1', 'done', now() - make_interval(days => 2 + n), now(), '[{"inputTokens":1}]'::jsonb);
  END LOOP;
  PERFORM pg_temp.put_object(tm || '/1.pdf');
  PERFORM pg_temp.check_eq('with ten counted imports in 30 days the next is refused with PT429',
    pg_temp.create_import(tm, tm || '/1.pdf', 'month-x'), 'ERR:PT429');
  DELETE FROM course_imports WHERE slug = 'month-10';
  PERFORM pg_temp.check_eq('...with nine it is accepted (positive control)',
    pg_temp.create_import(tm, tm || '/1.pdf', 'month-x'), 'ok');

  -- Admins are exempt.
  FOR n IN 1..5 LOOP
    PERFORM pg_temp.put_object(a || '/adm-' || n || '.pdf');
  END LOOP;
  PERFORM pg_temp.check_eq('an admin can start five imports in a day (exempt)',
    pg_temp.create_import(a, a || '/adm-1.pdf', 'adm-1') || '/' || pg_temp.create_import(a, a || '/adm-2.pdf', 'adm-2')
      || '/' || pg_temp.create_import(a, a || '/adm-3.pdf', 'adm-3') || '/' || pg_temp.create_import(a, a || '/adm-4.pdf', 'adm-4')
      || '/' || pg_temp.create_import(a, a || '/adm-5.pdf', 'adm-5'), 'ok/ok/ok/ok/ok');
  PERFORM pg_temp.check_eq('...and the five rows exist',
    (SELECT count(*)::text FROM course_imports WHERE user_id = a), '5');

  -- The remaining sections seed rows directly, which the caps trigger would count: it is switched
  -- off here (inside this rolled-back transaction) now that every cap assertion has run.
  ALTER TABLE course_imports DISABLE TRIGGER course_import_caps;

  -- 6. The step functions ----------------------------------------------------------
  PERFORM pg_temp.check_eq('claim: the first claim of a pending import succeeds',
    (SELECT (course_import_claim(imp, 60))->>'claimed'), 'true');
  PERFORM pg_temp.check_eq('claim: a different pending import is claimable independently',
    (SELECT (course_import_claim(id, 60))->>'claimed' FROM course_imports WHERE slug = 'imp-docx'), 'true');
  PERFORM pg_temp.check_eq('claim: a second claim while the lease is live is refused',
    (SELECT (course_import_claim(imp, 60))->>'claimed'), 'false');
  PERFORM pg_temp.check_eq('release lets go of the lease',
    (SELECT course_import_release(imp)::text), 'true');
  PERFORM pg_temp.check_eq('claim: after the release it succeeds again',
    (SELECT (course_import_claim(imp, 60))->'row'->>'status'), 'pending');
  UPDATE course_imports SET lease_until = now() - interval '1 second' WHERE id = imp;
  PERFORM pg_temp.check_eq('claim: an expired lease is claimed again',
    (SELECT (course_import_claim(imp, 60))->>'claimed'), 'true');
  PERFORM pg_temp.check_eq('claim: an unknown import is "missing"',
    (SELECT (course_import_claim(gen_random_uuid(), 60))->>'status'), 'missing');

  PERFORM pg_temp.check_eq('advance: pending -> planning stores the plan and the file id',
    (SELECT course_import_advance(imp, 'planning', '{"plan":{"lessons":[]},"anthropic_file_id":"file_1","model":"m1","prompt_version":"v1"}'::jsonb)::text), 'true');
  PERFORM pg_temp.check_eq('...the row has them',
    (SELECT (plan IS NOT NULL)::text || '/' || anthropic_file_id || '/' || model || '/' || status FROM course_imports WHERE id = imp),
    'true/file_1/m1/planning');
  PERFORM pg_temp.check_eq('advance: planning -> drafting with one lesson sets lessons_done = 1',
    (SELECT course_import_advance(imp, 'drafting', jsonb_build_object('lessons', jsonb_build_array(jsonb_build_object('slug', 'one'))))::text), 'true');
  PERFORM pg_temp.check_eq('...lessons_done is 1',
    (SELECT lessons_done::text FROM course_imports WHERE id = imp), '1');
  PERFORM pg_temp.check_eq('advance: the lessons array cannot shrink (refused)',
    (SELECT course_import_advance(imp, 'drafting', '{"lessons":[]}'::jsonb)::text), 'false');
  PERFORM pg_temp.check_eq('...and still holds the one lesson',
    (SELECT lessons_done::text FROM course_imports WHERE id = imp), '1');
  PERFORM pg_temp.check_eq('advance: it cannot move backwards (drafting -> planning refused)',
    (SELECT course_import_advance(imp, 'planning', '{}'::jsonb)::text), 'false');
  PERFORM pg_temp.check_eq('...the status is still drafting',
    (SELECT status FROM course_imports WHERE id = imp), 'drafting');
  PERFORM pg_temp.check_eq('advance: a null clears the Anthropic file id',
    (SELECT course_import_advance(imp, 'drafting', '{"anthropic_file_id":null}'::jsonb)::text), 'true');
  PERFORM pg_temp.check_eq('...it is null; the plan and the lesson stayed',
    (SELECT (anthropic_file_id IS NULL)::text || '/' || (plan IS NOT NULL)::text || '/' || lessons_done::text FROM course_imports WHERE id = imp),
    'true/true/1');
  PERFORM pg_temp.check_eq('advance: "done" is not a step (raises)',
    (SELECT CASE WHEN pg_temp.as_service(format('SELECT public.course_import_advance(%L, ''done'', ''{}''::jsonb)::text', imp)) = 'ERR:P0001' THEN 'raised' ELSE 'no' END), 'raised');

  PERFORM pg_temp.check_eq('cleaned: leaves a running import alone (0 rows)',
    (SELECT course_import_cleaned(ARRAY[imp])::text), '0');
  PERFORM pg_temp.check_eq('fail: ends the import with the code',
    (SELECT course_import_fail(imp, 'llm_refusal')::text), 'true');
  PERFORM pg_temp.check_eq('...failed, with failure and finished_at',
    (SELECT status || '/' || failure || '/' || (finished_at IS NOT NULL)::text FROM course_imports WHERE id = imp), 'failed/llm_refusal/true');
  PERFORM pg_temp.check_eq('...a terminal row cannot be advanced',
    (SELECT course_import_advance(imp, 'committing', '{}'::jsonb)::text), 'false');
  PERFORM pg_temp.check_eq('...cannot be claimed',
    (SELECT (course_import_claim(imp, 60))->>'claimed'), 'false');
  PERFORM pg_temp.check_eq('...cannot be failed twice',
    (SELECT course_import_fail(imp, 'again')::text), 'false');
  PERFORM pg_temp.check_eq('cleaned: clears the object name on a terminal row (1 row)',
    (SELECT course_import_cleaned(ARRAY[imp])::text), '1');
  PERFORM pg_temp.check_eq('...the object name is gone',
    (SELECT (object_name IS NULL)::text FROM course_imports WHERE id = imp), 'true');

  -- 7. course_import_commit ------------------------------------------------------
  PERFORM pg_temp.put_object(tg || '/c1.pdf');
  PERFORM pg_temp.put_object(tg || '/c2.pdf');
  -- tg's daily window is full; use rows inserted directly for the commit tests.
  INSERT INTO course_imports (user_id, format, object_name, title, slug, level, status)
    VALUES (tg, 'pdf', tg || '/c1.pdf', 'Committed course', 'commit-ok', 'B2', 'committing')
    RETURNING id INTO i1;
  PERFORM pg_temp.check_eq('commit: an import that is not at the committing step: wrong_state',
    (SELECT (course_import_commit(id, jsonb_build_object('lessons', two)))->>'error' FROM course_imports WHERE slug = 'imp-docx'), 'wrong_state');

  r := course_import_commit(i1, jsonb_build_object('subtitle', 'Sub', 'description', 'Desc', 'qa', '{"notes":["n"]}'::jsonb, 'lessons', two));
  PERFORM pg_temp.check_eq('commit: a granted, active owner commits (positive control)', r->>'ok', 'true');
  cid := (r->>'course_id')::uuid;
  PERFORM pg_temp.check_eq('...a draft course, authored by the owner, with the title, slug and level they typed',
    (SELECT status || '/' || (author_id = tg)::text || '/' || title || '/' || slug || '/' || level || '/' || subtitle FROM courses WHERE id = cid),
    'draft/true/Committed course/commit-ok/B2/Sub');
  PERFORM pg_temp.check_eq('...not listed',
    (SELECT listed::text FROM courses WHERE id = cid), 'false');
  PERFORM pg_temp.check_eq('...the owner is an editor of it',
    (SELECT count(*)::text FROM course_editors WHERE course_id = cid AND user_id = tg), '1');
  PERFORM pg_temp.check_eq('...two lessons in order with the file''s slugs',
    (SELECT string_agg(ordinal::text || '=' || slug, ',' ORDER BY ordinal) FROM lessons WHERE course_id = cid), '1=one,2=two');
  PERFORM pg_temp.check_eq('...metadata carried: description and minutes on the first, none on the second',
    (SELECT string_agg(COALESCE(description, '-') || ':' || COALESCE(estimated_minutes::text, '-'), ',' ORDER BY ordinal) FROM lessons WHERE course_id = cid),
    'First:12,-:-');
  PERFORM pg_temp.check_eq('...one version per lesson, source import, created by the owner',
    (SELECT count(*)::text || '/' || bool_and(v.source = 'import')::text || '/' || bool_and(v.created_by = tg)::text
       FROM lesson_versions v JOIN lessons l ON l.id = v.lesson_id WHERE l.course_id = cid), '2/true/true');
  PERFORM pg_temp.check_eq('...nothing is published',
    (SELECT count(*)::text FROM lessons WHERE course_id = cid AND published_version_id IS NOT NULL), '0');
  PERFORM pg_temp.check_eq('...(guard: both lessons exist, so the zero above is not an empty set)',
    (SELECT count(*)::text FROM lessons WHERE course_id = cid), '2');
  PERFORM pg_temp.check_eq('...the import is done, with the course id and the QA',
    (SELECT status || '/' || (course_id = cid)::text || '/' || (qa->'notes'->>0) FROM course_imports WHERE id = i1), 'done/true/n');

  -- Refusals: nothing may be created.
  INSERT INTO course_imports (user_id, format, title, slug, level, status) VALUES (tu, 'pdf', 'T', 'commit-tu', 'B1', 'committing') RETURNING id INTO i2;
  INSERT INTO course_imports (user_id, format, title, slug, level, status) VALUES (tl, 'pdf', 'T', 'commit-tl', 'B1', 'committing') RETURNING id INTO i3;
  PERFORM pg_temp.check_eq('commit: an owner without the grant: forbidden',
    (course_import_commit(i2, jsonb_build_object('lessons', two)))->>'error', 'forbidden');
  PERFORM pg_temp.check_eq('commit: an owner whose granted seat has lapsed: seat_lapsed',
    (course_import_commit(i3, jsonb_build_object('lessons', two)))->>'error', 'seat_lapsed');
  PERFORM pg_temp.check_eq('...neither created a course (and a course WAS created above, so the count can be non-zero)',
    (SELECT count(*)::text FROM courses WHERE slug IN ('commit-tu', 'commit-tl')) || '/' || (SELECT count(*)::text FROM courses WHERE slug = 'commit-ok'), '0/1');

  -- The grant revoked after the import started.
  INSERT INTO course_imports (user_id, format, title, slug, level, status) VALUES (tg, 'pdf', 'T', 'commit-rev', 'B1', 'committing') RETURNING id INTO i4;
  PERFORM pg_temp.as_user(a, format('SELECT (public.set_author_seat_import(%L, false))->>''ok''', tg));
  PERFORM pg_temp.check_eq('commit: the grant was revoked while the import ran: forbidden',
    (course_import_commit(i4, jsonb_build_object('lessons', two)))->>'error', 'forbidden');
  PERFORM pg_temp.check_eq('...no course',
    (SELECT count(*)::text FROM courses WHERE slug = 'commit-rev'), '0');
  PERFORM pg_temp.as_user(a, format('SELECT (public.set_author_seat_import(%L, true))->>''ok''', tg));
  PERFORM pg_temp.check_eq('...grant restored: the same commit succeeds (positive control)',
    (course_import_commit(i4, jsonb_build_object('lessons', two)))->>'ok', 'true');

  -- Bad payloads.
  INSERT INTO course_imports (user_id, format, title, slug, level, status) VALUES (tg, 'pdf', 'T', 'commit-bad', 'B1', 'committing') RETURNING id INTO i1;
  PERFORM pg_temp.check_eq('commit: no lessons: invalid_course',
    (course_import_commit(i1, '{"lessons":[]}'::jsonb))->>'error', 'invalid_course');
  PERFORM pg_temp.check_eq('commit: a duplicate lesson slug: invalid_course',
    (course_import_commit(i1, jsonb_build_object('lessons', jsonb_build_array(two->0, two->0))))->>'error', 'invalid_course');
  PERFORM pg_temp.check_eq('commit: a document that is not an array: invalid_course',
    (course_import_commit(i1, '{"lessons":[{"slug":"a","title":"A","document":{}}]}'::jsonb))->>'error', 'invalid_course');
  PERFORM pg_temp.check_eq('commit: a bad lesson slug: invalid_course',
    (course_import_commit(i1, '{"lessons":[{"slug":"Bad Slug","title":"A","document":[]}]}'::jsonb))->>'error', 'invalid_course');
  PERFORM pg_temp.check_eq('commit: more than twelve lessons: invalid_course',
    (course_import_commit(i1, jsonb_build_object('lessons', (SELECT jsonb_agg(jsonb_build_object('slug', 'l' || g, 'title', 'L', 'document', '[]'::jsonb)) FROM generate_series(1, 13) g))))->>'error',
    'invalid_course');
  PERFORM pg_temp.check_eq('...none of those created a course',
    (SELECT count(*)::text FROM courses WHERE slug = 'commit-bad'), '0');
  INSERT INTO courses (slug, title, level, status) VALUES ('commit-bad', 'Taken meanwhile', 'B1', 'draft');
  PERFORM pg_temp.check_eq('commit: the slug was taken while the job ran: slug_taken',
    (course_import_commit(i1, jsonb_build_object('lessons', two)))->>'error', 'slug_taken');
  PERFORM pg_temp.check_eq('...and the course taken meanwhile has no lessons from this import',
    (SELECT count(*)::text FROM lessons l JOIN courses c ON c.id = l.course_id WHERE c.slug = 'commit-bad'), '0');
  PERFORM pg_temp.check_eq('...the import is still at committing (the job can fail it with the reason)',
    (SELECT status FROM course_imports WHERE id = i1), 'committing');

  -- An admin gets the course and no editor row.
  INSERT INTO course_imports (user_id, format, title, slug, level, status) VALUES (a, 'pdf', 'T', 'commit-admin', 'B1', 'committing') RETURNING id INTO i2;
  r := course_import_commit(i2, jsonb_build_object('lessons', two));
  PERFORM pg_temp.check_eq('commit: an admin''s import is committed', r->>'ok', 'true');
  PERFORM pg_temp.check_eq('...with no course_editors row (admins edit everything), authored by the admin',
    (SELECT count(*)::text FROM course_editors WHERE course_id = (r->>'course_id')::uuid) || '/' ||
    (SELECT (author_id = a)::text FROM courses WHERE id = (r->>'course_id')::uuid), '0/true');

  -- 8. The sweep ------------------------------------------------------------------
  UPDATE course_imports SET created_at = now() WHERE slug = 'cap-2';
  INSERT INTO course_imports (user_id, format, object_name, title, slug, level, status, created_at)
    VALUES (tg, 'pdf', tg || '/c2.pdf', 'Old', 'sweep-old', 'B1', 'drafting', now() - interval '2 days') RETURNING id INTO i1;
  INSERT INTO course_imports (user_id, format, title, slug, level, status, created_at)
    VALUES (tg, 'pdf', 'Young', 'sweep-young', 'B1', 'drafting', now() - interval '1 hour') RETURNING id INTO i2;
  INSERT INTO course_imports (user_id, format, object_name, anthropic_file_id, title, slug, level, status, created_at, finished_at)
    VALUES (tg, 'pdf', tg || '/left.pdf', 'file_left', 'Left', 'sweep-left', 'B1', 'failed', now() - interval '3 hours', now() - interval '2 hours') RETURNING id INTO i3;
  INSERT INTO course_imports (user_id, format, object_name, anthropic_file_id, title, slug, level, status, created_at, finished_at)
    VALUES (tg, 'pdf', tg || '/fresh.pdf', 'file_fresh', 'Fresh', 'sweep-fresh', 'B1', 'done', now(), now()) RETURNING id INTO i4;
  PERFORM pg_temp.put_object(tg || '/orphan.pdf', INTERVAL '2 days');
  PERFORM pg_temp.put_object(tg || '/recent-orphan.pdf', INTERVAL '1 hour');
  PERFORM pg_temp.put_object(tg || '/left.pdf', INTERVAL '3 days');
  r := course_import_sweep();
  PERFORM pg_temp.check_eq('sweep: one import older than 24 h was failed (swept = 1)', r->>'swept', '1');
  PERFORM pg_temp.check_eq('...it is failed with "timeout"; the young one is untouched (positive control)',
    (SELECT status || '/' || failure FROM course_imports WHERE id = i1) || '|' || (SELECT status FROM course_imports WHERE id = i2),
    'failed/timeout|drafting');
  PERFORM pg_temp.check_eq('...the finished row that still names a copy is a leftover; the one finished a moment ago is not',
    (SELECT string_agg(e->>'anthropic_file_id', ',' ORDER BY e->>'anthropic_file_id') FROM jsonb_array_elements(r->'leftovers') e
       WHERE e->>'anthropic_file_id' IN ('file_left', 'file_fresh')), 'file_left');
  PERFORM pg_temp.check_eq('...an old object no row names is an orphan',
    ((r->'orphans') @> jsonb_build_array(tg || '/orphan.pdf'))::text, 'true');
  PERFORM pg_temp.check_eq('...a recent object is not, and neither is an old one that a row still names',
    ((r->'orphans') @> jsonb_build_array(tg || '/recent-orphan.pdf'))::text || '/' || ((r->'orphans') @> jsonb_build_array(tg || '/left.pdf'))::text, 'false/false');

  -- 9. Deleting the account ---------------------------------------------------------
  INSERT INTO course_imports (user_id, format, object_name, anthropic_file_id, title, slug, level, status)
    VALUES (tg, 'pdf', tg || '/running.pdf', 'file_running', 'Running', 'del-running', 'B1', 'drafting');
  PERFORM pg_temp.put_object(tg || '/running.pdf');
  PERFORM pg_temp.check_eq('before: tg has import rows (guards the zero below) and tc has some too',
    ((SELECT count(*) FROM course_imports WHERE user_id = tg) > 0)::text || '/' || ((SELECT count(*) FROM course_imports WHERE user_id = tc) > 0)::text, 'true/true');
  r := pg_temp.as_user(tg, 'SELECT public.delete_my_account()::text')::jsonb;
  PERFORM pg_temp.check_eq('delete_my_account: ok', r->>'ok', 'true');
  PERFORM pg_temp.check_eq('...it names the bucket objects still held (the running upload)',
    ((r->'import_objects') @> jsonb_build_array(tg || '/running.pdf'))::text, 'true');
  PERFORM pg_temp.check_eq('...and the Anthropic files (file_running)',
    ((r->'import_files') @> jsonb_build_array('file_running'))::text, 'true');
  PERFORM pg_temp.check_eq('...every one of the caller''s import rows is gone',
    (SELECT count(*)::text FROM course_imports WHERE user_id = tg), '0');
  PERFORM pg_temp.check_eq('...and nobody else''s are touched (tc, positive control)',
    ((SELECT count(*) FROM course_imports WHERE user_id = tc) > 0)::text, 'true');
  PERFORM pg_temp.check_eq('...the courses their imports created stay (authored content, anonymised author)',
    (SELECT count(*)::text FROM courses WHERE slug = 'commit-ok'), '1');

  RAISE NOTICE 'CNT-018 PASS: 103 full protocol';
END;
$$;

ROLLBACK;
