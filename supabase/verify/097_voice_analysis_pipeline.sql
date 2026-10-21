-- ============================================================
-- supabase/verify/097_voice_analysis_pipeline.sql
--
-- VOICE-012 full protocol for migration 097 (needs everything through 096). NOT a
-- migration: run after 097 is applied, as postgres. Seeds its own data and ROLLS BACK.
-- A failed assertion aborts with "VOICE-012 FAIL: ...". Every denial is paired with a
-- positive control: the same call on a row where it should work, or by a caller who may.
-- Assertions about sweep results look only at this script's own rows, so a database that
-- already holds real stuck analyses does not change the outcome.
--
-- Learners: a (claim / advance flow), b (pause and the cap give-back), c (sweep),
-- r (replaced take), t (terminal rows).  Course CS: self-paced, lesson LA, voice block vt1.
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
    RAISE EXCEPTION 'VOICE-012 FAIL: % (got %, want %)', p_label, p_got, p_want;
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

CREATE FUNCTION pg_temp.claim(p_sub UUID, p_seconds INTEGER DEFAULT 150)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  v := pg_temp.as_service(format($q$ SELECT public.voice_analysis_claim(%L, %s)::text $q$, p_sub, p_seconds));
  RETURN v::jsonb;
END;
$$;

-- 'claimed:<bool>:<status>' for a claim.
CREATE FUNCTION pg_temp.claim_s(p_sub UUID, p_seconds INTEGER DEFAULT 150)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT 'claimed:' || (c->>'claimed') || ':' || (c->>'status') FROM (SELECT pg_temp.claim(p_sub, p_seconds) AS c) x;
$$;

CREATE FUNCTION pg_temp.advance(p_sub UUID, p_status TEXT, p_job TEXT DEFAULT NULL, p_transcript TEXT DEFAULT NULL,
                                p_audio NUMERIC DEFAULT NULL)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT pg_temp.as_service(format($q$ SELECT public.voice_analysis_advance(%L, %L, %L, %L, %L)::text $q$,
                                   p_sub, p_status, p_job, p_transcript, p_audio));
$$;

CREATE FUNCTION pg_temp.pause(p_sub UUID)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT pg_temp.as_service(format($q$ SELECT public.voice_analysis_pause(%L)::text $q$, p_sub));
$$;

CREATE FUNCTION pg_temp.finish(p_sub UUID)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT pg_temp.as_service(format(
    $q$ SELECT public.voice_analysis_finish(%L, 'hello world', '{"v":1}'::jsonb, 'first', 'first-v0', 'claude-sonnet-5-5', '{"in":1}'::jsonb)::text $q$, p_sub));
$$;

CREATE FUNCTION pg_temp.row_of(p_sub UUID)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT COALESCE((SELECT status || '/' || COALESCE(stt_job_id, '-') || '/' || COALESCE(left(transcript, 20), '-') || '/' ||
                          COALESCE(failure, '-')
                   FROM voice_analyses WHERE submission_id = p_sub), 'none');
$$;

DO $$
DECLARE
  u_a UUID := gen_random_uuid();  u_b UUID := gen_random_uuid();
  u_c UUID := gen_random_uuid();  u_r UUID := gen_random_uuid();
  u_t UUID := gen_random_uuid();
  cs UUID; la UUID; va UUID;
  doc JSONB := '[{"id":"vt1","kind":"task","type":"voice","prompt":{"paragraphs":[{"runs":[{"text":"Say it"}]}],"maxSeconds":60}}]';
  sa UUID := gen_random_uuid();
  sb UUID[] := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  sc_old UUID := gen_random_uuid();  sc_new UUID := gen_random_uuid();  sc_done UUID := gen_random_uuid();
  sr1 UUID := gen_random_uuid();  sr2 UUID := gen_random_uuid();
  r1 TEXT;  r2 TEXT;
  v_lease TIMESTAMPTZ;
  v_swept JSONB;
  v_mine  INTEGER;
BEGIN
  INSERT INTO auth.users (id, aud, role, email)
  SELECT x, 'authenticated', 'authenticated', 'v97-' || x || '@verify.test'
  FROM unnest(ARRAY[u_a, u_b, u_c, u_r, u_t]) x;

  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v97-cs', 'CS', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO cs;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cs, 1, 'LA', 'la', 'anyone') RETURNING id INTO la;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (la, doc, 'editor') RETURNING id INTO va;
  UPDATE lessons SET published_version_id = va WHERE id = la;

  PERFORM pg_temp.check_eq('seed: one course, one published lesson, five learners',
    (SELECT count(*)::text FROM courses WHERE slug = 'v97-cs') || '/' ||
    (SELECT count(*)::text FROM lessons WHERE id = la AND published_version_id IS NOT NULL) || '/' ||
    (SELECT count(*)::text FROM auth.users WHERE email LIKE 'v97-%@verify.test'), '1/1/5');

  -- ── 0. Static facts --------------------------------------------------------
  PERFORM pg_temp.check_eq('claim / advance / pause / sweep: service_role yes [positive control]',
    has_function_privilege('service_role', 'public.voice_analysis_claim(uuid,integer)', 'EXECUTE')::text || '/' ||
    has_function_privilege('service_role', 'public.voice_analysis_advance(uuid,text,text,text,numeric,integer)', 'EXECUTE')::text || '/' ||
    has_function_privilege('service_role', 'public.voice_analysis_pause(uuid)', 'EXECUTE')::text || '/' ||
    has_function_privilege('service_role', 'public.voice_analysis_sweep(interval)', 'EXECUTE')::text, 'true/true/true/true');
  PERFORM pg_temp.check_eq('claim / advance / pause / sweep: authenticated no',
    has_function_privilege('authenticated', 'public.voice_analysis_claim(uuid,integer)', 'EXECUTE')::text || '/' ||
    has_function_privilege('authenticated', 'public.voice_analysis_advance(uuid,text,text,text,numeric,integer)', 'EXECUTE')::text || '/' ||
    has_function_privilege('authenticated', 'public.voice_analysis_pause(uuid)', 'EXECUTE')::text || '/' ||
    has_function_privilege('authenticated', 'public.voice_analysis_sweep(interval)', 'EXECUTE')::text, 'false/false/false/false');
  PERFORM pg_temp.check_eq('claim / advance / pause / sweep: anon no',
    has_function_privilege('anon', 'public.voice_analysis_claim(uuid,integer)', 'EXECUTE')::text || '/' ||
    has_function_privilege('anon', 'public.voice_analysis_advance(uuid,text,text,text,numeric,integer)', 'EXECUTE')::text || '/' ||
    has_function_privilege('anon', 'public.voice_analysis_pause(uuid)', 'EXECUTE')::text || '/' ||
    has_function_privilege('anon', 'public.voice_analysis_sweep(interval)', 'EXECUTE')::text, 'false/false/false/false');
  PERFORM pg_temp.check_eq('stt_job_id: not readable by authenticated; transcript is [positive control]',
    has_column_privilege('authenticated', 'public.voice_analyses', 'stt_job_id', 'SELECT')::text || '/' ||
    has_column_privilege('authenticated', 'public.voice_analyses', 'transcript', 'SELECT')::text, 'false/true');
  PERFORM pg_temp.check_eq('a user session calling claim is refused (42501), the service role is not',
    pg_temp.as_user(u_a, format($q$ SELECT public.voice_analysis_claim(%L, 150)::text $q$, gen_random_uuid())),
    'ERR:42501');
  PERFORM pg_temp.check_eq('anon calling pause is refused (42501)',
    pg_temp.as_anon(format($q$ SELECT public.voice_analysis_pause(%L)::text $q$, gen_random_uuid())), 'ERR:42501');

  -- ── 1. Claim -----------------------------------------------------------------
  PERFORM pg_temp.check_eq('a sends its take: analysed', pg_temp.send(u_a, cs, la, sa), 'ok:true');
  PERFORM pg_temp.check_eq('a: the analysis row starts pending with no job, transcript or failure',
    pg_temp.row_of(sa), 'pending/-/-/-');
  PERFORM pg_temp.check_eq('first claim wins [positive control]', pg_temp.claim_s(sa), 'claimed:true:pending');
  PERFORM pg_temp.check_eq('a second claim while the lease is live is refused', pg_temp.claim_s(sa), 'claimed:false:pending');
  UPDATE voice_analyses SET lease_until = now() - interval '1 second' WHERE submission_id = sa;
  PERFORM pg_temp.check_eq('an expired lease is re-claimed', pg_temp.claim_s(sa), 'claimed:true:pending');
  PERFORM pg_temp.check_eq('an unknown take is "missing", not an error', pg_temp.claim_s(gen_random_uuid()), 'claimed:false:missing');
  UPDATE voice_analyses SET lease_until = now() - interval '1 second' WHERE submission_id = sa;
  PERFORM pg_temp.claim(sa, 1);
  SELECT lease_until INTO v_lease FROM voice_analyses WHERE submission_id = sa;
  PERFORM pg_temp.check_eq('a 1 s lease is raised to the 10 s floor',
    (v_lease > now() + interval '8 seconds' AND v_lease < now() + interval '11 seconds')::text, 'true');
  UPDATE voice_analyses SET lease_until = now() - interval '1 second' WHERE submission_id = sa;
  PERFORM pg_temp.claim(sa, 100000);
  SELECT lease_until INTO v_lease FROM voice_analyses WHERE submission_id = sa;
  PERFORM pg_temp.check_eq('a huge lease is cut to the 600 s ceiling',
    (v_lease > now() + interval '590 seconds' AND v_lease < now() + interval '601 seconds')::text, 'true');

  -- ── 2. Advance: forward only, state kept ----------------------------------------
  PERFORM pg_temp.check_eq('pending -> transcribing with the job id', pg_temp.advance(sa, 'transcribing', 'job-1'), 'true');
  PERFORM pg_temp.check_eq('the row now reads transcribing with the job', pg_temp.row_of(sa), 'transcribing/job-1/-/-');
  SELECT lease_until INTO v_lease FROM voice_analyses WHERE submission_id = sa;
  PERFORM pg_temp.check_eq('advance renews the lease (150 s)', (v_lease > now() + interval '140 seconds')::text, 'true');
  PERFORM pg_temp.check_eq('transcribing -> analysing with the transcript; the job id is kept',
    pg_temp.advance(sa, 'analysing', NULL, 'the transcript text goes here', 212.5), 'true');
  PERFORM pg_temp.check_eq('the take''s length is kept in usage',
    (SELECT usage->>'audioSeconds' FROM voice_analyses WHERE submission_id = sa), '212.5');
  PERFORM pg_temp.check_eq('the row reads analysing, job kept, transcript stored',
    pg_temp.row_of(sa), 'analysing/job-1/the transcript text /-');
  PERFORM pg_temp.check_eq('going backwards (analysing -> transcribing) matches nothing',
    pg_temp.advance(sa, 'transcribing', 'job-2'), 'false');
  PERFORM pg_temp.check_eq('and changes nothing', pg_temp.row_of(sa), 'analysing/job-1/the transcript text /-');
  PERFORM pg_temp.check_eq('"done" is not a step advance can set (it raises)',
    pg_temp.advance(sa, 'done'), 'ERR:P0001');
  UPDATE voice_analyses SET lease_until = now() - interval '1 second' WHERE submission_id = sa;
  PERFORM pg_temp.check_eq('a claim on an analysing row hands back the job and the transcript',
    (SELECT (c->>'status') || '/' || (c->>'stt_job_id') || '/' || left(c->>'transcript', 14) || '/' || (c->>'audio_seconds')
       FROM (SELECT pg_temp.claim(sa) AS c) y),
    'analysing/job-1/the transcript/212.5');
  PERFORM pg_temp.check_eq('finish (096) takes the advanced row to done [positive control]', pg_temp.finish(sa), 'true');
  PERFORM pg_temp.check_eq('a finished row cannot be advanced', pg_temp.advance(sa, 'analysing', 'job-3'), 'false');
  PERFORM pg_temp.check_eq('a finished row is not claimable: claimed false, status done', pg_temp.claim_s(sa), 'claimed:false:done');

  -- ── 3. A replaced take: its late work writes nothing -------------------------------
  PERFORM pg_temp.check_eq('r sends take 1', pg_temp.send(u_r, cs, la, sr1), 'ok:true');
  PERFORM pg_temp.check_eq('r: take 1 has a pending analysis', pg_temp.row_of(sr1), 'pending/-/-/-');
  PERFORM pg_temp.check_eq('r sends take 2 (replaces take 1)', pg_temp.send(u_r, cs, la, sr2), 'ok:true');
  PERFORM pg_temp.check_eq('take 1''s analysis cascaded away', pg_temp.row_of(sr1), 'none');
  PERFORM pg_temp.check_eq('a late claim for take 1 is "missing"', pg_temp.claim_s(sr1), 'claimed:false:missing');
  PERFORM pg_temp.check_eq('a late advance for take 1 matches nothing', pg_temp.advance(sr1, 'analysing', 'j', 'late'), 'false');
  PERFORM pg_temp.check_eq('a late pause for take 1 matches nothing', pg_temp.pause(sr1), 'false');
  PERFORM pg_temp.check_eq('take 2 is untouched and claimable [positive control]', pg_temp.claim_s(sr2), 'claimed:true:pending');

  -- ── 4. Pause gives the send back ---------------------------------------------------
  PERFORM pg_temp.check_eq('b: three analysed sends on LA',
    pg_temp.send(u_b, cs, la, sb[1]) || '/' || pg_temp.send(u_b, cs, la, sb[2]) || '/' || pg_temp.send(u_b, cs, la, sb[3]),
    'ok:true/ok:true/ok:true');
  PERFORM pg_temp.check_eq('b: a 4th send is refused by the task cap [the control for the give-back below]',
    pg_temp.send(u_b, cs, la, sb[4]), 'ERR:PT429');
  PERFORM pg_temp.check_eq('b: the ledger counts 3 for the task',
    (SELECT count(*)::text FROM voice_analysis_sends WHERE user_id = u_b AND lesson_id = la AND analysed AND counted), '3');
  PERFORM pg_temp.check_eq('pause of b''s pending analysis', pg_temp.pause(sb[3]), 'true');
  PERFORM pg_temp.check_eq('the analysis row is gone, the take is not',
    pg_temp.row_of(sb[3]) || '/' || (SELECT count(*)::text FROM voice_submissions WHERE id = sb[3]), 'none/1');
  PERFORM pg_temp.check_eq('its ledger row is un-counted with reason paused, still analysed',
    (SELECT counted::text || '/' || uncounted_reason || '/' || analysed::text || '/' || (uncounted_at IS NOT NULL)::text
       FROM voice_analysis_sends WHERE submission_id = sb[3]), 'false/paused/true/true');
  PERFORM pg_temp.check_eq('b: the ledger now counts 2 for the task',
    (SELECT count(*)::text FROM voice_analysis_sends WHERE user_id = u_b AND lesson_id = la AND analysed AND counted), '2');
  PERFORM pg_temp.check_eq('b: the send the pause gave back is usable: a 4th send is now accepted',
    pg_temp.send(u_b, cs, la, sb[4]), 'ok:true');
  PERFORM pg_temp.check_eq('pausing the same take twice does nothing', pg_temp.pause(sb[3]), 'false');
  PERFORM pg_temp.check_eq('a row a provider already touched is not paused',
    pg_temp.advance(sb[4], 'transcribing', 'job-b') || '/' || pg_temp.pause(sb[4]) || '/' || pg_temp.row_of(sb[4]),
    'true/false/transcribing/job-b/-/-');

  -- ── 5. Sweep: only what is stuck, only past the age ---------------------------------
  -- One voice block, so each row gets its own learner (and so its own task): c is the
  -- old stuck row, t the old done row, a the fresh pending row.
  PERFORM pg_temp.check_eq('c sends (the old stuck row)', pg_temp.send(u_c, cs, la, sc_old), 'ok:true');
  PERFORM pg_temp.check_eq('t sends (the old done row)', pg_temp.send(u_t, cs, la, sc_done), 'ok:true');
  PERFORM pg_temp.finish(sc_done);
  PERFORM pg_temp.check_eq('a sends again for the fresh pending row',
    pg_temp.send(u_a, cs, la, sc_new), 'ok:true');
  PERFORM pg_temp.advance(sc_old, 'transcribing', 'job-old');
  UPDATE voice_analyses SET created_at = now() - interval '25 hours' WHERE submission_id IN (sc_old, sc_done);
  PERFORM pg_temp.check_eq('before the sweep: old is transcribing, new is pending, done is done',
    pg_temp.row_of(sc_old) || '|' || pg_temp.row_of(sc_new) || '|' || pg_temp.row_of(sc_done),
    'transcribing/job-old/-/-|pending/-/-/-|done/-/hello world/-');

  v_swept := pg_temp.as_service('SELECT public.voice_analysis_sweep()::text')::jsonb;
  SELECT count(*) INTO v_mine FROM jsonb_array_elements(v_swept) e
   WHERE (e->>'submission_id')::uuid IN (sc_old, sc_new, sc_done);
  PERFORM pg_temp.check_eq('the sweep returns the old stuck row and nothing else of ours', v_mine::text, '1');
  PERFORM pg_temp.check_eq('and returns its job id, so the provider copy can be deleted',
    (SELECT e->>'stt_job_id' FROM jsonb_array_elements(v_swept) e WHERE (e->>'submission_id')::uuid = sc_old), 'job-old');
  PERFORM pg_temp.check_eq('the old row is failed with reason timeout',
    pg_temp.row_of(sc_old), 'failed/job-old/-/timeout');
  PERFORM pg_temp.check_eq('its send is given back (failed)',
    (SELECT counted::text || '/' || uncounted_reason FROM voice_analysis_sends WHERE submission_id = sc_old), 'false/failed');
  PERFORM pg_temp.check_eq('the fresh pending row and the old DONE row are untouched',
    pg_temp.row_of(sc_new) || '|' || pg_temp.row_of(sc_done), 'pending/-/-/-|done/-/hello world/-');
  PERFORM pg_temp.check_eq('the fresh row''s send still counts',
    (SELECT counted::text FROM voice_analysis_sends WHERE submission_id = sc_new), 'true');
  v_swept := pg_temp.as_service('SELECT public.voice_analysis_sweep()::text')::jsonb;
  SELECT count(*) INTO v_mine FROM jsonb_array_elements(v_swept) e
   WHERE (e->>'submission_id')::uuid IN (sc_old, sc_new, sc_done);
  PERFORM pg_temp.check_eq('a second sweep finds none of ours (the failed row is terminal)', v_mine::text, '0');
  -- now() is the transaction's start, so a row made in this script is never "older" than
  -- anything: the fresh row is backdated an hour, which the 24 h default left alone above.
  UPDATE voice_analyses SET created_at = now() - interval '1 hour' WHERE submission_id = sc_new;
  v_swept := pg_temp.as_service('SELECT public.voice_analysis_sweep(interval ''30 minutes'')::text')::jsonb;
  SELECT count(*) INTO v_mine FROM jsonb_array_elements(v_swept) e
   WHERE (e->>'submission_id')::uuid IN (sc_old, sc_new, sc_done);
  PERFORM pg_temp.check_eq('the age is a parameter: a 1 h old row survived the 24 h default and falls to a 30 min age',
    v_mine::text || '/' || pg_temp.row_of(sc_new), '1/failed/-/-/timeout');
  PERFORM pg_temp.check_eq('and the old DONE row is still untouched by it',
    pg_temp.row_of(sc_done), 'done/-/hello world/-');

  RAISE NOTICE 'VOICE-012 PASS: 097 full protocol (% asserted cells)', (SELECT n FROM pg_temp.tally);
END;
$$;

ROLLBACK;
