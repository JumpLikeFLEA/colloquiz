-- ============================================================
-- supabase/verify/098_voice_analysis_retention.sql
--
-- VOICE-016 full protocol for migration 098 (needs everything through 097). NOT a
-- migration: run after 098 is applied, as postgres. Seeds its own data and ROLLS BACK.
-- A failed assertion aborts with "VOICE-016 FAIL: ...". Every denial is paired with a
-- positive control: the same call by a caller who may, or on a row where it works.
-- Counts before and after are printed as NOTICEs.
--
-- Learners: a (self-paced take 7 months old, analysis done), b (take whose ledger row is
-- 7 months old while its analysis lives), c (analysis withdrawn), d (erased).
-- Course CS: self-paced, lesson LA, voice block vt1.
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
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('role', 'postgres', true);
  RETURN 'ERR:' || SQLSTATE;
END;
$$;

CREATE FUNCTION pg_temp.as_service(p_sql TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  PERFORM set_config('role', 'service_role', true);
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

CREATE TEMP TABLE pg_temp.tally (n INTEGER NOT NULL);
INSERT INTO pg_temp.tally VALUES (0);

CREATE FUNCTION pg_temp.check_eq(p_label TEXT, p_got TEXT, p_want TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE pg_temp.tally SET n = n + 1;
  RAISE NOTICE '% -> got % (want %)', p_label, p_got, p_want;
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'VOICE-016 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

CREATE FUNCTION pg_temp.put_object(p_course UUID, p_user UUID, p_sub UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v_name TEXT := p_course::text || '/' || p_user::text || '/' || p_sub::text || '.webm';
BEGIN
  INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
  VALUES ('voice-recordings', v_name, p_user::text, '{"mimetype":"audio/webm","size":1234}'::jsonb);
  RETURN v_name;
END;
$$;

-- submit_voice_recording as p_user: 'ok:<analysed>' or the RPC's error / 'ERR:<sqlstate>'.
CREATE FUNCTION pg_temp.send(p_user UUID, p_course UUID, p_lesson UUID, p_sub UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_obj TEXT;
  r     JSONB;
BEGIN
  v_obj := pg_temp.put_object(p_course, p_user, p_sub);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT public.submit_voice_recording(p_sub, p_lesson, 'vt1', v_obj) INTO r;
  PERFORM set_config('role', 'postgres', true);
  RETURN CASE WHEN r->>'ok' = 'true' THEN 'ok:' || (r->>'analysed') ELSE r->>'error' END;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('role', 'postgres', true);
  RETURN 'ERR:' || SQLSTATE;
END;
$$;

-- voice_analysis_finish as the service role: 'true' when the analysis was finished.
CREATE FUNCTION pg_temp.finish_t(p_sub UUID, p_transcript TEXT)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT pg_temp.as_service(format(
    $q$ SELECT public.voice_analysis_finish(%L, %L, '{"mainError":{"quote":"x"}}'::jsonb, 'first', 'first-v0', 'claude-test', '{"in":1}'::jsonb)::text $q$,
    p_sub, p_transcript));
$$;

DO $$
DECLARE
  u_a UUID := gen_random_uuid();  u_b UUID := gen_random_uuid();
  u_c UUID := gen_random_uuid();  u_d UUID := gen_random_uuid();
  cs UUID; la UUID; va UUID;
  doc JSONB := '[{"id":"vt1","kind":"task","type":"voice","prompt":{"paragraphs":[{"runs":[{"text":"Say it"}]}],"maxSeconds":60}}]';
  sa UUID := gen_random_uuid();  sb UUID := gen_random_uuid();
  sc UUID := gen_random_uuid();  sd UUID := gen_random_uuid();
  obj_a TEXT;  obj_b TEXT;
BEGIN
  INSERT INTO auth.users (id, aud, role, email)
  SELECT x, 'authenticated', 'authenticated', 'v98-' || x || '@verify.test'
  FROM unnest(ARRAY[u_a, u_b, u_c, u_d]) x;

  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v98-cs', 'CS', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO cs;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cs, 1, 'LA', 'la', 'anyone') RETURNING id INTO la;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (la, doc, 'editor') RETURNING id INTO va;
  UPDATE lessons SET published_version_id = va WHERE id = la;

  PERFORM pg_temp.check_eq('seed: one course, one published lesson, four learners',
    (SELECT count(*)::text FROM courses WHERE slug = 'v98-cs') || '/' ||
    (SELECT count(*)::text FROM lessons WHERE id = la AND published_version_id IS NOT NULL) || '/' ||
    (SELECT count(*)::text FROM auth.users WHERE email LIKE 'v98-%@verify.test'), '1/1/4');

  -- Four sends, each analysed, each with a finished analysis and a transcript.
  PERFORM pg_temp.check_eq('a sends', pg_temp.send(u_a, cs, la, sa), 'ok:true');
  PERFORM pg_temp.check_eq('b sends', pg_temp.send(u_b, cs, la, sb), 'ok:true');
  PERFORM pg_temp.check_eq('c sends', pg_temp.send(u_c, cs, la, sc), 'ok:true');
  PERFORM pg_temp.check_eq('d sends', pg_temp.send(u_d, cs, la, sd), 'ok:true');
  PERFORM pg_temp.check_eq('finish a', pg_temp.finish_t(sa, 'transcript of a'), 'true');
  PERFORM pg_temp.check_eq('finish b', pg_temp.finish_t(sb, 'transcript of b'), 'true');
  PERFORM pg_temp.check_eq('finish c', pg_temp.finish_t(sc, 'transcript of c'), 'true');
  PERFORM pg_temp.check_eq('finish d', pg_temp.finish_t(sd, 'transcript of d'), 'true');
  -- c's analysis is withdrawn by an author (seeded directly: hide_voice_analysis is 096's).
  UPDATE voice_analyses SET hidden_at = now() WHERE submission_id = sc;

  PERFORM pg_temp.check_eq('seed: four done analyses, one withdrawn',
    (SELECT count(*)::text FROM voice_analyses WHERE submission_id IN (sa, sb, sc, sd) AND status = 'done') || '/' ||
    (SELECT count(*)::text FROM voice_analyses WHERE submission_id IN (sa, sb, sc, sd) AND hidden_at IS NOT NULL), '4/1');

  -- ── 1. Static facts ----------------------------------------------------------
  PERFORM pg_temp.check_eq('my_voice_analyses_export: authenticated yes [positive control], anon no',
    has_function_privilege('authenticated', 'public.my_voice_analyses_export()', 'EXECUTE')::text || '/' ||
    has_function_privilege('anon', 'public.my_voice_analyses_export()', 'EXECUTE')::text, 'true/false');
  PERFORM pg_temp.check_eq('voice_purge_ledger / voice_mark_removed: service_role yes [positive control]',
    has_function_privilege('service_role', 'public.voice_purge_ledger(timestamptz)', 'EXECUTE')::text || '/' ||
    has_function_privilege('service_role', 'public.voice_mark_removed(text[])', 'EXECUTE')::text, 'true/true');
  PERFORM pg_temp.check_eq('voice_purge_ledger / voice_mark_removed: authenticated no, anon no',
    has_function_privilege('authenticated', 'public.voice_purge_ledger(timestamptz)', 'EXECUTE')::text || '/' ||
    has_function_privilege('authenticated', 'public.voice_mark_removed(text[])', 'EXECUTE')::text || '/' ||
    has_function_privilege('anon', 'public.voice_purge_ledger(timestamptz)', 'EXECUTE')::text || '/' ||
    has_function_privilege('anon', 'public.voice_mark_removed(text[])', 'EXECUTE')::text, 'false/false/false/false');
  PERFORM pg_temp.check_eq('a user session calling voice_purge_ledger is refused (42501)',
    pg_temp.as_user(u_a, 'SELECT public.voice_purge_ledger()::text'), 'ERR:42501');
  PERFORM pg_temp.check_eq('a user session calling voice_mark_removed is refused (42501)',
    pg_temp.as_user(u_a, $q$ SELECT public.voice_mark_removed(ARRAY['x'])::text $q$), 'ERR:42501');

  -- ── 2. Export ---------------------------------------------------------------
  PERFORM pg_temp.check_eq('a exports exactly their own analysis, with the transcript',
    pg_temp.as_user(u_a, $q$ SELECT count(*)::text || '/' || min(transcript) FROM public.my_voice_analyses_export() $q$),
    '1/transcript of a');
  PERFORM pg_temp.check_eq('b exports exactly their own analysis (not a''s)',
    pg_temp.as_user(u_b, $q$ SELECT count(*)::text || '/' || min(transcript) FROM public.my_voice_analyses_export() $q$),
    '1/transcript of b');
  PERFORM pg_temp.check_eq('c''s withdrawn analysis is hidden from c''s own table read [the contrast]',
    pg_temp.as_user(u_c, 'SELECT count(*)::text FROM public.voice_analyses'), '0');
  PERFORM pg_temp.check_eq('c''s export still carries the withdrawn analysis, marked withdrawn',
    pg_temp.as_user(u_c, $q$ SELECT count(*)::text || '/' || (min(hidden_at) IS NOT NULL)::text || '/' || min(transcript) FROM public.my_voice_analyses_export() $q$),
    '1/true/transcript of c');
  PERFORM pg_temp.check_eq('anon calling the export is refused (42501)',
    pg_temp.as_anon('SELECT count(*)::text FROM public.my_voice_analyses_export()'), 'ERR:42501');
  PERFORM pg_temp.check_eq('a caller with no analysis exports an empty list (the stranger)',
    pg_temp.as_user(gen_random_uuid(), 'SELECT count(*)::text FROM public.my_voice_analyses_export()'), '0');

  -- ── 3. The purge removes audio, transcript and analysis together -------------
  SELECT object_name INTO obj_a FROM voice_submissions WHERE id = sa;
  SELECT object_name INTO obj_b FROM voice_submissions WHERE id = sb;
  UPDATE voice_submissions SET submitted_at = now() - INTERVAL '7 months' WHERE id = sa;

  PERFORM pg_temp.check_eq('voice_purge_due lists a''s 7-month-old take and not b''s young one',
    (SELECT count(*)::text FROM voice_purge_due() WHERE object_name = obj_a AND reason = 'retention') || '/' ||
    (SELECT count(*)::text FROM voice_purge_due() WHERE object_name = obj_b), '1/0');
  RAISE NOTICE 'before the purge (a, b): takes with audio %, analyses %, transcripts %',
    (SELECT count(*) FROM voice_submissions WHERE id IN (sa, sb) AND object_name IS NOT NULL),
    (SELECT count(*) FROM voice_analyses WHERE submission_id IN (sa, sb)),
    (SELECT count(*) FROM voice_analyses WHERE submission_id IN (sa, sb) AND transcript IS NOT NULL);

  PERFORM pg_temp.check_eq('voice_mark_removed marks one take',
    pg_temp.as_service(format($q$ SELECT public.voice_mark_removed(ARRAY[%L])::text $q$, obj_a)), '1');
  PERFORM pg_temp.check_eq('a''s take: audio reference gone, purged_at set, analysis (transcript and result) gone',
    (SELECT (object_name IS NULL)::text || '/' || (purged_at IS NOT NULL)::text FROM voice_submissions WHERE id = sa) || '/' ||
    (SELECT count(*)::text FROM voice_analyses WHERE submission_id = sa), 'true/true/0');
  PERFORM pg_temp.check_eq('b''s take and analysis are untouched [positive control]',
    (SELECT (object_name IS NOT NULL)::text FROM voice_submissions WHERE id = sb) || '/' ||
    (SELECT count(*)::text || '/' || min(transcript) FROM voice_analyses WHERE submission_id = sb), 'true/1/transcript of b');
  PERFORM pg_temp.check_eq('a''s export is empty after the purge (the analysis went with the audio)',
    pg_temp.as_user(u_a, 'SELECT count(*)::text FROM public.my_voice_analyses_export()'), '0');
  PERFORM pg_temp.check_eq('a name that matches no take deletes no analysis',
    pg_temp.as_service($q$ SELECT public.voice_mark_removed(ARRAY['v98/none'])::text $q$) || '/' ||
    (SELECT count(*)::text FROM voice_analyses WHERE submission_id IN (sb, sc, sd)), '0/3');
  RAISE NOTICE 'after the purge (a, b): takes with audio %, analyses %, transcripts %',
    (SELECT count(*) FROM voice_submissions WHERE id IN (sa, sb) AND object_name IS NOT NULL),
    (SELECT count(*) FROM voice_analyses WHERE submission_id IN (sa, sb)),
    (SELECT count(*) FROM voice_analyses WHERE submission_id IN (sa, sb) AND transcript IS NOT NULL);

  -- ── 4. The ledger ---------------------------------------------------------------
  PERFORM pg_temp.check_eq('today: the ledger purge deletes none of this script''s rows (all younger than 6 months)',
    pg_temp.as_service('SELECT public.voice_purge_ledger(now())::text') || '/' ||
    (SELECT count(*)::text FROM voice_analysis_sends WHERE user_id IN (u_a, u_b, u_c, u_d)), '0/4');

  -- a's row is 7 months old and its analysis is gone; b's row is 7 months old but b's analysis
  -- is live (a cohort take can outlive its send by a run); c's and d's are young.
  UPDATE voice_analysis_sends SET created_at = now() - INTERVAL '7 months' WHERE user_id IN (u_a, u_b);
  PERFORM pg_temp.check_eq('the old rows: 2, one with a live analysis behind it',
    (SELECT count(*)::text FROM voice_analysis_sends WHERE user_id IN (u_a, u_b) AND created_at < now() - INTERVAL '6 months') || '/' ||
    (SELECT count(*)::text FROM voice_analysis_sends s JOIN voice_analyses a ON a.send_id = s.id WHERE s.user_id IN (u_a, u_b)), '2/1');
  PERFORM pg_temp.check_eq('voice_purge_ledger deletes one row: the old one nothing points at',
    pg_temp.as_service('SELECT public.voice_purge_ledger(now())::text'), '1');
  PERFORM pg_temp.check_eq('a''s ledger row is gone; b''s old row stays while its analysis lives; c and d untouched',
    (SELECT count(*)::text FROM voice_analysis_sends WHERE user_id = u_a) || '/' ||
    (SELECT count(*)::text FROM voice_analysis_sends WHERE user_id = u_b) || '/' ||
    (SELECT count(*)::text FROM voice_analysis_sends WHERE user_id IN (u_c, u_d)), '0/1/2');
  PERFORM pg_temp.check_eq('and b''s analysis is still there (the ledger delete did not cascade into it)',
    (SELECT count(*)::text FROM voice_analyses WHERE submission_id = sb), '1');
  -- b's take is purged in its turn: the analysis goes, and the ledger row on the next run.
  PERFORM pg_temp.as_service(format($q$ SELECT public.voice_mark_removed(ARRAY[%L])::text $q$, obj_b));
  PERFORM pg_temp.check_eq('b purged: the analysis is gone',
    (SELECT count(*)::text FROM voice_analyses WHERE submission_id = sb), '0');
  PERFORM pg_temp.check_eq('the next ledger run deletes b''s old row',
    pg_temp.as_service('SELECT public.voice_purge_ledger(now())::text'), '1');
  PERFORM pg_temp.check_eq('and b has no ledger row left',
    (SELECT count(*)::text FROM voice_analysis_sends WHERE user_id = u_b), '0');
  PERFORM pg_temp.check_eq('the ledger purge is idempotent: a second run deletes nothing',
    pg_temp.as_service('SELECT public.voice_purge_ledger(now())::text'), '0');

  -- ── 5. Erasure leaves no analysis and no ledger row ---------------------------
  PERFORM pg_temp.check_eq('d before deleting: 1 ledger row, 1 analysis with a transcript, 1 take',
    (SELECT count(*)::text FROM voice_analysis_sends WHERE user_id = u_d) || '/' ||
    (SELECT count(*)::text FROM voice_analyses a JOIN voice_submissions v ON v.id = a.submission_id WHERE v.user_id = u_d AND a.transcript IS NOT NULL) || '/' ||
    (SELECT count(*)::text FROM voice_submissions WHERE user_id = u_d), '1/1/1');
  RAISE NOTICE 'erasure, before: ledger %, analyses %, takes % (d); ledger %, analyses % (c)',
    (SELECT count(*) FROM voice_analysis_sends WHERE user_id = u_d),
    (SELECT count(*) FROM voice_analyses a JOIN voice_submissions v ON v.id = a.submission_id WHERE v.user_id = u_d),
    (SELECT count(*) FROM voice_submissions WHERE user_id = u_d),
    (SELECT count(*) FROM voice_analysis_sends WHERE user_id = u_c),
    (SELECT count(*) FROM voice_analyses a JOIN voice_submissions v ON v.id = a.submission_id WHERE v.user_id = u_c);
  PERFORM pg_temp.check_eq('delete_my_account: ok',
    pg_temp.as_user(u_d, 'SELECT (public.delete_my_account())->>''ok'''), 'true');
  PERFORM pg_temp.check_eq('after: d has no ledger row, no analysis, no take, no transcript anywhere',
    (SELECT count(*)::text FROM voice_analysis_sends WHERE user_id = u_d) || '/' ||
    (SELECT count(*)::text FROM voice_analyses WHERE submission_id = sd) || '/' ||
    (SELECT count(*)::text FROM voice_submissions WHERE user_id = u_d) || '/' ||
    (SELECT count(*)::text FROM voice_analyses WHERE transcript = 'transcript of d'), '0/0/0/0');
  PERFORM pg_temp.check_eq('after: c (another learner) keeps their ledger row and withdrawn analysis [positive control]',
    (SELECT count(*)::text FROM voice_analysis_sends WHERE user_id = u_c) || '/' ||
    (SELECT count(*)::text FROM voice_analyses WHERE submission_id = sc), '1/1');
  RAISE NOTICE 'erasure, after: ledger %, analyses %, takes % (d); ledger %, analyses % (c)',
    (SELECT count(*) FROM voice_analysis_sends WHERE user_id = u_d),
    (SELECT count(*) FROM voice_analyses WHERE submission_id = sd),
    (SELECT count(*) FROM voice_submissions WHERE user_id = u_d),
    (SELECT count(*) FROM voice_analysis_sends WHERE user_id = u_c),
    (SELECT count(*) FROM voice_analyses WHERE submission_id = sc);

  RAISE NOTICE 'VOICE-016 PASS: 098 full protocol (% asserted cells)', (SELECT n FROM pg_temp.tally);
END;
$$;

ROLLBACK;
