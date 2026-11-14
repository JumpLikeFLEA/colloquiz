-- ============================================================
-- supabase/verify/110_carried_lesson_answers.sql
--
-- PLAY-021 full protocol for migration 110 (needs 041, 048). NOT a migration:
-- run after 110 is applied, as postgres. Seeds its own data and ROLLS BACK.
-- Failure aborts with "PLAY-021 FAIL: ...". Every denial is paired with a
-- positive control proving the rows it would hide exist.
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

-- A session with role authenticated but no sub claim: auth.uid() is NULL.
CREATE FUNCTION pg_temp.as_no_uid(p_sql TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  EXECUTE p_sql INTO v;
  PERFORM set_config('role', 'postgres', true);
  RETURN v;
END;
$$;

-- An anon session: returns 'denied' when EXECUTE is refused.
CREATE FUNCTION pg_temp.as_anon(p_sql TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  PERFORM set_config('role', 'anon', true);
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN insufficient_privilege THEN
    v := 'denied';
  END;
  PERFORM set_config('role', 'postgres', true);
  RETURN v;
END;
$$;

CREATE FUNCTION pg_temp.check_eq(p_label TEXT, p_got TEXT, p_want TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE '% -> got % (want %)', p_label, p_got, p_want;
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'PLAY-021 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

DO $$
DECLARE
  s UUID := gen_random_uuid();   -- the learner: attempts on v1
  b UUID := gen_random_uuid();   -- another learner: own attempt on v1
  n UUID := gen_random_uuid();   -- signed in, no attempts
  v_c UUID; v_l UUID; v_l2 UUID; v_v1 UUID; v_v2 UUID; v_draft UUID; v_o UUID;
  v_doc1 JSONB; v_doc2 JSONB;
  q TEXT;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (s, 'authenticated', 'authenticated', 's-' || s || '@verify.test'),
    (b, 'authenticated', 'authenticated', 'b-' || b || '@verify.test'),
    (n, 'authenticated', 'authenticated', 'n-' || n || '@verify.test');

  -- v1: ex1, ex2, ex3 (ex3 with an authoring note).
  v_doc1 := jsonb_build_array(
    jsonb_build_object('id', 'th1', 'kind', 'theory', 'type', 'paragraph'),
    jsonb_build_object('id', 'ex1', 'kind', 'practice', 'type', 'selection', 'payload', jsonb_build_object('prompt', 'One')),
    jsonb_build_object('id', 'ex2', 'kind', 'practice', 'type', 'selection', 'payload', jsonb_build_object('prompt', 'Two')),
    jsonb_build_object('id', 'ex3', 'kind', 'practice', 'type', 'selection', 'payload', jsonb_build_object('prompt', 'Three'), 'convertedFrom', 'old note'));
  -- v2 (the republish): ex1 unchanged (keys in another order), ex2 CHANGED,
  -- ex3 unchanged apart from its authoring note, theory edited.
  v_doc2 := jsonb_build_array(
    jsonb_build_object('id', 'th1', 'kind', 'theory', 'type', 'paragraph', 'text', 'edited'),
    jsonb_build_object('payload', jsonb_build_object('prompt', 'One'), 'type', 'selection', 'kind', 'practice', 'id', 'ex1'),
    jsonb_build_object('id', 'ex2', 'kind', 'practice', 'type', 'selection', 'payload', jsonb_build_object('prompt', 'Two, changed')),
    jsonb_build_object('id', 'ex3', 'kind', 'practice', 'type', 'selection', 'payload', jsonb_build_object('prompt', 'Three')));

  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v110', 'C', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO v_c;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_c, 1, 'L1', 'l1', 'anyone') RETURNING id INTO v_l;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_c, 2, 'L2', 'l2', 'anyone') RETURNING id INTO v_l2;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_l, v_doc1, 'editor') RETURNING id INTO v_v1;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_l, v_doc2, 'editor') RETURNING id INTO v_v2;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_l, v_doc2, 'editor') RETURNING id INTO v_draft;
  -- Another lesson whose document holds v2's ex2 exactly: an attempt there must not carry.
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_l2, v_doc2, 'editor') RETURNING id INTO v_o;
  UPDATE lessons SET published_version_id = v_v2 WHERE id = v_l;
  UPDATE lessons SET published_version_id = v_o WHERE id = v_l2;

  INSERT INTO lesson_attempts (id, user_id, lesson_version_id, block_id, earned, possible, created_at) VALUES
    (gen_random_uuid(), s, v_v1, 'ex1', 0, 1, now() - interval '3 hours'),
    (gen_random_uuid(), s, v_v1, 'ex1', 1, 1, now() - interval '2 hours'),
    (gen_random_uuid(), s, v_v1, 'ex2', 1, 1, now() - interval '2 hours'),
    (gen_random_uuid(), s, v_v1, 'ex3', 1, 2, now() - interval '2 hours'),
    (gen_random_uuid(), s, v_o,  'ex2', 1, 1, now() - interval '1 hour'),
    (gen_random_uuid(), b, v_v1, 'ex1', 1, 2, now() - interval '1 hour');

  PERFORM pg_temp.check_eq('seed: 6 attempts exist (table is not empty)',
    (SELECT count(*)::text FROM lesson_attempts WHERE user_id IN (s, b)), '6');
  PERFORM pg_temp.check_eq('seed: s has an attempt on the CHANGED ex2 of v1 (the row a denial below hides)',
    (SELECT count(*)::text FROM lesson_attempts WHERE user_id = s AND lesson_version_id = v_v1 AND block_id = 'ex2'), '1');

  q := format($q$ SELECT coalesce(string_agg(block_id || ':' || earned || '/' || possible, ',' ORDER BY block_id), '') FROM public.carried_lesson_answers(%L) $q$, v_v2);

  -- 1. the caller on the published republish --------------------------------------
  PERFORM pg_temp.check_eq('s on v2: unchanged ex1 (best 1/1) and ex3 (note ignored) carried; changed ex2 not',
    pg_temp.as_user(s, q), 'ex1:1/1,ex3:1/2');
  PERFORM pg_temp.check_eq('s on v2: the changed ex2 is not returned',
    pg_temp.as_user(s, format($q$ SELECT count(*)::text FROM public.carried_lesson_answers(%L) WHERE block_id = 'ex2' $q$, v_v2)), '0');
  PERFORM pg_temp.check_eq('the result has three columns only: no document, no block',
    (SELECT count(*)::text FROM information_schema.parameters p JOIN information_schema.routines r ON r.specific_name = p.specific_name
      WHERE r.routine_name = 'carried_lesson_answers' AND p.parameter_mode = 'OUT'), '3');

  -- 2. another user's rows ----------------------------------------------------------
  PERFORM pg_temp.check_eq('b on v2: only b''s own ex1 (1/2), positive control for b',
    pg_temp.as_user(b, q), 'ex1:1/2');
  PERFORM pg_temp.check_eq('n (signed in, no attempts) on v2: nothing, though s and b have rows',
    pg_temp.as_user(n, q), '');

  -- 3. anonymous ---------------------------------------------------------------------
  PERFORM pg_temp.check_eq('positive control beside anon: s gets 2 rows',
    pg_temp.as_user(s, format($q$ SELECT count(*)::text FROM public.carried_lesson_answers(%L) $q$, v_v2)), '2');
  PERFORM pg_temp.check_eq('anon role: EXECUTE refused',
    pg_temp.as_anon(format($q$ SELECT count(*)::text FROM public.carried_lesson_answers(%L) $q$, v_v2)), 'denied');
  PERFORM pg_temp.check_eq('anon has no EXECUTE privilege',
    (SELECT has_function_privilege('anon', 'public.carried_lesson_answers(uuid)', 'EXECUTE'))::text, 'false');
  PERFORM pg_temp.check_eq('authenticated with no auth.uid(): nothing',
    pg_temp.as_no_uid(format($q$ SELECT count(*)::text FROM public.carried_lesson_answers(%L) $q$, v_v2)), '0');

  -- 4. only the published version is a valid input ---------------------------------------
  PERFORM pg_temp.check_eq('s on the superseded v1: nothing (v2 above is the positive control)',
    pg_temp.as_user(s, format($q$ SELECT count(*)::text FROM public.carried_lesson_answers(%L) $q$, v_v1)), '0');
  PERFORM pg_temp.check_eq('s on an unpublished draft with v2''s document: nothing',
    pg_temp.as_user(s, format($q$ SELECT count(*)::text FROM public.carried_lesson_answers(%L) $q$, v_draft)), '0');

  -- 5. another lesson's identical block does not carry -----------------------------------
  PERFORM pg_temp.check_eq('s on L2 (holds v2''s ex2, attempted on L2 itself): nothing carried from L1',
    pg_temp.as_user(s, format($q$ SELECT count(*)::text FROM public.carried_lesson_answers(%L) $q$, v_o)), '0');

  -- 6. attempts on the played version are not returned (the 048 read has them) -------------
  INSERT INTO lesson_attempts (id, user_id, lesson_version_id, block_id, earned, possible) VALUES
    (gen_random_uuid(), s, v_v2, 'ex2', 1, 1);
  PERFORM pg_temp.check_eq('s on v2 after answering ex2 on v2: still not returned here',
    pg_temp.as_user(s, q), 'ex1:1/1,ex3:1/2');

  RAISE NOTICE 'PLAY-021 PASS: carried_lesson_answers';
END;
$$;

ROLLBACK;
