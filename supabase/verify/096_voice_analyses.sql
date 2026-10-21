-- ============================================================
-- supabase/verify/096_voice_analyses.sql
--
-- VOICE-011 full protocol for migration 096 (needs everything through 095). NOT a
-- migration: run after 096 is applied, as postgres. Seeds its own data and ROLLS BACK.
-- A failed assertion aborts with "VOICE-011 FAIL: ...". Every denial is paired with a
-- positive control: the same call by a caller who may, or the same caller one send earlier.
--
-- Callers (u_*):
--   p     self-paced learner, hits the per-task cap on LA; pq a second learner (control)
--   d     self-paced learner, hits the daily cap (9 seeded sends in the window + 1 outside)
--   h     self-paced learner for the hide flow;  l  late result;  f  failed-on-our-side
--   dup   a duplicate send;  x  account deletion
--   en    cohort learner (4th send);  en3 cohort, daily cap full;  en4 cohort, 9 of 10
--   ed    editor of CS with an active seat;  edl editor of CS, lapsed seat;
--   edc   editor of the cohort course CC (not CS), active seat
-- Courses: CS (self-paced, lessons LA anyone, LS signed_in), CC (cohort, lesson LCA anyone,
-- run RC in progress).
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

CREATE TEMP TABLE pg_temp.tally (n INTEGER NOT NULL);
INSERT INTO pg_temp.tally VALUES (0);

CREATE FUNCTION pg_temp.check_eq(p_label TEXT, p_got TEXT, p_want TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE pg_temp.tally SET n = n + 1;
  RAISE NOTICE '% -> got % (want %)', p_label, p_got, p_want;
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'VOICE-011 FAIL: % (got %, want %)', p_label, p_got, p_want;
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

-- submit_voice_recording as p_user for a fresh submission id:
--   'ok:<slot>:<analysed>', the RPC's error code, 'PT429|<detail>|<hint>' for a cap,
--   or 'ERR:<sqlstate>'.
CREATE FUNCTION pg_temp.send(p_user UUID, p_course UUID, p_lesson UUID, p_sub UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_obj TEXT;
  r     JSONB;
  d     TEXT;
  h     TEXT;
BEGIN
  v_obj := pg_temp.put_object(p_course, p_user, p_sub);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT public.submit_voice_recording(p_sub, p_lesson, 'vt1', v_obj) INTO r;
  PERFORM set_config('role', 'postgres', true);
  RETURN CASE WHEN r->>'ok' = 'true' THEN 'ok:' || (r->>'slot') || ':' || (r->>'analysed') ELSE r->>'error' END;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS d = PG_EXCEPTION_DETAIL, h = PG_EXCEPTION_HINT;
  PERFORM set_config('role', 'postgres', true);
  RETURN CASE WHEN SQLSTATE = 'PT429' THEN 'PT429|' || COALESCE(d, '') || '|' || COALESCE(h, '') ELSE 'ERR:' || SQLSTATE END;
END;
$$;

CREATE FUNCTION pg_temp.finish(p_sub UUID)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT pg_temp.as_service(format(
    $q$ SELECT public.voice_analysis_finish(%L, 'hello world', '{"highlights":[]}'::jsonb, 'first', 'v1', 'claude-sonnet-5-5', '{"in":1}'::jsonb)::text $q$, p_sub));
$$;

CREATE FUNCTION pg_temp.hide(p_user UUID, p_sub UUID)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT pg_temp.as_user(p_user, format(
    $q$ SELECT CASE WHEN r->>'ok' = 'true' THEN 'ok' || CASE WHEN r->>'already_hidden' = 'true' THEN ':already' ELSE '' END ELSE r->>'error' END
        FROM (SELECT public.hide_voice_analysis(%L) AS r) x $q$, p_sub));
$$;

-- How many analysis rows the caller can see for one take.
CREATE FUNCTION pg_temp.sees(p_user UUID, p_sub UUID)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT pg_temp.as_user(p_user, format($q$ SELECT count(*)::text FROM public.voice_analyses WHERE submission_id = %L $q$, p_sub));
$$;

DO $$
DECLARE
  u_p   UUID := gen_random_uuid();  u_pq  UUID := gen_random_uuid();
  u_d   UUID := gen_random_uuid();  u_h   UUID := gen_random_uuid();
  u_l   UUID := gen_random_uuid();  u_f   UUID := gen_random_uuid();
  u_dup UUID := gen_random_uuid();  u_x   UUID := gen_random_uuid();
  u_en  UUID := gen_random_uuid();  u_en3 UUID := gen_random_uuid();
  u_en4 UUID := gen_random_uuid();
  u_ed  UUID := gen_random_uuid();  u_edl UUID := gen_random_uuid();
  u_edc UUID := gen_random_uuid();
  cs UUID; cc UUID; la UUID; ls UUID; lca UUID; lce UUID; va UUID; vs UUID; vca UUID; vce UUID; rc UUID;
  doc JSONB := '[{"id":"vt1","kind":"task","type":"voice","prompt":{"paragraphs":[{"runs":[{"text":"Say it"}]}],"maxSeconds":60}}]';
  s UUID[];
  sx UUID;
  sh3 UUID; sq UUID; sl1 UUID; sl2 UUID; sf3 UUID; sc4 UUID;
  v_exp TEXT;
  v_oldest_id UUID;
  i INTEGER;
  v_ok BOOLEAN;
BEGIN
  INSERT INTO auth.users (id, aud, role, email)
  SELECT x, 'authenticated', 'authenticated', 'v96-' || x || '@verify.test'
  FROM unnest(ARRAY[u_p, u_pq, u_d, u_h, u_l, u_f, u_dup, u_x, u_en, u_en3, u_en4, u_ed, u_edl, u_edc]) x;

  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v96-cs', 'CS', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO cs;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v96-cc', 'CC', 'A2', 'published', 'cohort', 's', 'c') RETURNING id INTO cc;
  INSERT INTO course_editors (course_id, user_id, granted_by)
    VALUES (cs, u_ed, u_ed), (cs, u_edl, u_edl), (cc, u_edc, u_edc);
  INSERT INTO author_seats (user_id, kind, public_name, expires_at, granted_by) VALUES
    (u_ed, 'teacher', 'Ed', NULL, u_ed),
    (u_edl, 'teacher', 'Edl', now() + interval '30 days', u_edl),
    (u_edc, 'teacher', 'Edc', NULL, u_edc);
  UPDATE author_seats SET expires_at = now() - interval '1 second' WHERE user_id = u_edl;

  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cs, 1, 'LA', 'la', 'anyone')    RETURNING id INTO la;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cs, 2, 'LS', 'ls', 'signed_in') RETURNING id INTO ls;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cc, 1, 'LCA', 'lca', 'anyone')  RETURNING id INTO lca;
  -- A run needs at least one scheduled (entitled, week-numbered) lesson in the course.
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week) VALUES (cc, 2, 'LCE', 'lce', 'entitled', 1) RETURNING id INTO lce;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (lce, doc, 'editor') RETURNING id INTO vce;
  UPDATE lessons SET published_version_id = vce WHERE id = lce;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (la,  doc, 'editor') RETURNING id INTO va;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (ls,  doc, 'editor') RETURNING id INTO vs;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (lca, doc, 'editor') RETURNING id INTO vca;
  UPDATE lessons SET published_version_id = va  WHERE id = la;
  UPDATE lessons SET published_version_id = vs  WHERE id = ls;
  UPDATE lessons SET published_version_id = vca WHERE id = lca;

  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (cc, 'RC', now() - interval '2 days', now() + interval '26 days') RETURNING id INTO rc;
  INSERT INTO run_enrolments (run_id, user_id, tier) VALUES (rc, u_en, 'basic'), (rc, u_en3, 'basic'), (rc, u_en4, 'basic');

  PERFORM pg_temp.check_eq('seed: 2 courses, 4 published lessons, 3 enrolments, 3 seats (one lapsed)',
    ((SELECT count(*) FROM courses WHERE slug LIKE 'v96-%')::text || '/' ||
     (SELECT count(*) FROM lessons WHERE course_id IN (cs, cc) AND published_version_id IS NOT NULL)::text || '/' ||
     (SELECT count(*) FROM run_enrolments WHERE run_id = rc)::text || '/' ||
     (SELECT count(*) FROM author_seats WHERE user_id IN (u_ed, u_edl, u_edc))::text || '/' ||
     (SELECT count(*) FROM author_seats WHERE user_id = u_edl AND expires_at < now())::text), '2/4/3/3/1');

  -- ── 0. Static facts -------------------------------------------------------
  PERFORM pg_temp.check_eq('the caps trigger is installed on the ledger',
    (SELECT count(*)::text FROM pg_trigger WHERE tgname = 'voice_analysis_caps' AND tgrelid = 'public.voice_analysis_sends'::regclass), '1');
  PERFORM pg_temp.check_eq('voice_analyses cascades from voice_submissions',
    (SELECT confdeltype::text FROM pg_constraint WHERE conrelid = 'public.voice_analyses'::regclass AND conname = 'voice_analyses_submission_id_fkey'), 'c');
  PERFORM pg_temp.check_eq('the ledger has no foreign key to voice_submissions',
    (SELECT count(*)::text FROM pg_constraint WHERE conrelid = 'public.voice_analysis_sends'::regclass AND confrelid = 'public.voice_submissions'::regclass), '0');
  PERFORM pg_temp.check_eq('anon / authenticated have no privilege at all on the ledger',
    has_table_privilege('anon', 'public.voice_analysis_sends', 'SELECT')::text || '/' ||
    has_table_privilege('authenticated', 'public.voice_analysis_sends', 'SELECT')::text || '/' ||
    has_table_privilege('authenticated', 'public.voice_analysis_sends', 'INSERT')::text, 'false/false/false');
  PERFORM pg_temp.check_eq('authenticated: no INSERT / UPDATE / DELETE on voice_analyses; anon no SELECT',
    has_table_privilege('authenticated', 'public.voice_analyses', 'INSERT')::text || '/' ||
    has_table_privilege('authenticated', 'public.voice_analyses', 'UPDATE')::text || '/' ||
    has_table_privilege('authenticated', 'public.voice_analyses', 'DELETE')::text || '/' ||
    has_table_privilege('anon', 'public.voice_analyses', 'SELECT')::text, 'false/false/false/false');
  PERFORM pg_temp.check_eq('column grants: transcript readable [positive control]; usage, lease_until, failure, hidden_by, send_id not',
    has_column_privilege('authenticated', 'public.voice_analyses', 'transcript', 'SELECT')::text || '/' ||
    has_column_privilege('authenticated', 'public.voice_analyses', 'usage', 'SELECT')::text || '/' ||
    has_column_privilege('authenticated', 'public.voice_analyses', 'lease_until', 'SELECT')::text || '/' ||
    has_column_privilege('authenticated', 'public.voice_analyses', 'failure', 'SELECT')::text || '/' ||
    has_column_privilege('authenticated', 'public.voice_analyses', 'hidden_by', 'SELECT')::text || '/' ||
    has_column_privilege('authenticated', 'public.voice_analyses', 'send_id', 'SELECT')::text, 'true/false/false/false/false/false');
  PERFORM pg_temp.check_eq('finish / fail: service_role yes, authenticated no, anon no',
    has_function_privilege('service_role', 'public.voice_analysis_finish(uuid,text,jsonb,text,text,text,jsonb,uuid)', 'EXECUTE')::text || '/' ||
    has_function_privilege('authenticated', 'public.voice_analysis_finish(uuid,text,jsonb,text,text,text,jsonb,uuid)', 'EXECUTE')::text || '/' ||
    has_function_privilege('anon', 'public.voice_analysis_finish(uuid,text,jsonb,text,text,text,jsonb,uuid)', 'EXECUTE')::text || '/' ||
    has_function_privilege('service_role', 'public.voice_analysis_fail(uuid,text)', 'EXECUTE')::text || '/' ||
    has_function_privilege('authenticated', 'public.voice_analysis_fail(uuid,text)', 'EXECUTE')::text, 'true/false/false/true/false');
  PERFORM pg_temp.check_eq('hide_voice_analysis: authenticated yes [positive control], anon no',
    has_function_privilege('authenticated', 'public.hide_voice_analysis(uuid)', 'EXECUTE')::text || '/' ||
    has_function_privilege('anon', 'public.hide_voice_analysis(uuid)', 'EXECUTE')::text, 'true/false');
  PERFORM pg_temp.check_eq('the limits: 3 per task, 10 per day',
    voice_analysis_task_limit()::text || '/' || voice_analysis_daily_limit()::text, '3/10');

  -- ── 1. Self-paced: a 4th send is refused before anything is replaced -------
  s := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  PERFORM pg_temp.check_eq('p send 1 on LA', pg_temp.send(u_p, cs, la, s[1]), 'ok:self_paced:true');
  PERFORM pg_temp.check_eq('p send 2 on LA', pg_temp.send(u_p, cs, la, s[2]), 'ok:self_paced:true');
  PERFORM pg_temp.check_eq('p send 3 on LA', pg_temp.send(u_p, cs, la, s[3]), 'ok:self_paced:true');
  PERFORM pg_temp.check_eq('p: 3 ledger rows, all analysed and counted, for the task',
    (SELECT count(*)::text FROM voice_analysis_sends WHERE user_id = u_p AND lesson_id = la AND analysed AND counted), '3');
  PERFORM pg_temp.check_eq('p: one take (send 3), and one analysis, on it (the replaced takes'' analyses cascaded away)',
    (SELECT count(*)::text || '/' || bool_and(id = s[3])::text FROM voice_submissions WHERE user_id = u_p AND lesson_id = la) || '/' ||
    (SELECT count(*)::text FROM voice_analyses WHERE submission_id = s[3]) || '/' ||
    (SELECT count(*)::text FROM voice_analyses a JOIN voice_submissions v ON v.id = a.submission_id WHERE v.user_id = u_p), '1/true/1/1');
  PERFORM pg_temp.check_eq('p: the two replaced takes'' objects are queued (2 so far)',
    (SELECT count(*)::text FROM voice_object_deletions WHERE object_name LIKE cs::text || '/' || u_p::text || '/%' AND reason = 'replaced'), '2');
  PERFORM pg_temp.check_eq('p send 4 on LA: refused, task_cap, no hint',
    pg_temp.send(u_p, cs, la, s[4]), 'PT429|task_cap|');
  PERFORM pg_temp.check_eq('after the refusal: p''s take is still send 3, nothing newly queued, ledger still 3, analysis still on send 3',
    (SELECT id = s[3] FROM voice_submissions WHERE user_id = u_p AND lesson_id = la)::text || '/' ||
    (SELECT count(*)::text FROM voice_object_deletions WHERE object_name LIKE cs::text || '/' || u_p::text || '/%' AND reason = 'replaced') || '/' ||
    (SELECT count(*)::text FROM voice_analysis_sends WHERE user_id = u_p AND lesson_id = la) || '/' ||
    (SELECT count(*)::text FROM voice_analyses WHERE submission_id = s[3]), 'true/2/3/1');
  PERFORM pg_temp.check_eq('positive control: p on another task (LS) is accepted',
    pg_temp.send(u_p, cs, ls, gen_random_uuid()), 'ok:self_paced:true');
  PERFORM pg_temp.check_eq('positive control: another learner on LA is accepted',
    pg_temp.send(u_pq, cs, la, gen_random_uuid()), 'ok:self_paced:true');
  -- The trigger holds below the RPC, for any inserter.
  BEGIN
    INSERT INTO voice_analysis_sends (user_id, lesson_id, block_id, submission_id, slot)
      VALUES (u_p, la, 'vt1', gen_random_uuid(), 'self_paced');
    RAISE EXCEPTION 'VOICE-011 FAIL: the trigger let a 4th self-paced ledger row in';
  EXCEPTION WHEN SQLSTATE 'PT429' THEN
    PERFORM pg_temp.check_eq('trigger: a direct 4th self-paced ledger insert is refused with PT429', 'PT429', 'PT429');
  END;
  INSERT INTO voice_analysis_sends (user_id, lesson_id, block_id, submission_id, slot)
    VALUES (u_p, la, 'vt1', gen_random_uuid(), 'enrolment') RETURNING analysed INTO v_ok;
  PERFORM pg_temp.check_eq('trigger: the same direct insert for a cohort slot is accepted with analysed = false [positive control]',
    v_ok::text, 'false');
  DELETE FROM voice_analysis_sends WHERE user_id = u_p AND lesson_id = la AND NOT analysed;

  -- A duplicate send consumes nothing.
  sx := gen_random_uuid();
  PERFORM pg_temp.check_eq('dup: first send', pg_temp.send(u_dup, cs, la, sx), 'ok:self_paced:true');
  PERFORM pg_temp.check_eq('dup: the current take sent again: duplicate_submission',
    pg_temp.as_user(u_dup, format($q$ SELECT r->>'error' FROM (SELECT public.submit_voice_recording(%L, %L, 'vt1', %L) AS r) x $q$,
      sx, la, (SELECT object_name FROM voice_submissions WHERE id = sx))), 'duplicate_submission');
  PERFORM pg_temp.check_eq('dup: the ledger still holds one row for the task',
    (SELECT count(*)::text FROM voice_analysis_sends WHERE user_id = u_dup AND lesson_id = la), '1');

  -- ── 2. Daily cap: the 11th analysis in 24 h, with the next free time -------
  -- 9 sends inside the window (2..18 h ago), one outside it (25 h ago). The outside one
  -- is the control for the window: were it counted, the next send would already be refused.
  FOR i IN 1..9 LOOP
    INSERT INTO voice_analysis_sends (user_id, lesson_id, block_id, submission_id, slot, created_at)
      VALUES (u_d, la, 'x' || i, gen_random_uuid(), 'self_paced', now() - make_interval(hours => i * 2));
  END LOOP;
  INSERT INTO voice_analysis_sends (user_id, lesson_id, block_id, submission_id, slot, created_at)
    VALUES (u_d, la, 'x-old', gen_random_uuid(), 'self_paced', now() - interval '25 hours');
  PERFORM pg_temp.check_eq('d: 9 counted in the window, 10 in all',
    (SELECT count(*) FILTER (WHERE created_at > now() - interval '24 hours')::text || '/' || count(*)::text
       FROM voice_analysis_sends WHERE user_id = u_d), '9/10');
  PERFORM pg_temp.check_eq('d send (the 10th in the window): accepted', pg_temp.send(u_d, cs, la, gen_random_uuid()), 'ok:self_paced:true');
  v_exp := (SELECT to_char((min(created_at) + interval '24 hours') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
              FROM voice_analysis_sends WHERE user_id = u_d AND created_at > now() - interval '24 hours');
  PERFORM pg_temp.check_eq('d send (the 11th): refused, daily_cap, hint = when the oldest leaves the window',
    pg_temp.send(u_d, cs, ls, gen_random_uuid()), 'PT429|daily_cap|' || v_exp);
  PERFORM pg_temp.check_eq('the hint is 6 hours from now (oldest send 18 h ago)',
    ((v_exp::timestamptz - now()) = interval '6 hours')::text, 'true');
  PERFORM pg_temp.check_eq('d: nothing written by the refusal (ledger still 11, no take on LS)',
    (SELECT count(*)::text FROM voice_analysis_sends WHERE user_id = u_d) || '/' ||
    (SELECT count(*)::text FROM voice_submissions WHERE user_id = u_d AND lesson_id = ls), '11/0');
  -- The oldest leaves the window: a place frees.
  UPDATE voice_analysis_sends SET created_at = now() - interval '25 hours'
   WHERE user_id = u_d AND block_id = 'x9';
  PERFORM pg_temp.check_eq('d after the oldest left the window: the same send is accepted [positive control]',
    pg_temp.send(u_d, cs, ls, gen_random_uuid()), 'ok:self_paced:true');

  -- ── 3. Cohort: unlimited sends, the first 3 analysed ----------------------
  s := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  PERFORM pg_temp.check_eq('en send 1 on LCA', pg_temp.send(u_en, cc, lca, s[1]), 'ok:enrolment:true');
  PERFORM pg_temp.check_eq('en send 2 on LCA', pg_temp.send(u_en, cc, lca, s[2]), 'ok:enrolment:true');
  PERFORM pg_temp.check_eq('en send 3 on LCA', pg_temp.send(u_en, cc, lca, s[3]), 'ok:enrolment:true');
  PERFORM pg_temp.check_eq('en after 3 sends: the take has an analysis row [positive control]',
    (SELECT count(*)::text FROM voice_analyses WHERE submission_id = s[3]), '1');
  PERFORM pg_temp.check_eq('en send 4 on LCA: accepted, not analysed', pg_temp.send(u_en, cc, lca, s[4]), 'ok:enrolment:false');
  PERFORM pg_temp.check_eq('en send 5 on LCA: accepted, not analysed (unlimited)', pg_temp.send(u_en, cc, lca, s[5]), 'ok:enrolment:false');
  PERFORM pg_temp.check_eq('en: the 4th and 5th takes have no analysis row; the user has none now',
    (SELECT count(*)::text FROM voice_analyses WHERE submission_id IN (s[4], s[5])) || '/' ||
    (SELECT count(*)::text FROM voice_analyses a JOIN voice_submissions v ON v.id = a.submission_id WHERE v.user_id = u_en), '0/0');
  PERFORM pg_temp.check_eq('en: ledger 5 rows, 3 analysed',
    (SELECT count(*)::text || '/' || count(*) FILTER (WHERE analysed)::text FROM voice_analysis_sends WHERE user_id = u_en), '5/3');
  PERFORM pg_temp.check_eq('en: the current take is send 5 (the enrolment slot kept one row)',
    (SELECT count(*)::text || '/' || bool_and(id = s[5])::text FROM voice_submissions WHERE user_id = u_en), '1/true');
  -- The daily cap does not block a cohort take.
  FOR i IN 1..10 LOOP
    INSERT INTO voice_analysis_sends (user_id, lesson_id, block_id, submission_id, slot, created_at)
      VALUES (u_en3, la, 'x' || i, gen_random_uuid(), 'enrolment', now() - make_interval(hours => i));
  END LOOP;
  FOR i IN 1..9 LOOP
    INSERT INTO voice_analysis_sends (user_id, lesson_id, block_id, submission_id, slot, created_at)
      VALUES (u_en4, la, 'x' || i, gen_random_uuid(), 'enrolment', now() - make_interval(hours => i));
  END LOOP;
  PERFORM pg_temp.check_eq('en4 (9 of 10 today) on LCA: accepted and analysed [positive control]',
    pg_temp.send(u_en4, cc, lca, gen_random_uuid()), 'ok:enrolment:true');
  sx := gen_random_uuid();
  PERFORM pg_temp.check_eq('en3 (10 of 10 today) on LCA: accepted, NOT analysed (an AI cap never blocks a cohort take)',
    pg_temp.send(u_en3, cc, lca, sx), 'ok:enrolment:false');
  PERFORM pg_temp.check_eq('en3: the take exists, with no analysis row',
    (SELECT count(*)::text FROM voice_submissions WHERE id = sx) || '/' ||
    (SELECT count(*)::text FROM voice_analyses WHERE submission_id = sx), '1/0');
  PERFORM pg_temp.check_eq('a self-paced learner at the same count (d: 10 in the window) is refused daily_cap while en3 was accepted',
    left(pg_temp.send(u_d, cs, la, gen_random_uuid()), 16), 'PT429|daily_cap|');

  -- ── 4. Hide: a hidden analysis gives its send back -------------------------
  s := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  PERFORM pg_temp.check_eq('h send 1', pg_temp.send(u_h, cs, la, s[1]), 'ok:self_paced:true');
  PERFORM pg_temp.check_eq('h send 2', pg_temp.send(u_h, cs, la, s[2]), 'ok:self_paced:true');
  PERFORM pg_temp.check_eq('h send 3', pg_temp.send(u_h, cs, la, s[3]), 'ok:self_paced:true');
  sh3 := s[3];
  PERFORM pg_temp.check_eq('h send 4: refused before the hide', pg_temp.send(u_h, cs, la, s[4]), 'PT429|task_cap|');
  -- A pending analysis cannot be hidden (only 'done'); pq's take on LA is pending.
  sq := (SELECT id FROM voice_submissions WHERE user_id = u_pq AND lesson_id = la);
  PERFORM pg_temp.check_eq('hide: ed on a pending analysis: not_done', pg_temp.hide(u_ed, sq), 'not_done');
  PERFORM pg_temp.check_eq('finish: the service role finishes h''s analysis [positive control for the late-result case below]',
    pg_temp.finish(sh3), 'true');
  PERFORM pg_temp.check_eq('finish again on a done analysis: false (nothing to finish)', pg_temp.finish(sh3), 'false');

  -- Reads, before the hide.
  PERFORM pg_temp.check_eq('read: h (owner) sees their analysis', pg_temp.sees(u_h, sh3), '1');
  PERFORM pg_temp.check_eq('read: pq (another learner) sees none', pg_temp.sees(u_pq, sh3), '0');
  PERFORM pg_temp.check_eq('read: ed (editor of CS) sees it', pg_temp.sees(u_ed, sh3), '1');
  PERFORM pg_temp.check_eq('read: edc (editor of another course) sees none', pg_temp.sees(u_edc, sh3), '0');
  PERFORM pg_temp.check_eq('read: anon has no grant', pg_temp.as_anon(format($q$ SELECT count(*)::text FROM public.voice_analyses WHERE submission_id = %L $q$, sh3)), 'ERR:42501');
  PERFORM pg_temp.check_eq('read: the owner can read the transcript column [positive control]',
    pg_temp.as_user(u_h, format($q$ SELECT transcript FROM public.voice_analyses WHERE submission_id = %L $q$, sh3)), 'hello world');
  PERFORM pg_temp.check_eq('read: the owner cannot read usage', pg_temp.as_user(u_h, format($q$ SELECT usage::text FROM public.voice_analyses WHERE submission_id = %L $q$, sh3)), 'ERR:42501');
  PERFORM pg_temp.check_eq('read: an editor cannot read usage either', pg_temp.as_user(u_ed, format($q$ SELECT usage::text FROM public.voice_analyses WHERE submission_id = %L $q$, sh3)), 'ERR:42501');
  PERFORM pg_temp.check_eq('read: nobody reads the ledger (owner)', pg_temp.as_user(u_h, 'SELECT count(*)::text FROM public.voice_analysis_sends'), 'ERR:42501');
  -- No app role writes.
  PERFORM pg_temp.check_eq('write: owner UPDATE refused', pg_temp.as_user(u_h, format($q$ WITH u AS (UPDATE public.voice_analyses SET status = 'pending' WHERE submission_id = %L RETURNING 1) SELECT count(*)::text FROM u $q$, sh3)), 'ERR:42501');
  PERFORM pg_temp.check_eq('write: editor UPDATE refused', pg_temp.as_user(u_ed, format($q$ WITH u AS (UPDATE public.voice_analyses SET hidden_at = now() WHERE submission_id = %L RETURNING 1) SELECT count(*)::text FROM u $q$, sh3)), 'ERR:42501');
  PERFORM pg_temp.check_eq('write: owner DELETE refused', pg_temp.as_user(u_h, format($q$ WITH d AS (DELETE FROM public.voice_analyses WHERE submission_id = %L RETURNING 1) SELECT count(*)::text FROM d $q$, sh3)), 'ERR:42501');
  PERFORM pg_temp.check_eq('write: owner INSERT refused', pg_temp.as_user(u_h, format($q$ WITH i AS (INSERT INTO public.voice_analyses (submission_id, send_id) VALUES (%L, gen_random_uuid()) RETURNING 1) SELECT count(*)::text FROM i $q$, gen_random_uuid())), 'ERR:42501');
  PERFORM pg_temp.check_eq('write: authenticated cannot call finish / fail',
    pg_temp.as_user(u_h, format($q$ SELECT public.voice_analysis_finish(%L, 't', '{}'::jsonb, 'first', 'v1', 'm', '{}'::jsonb)::text $q$, sh3)) || '/' ||
    pg_temp.as_user(u_h, format($q$ SELECT public.voice_analysis_fail(%L, 'x')::text $q$, sh3)), 'ERR:42501/ERR:42501');
  PERFORM pg_temp.check_eq('write: nothing above changed the analysis',
    (SELECT status || '/' || (hidden_at IS NULL)::text FROM voice_analyses WHERE submission_id = sh3), 'done/true');

  -- Who may hide.
  PERFORM pg_temp.check_eq('hide: the learner (owner): forbidden', pg_temp.hide(u_h, sh3), 'forbidden');
  PERFORM pg_temp.check_eq('hide: another learner: forbidden', pg_temp.hide(u_pq, sh3), 'forbidden');
  PERFORM pg_temp.check_eq('hide: an editor of another course (active seat): forbidden', pg_temp.hide(u_edc, sh3), 'forbidden');
  PERFORM pg_temp.check_eq('hide: an editor of this course with a LAPSED seat: seat_lapsed', pg_temp.hide(u_edl, sh3), 'seat_lapsed');
  PERFORM pg_temp.check_eq('hide: anon cannot call it', pg_temp.as_anon(format('SELECT public.hide_voice_analysis(%L)::text', sh3)), 'ERR:42501');
  PERFORM pg_temp.check_eq('hide: a take that does not exist: forbidden (no probing)', pg_temp.hide(u_ed, gen_random_uuid()), 'forbidden');
  PERFORM pg_temp.check_eq('after every refusal: still shown, still counted',
    (SELECT (a.hidden_at IS NULL)::text || '/' || s2.counted::text FROM voice_analyses a JOIN voice_analysis_sends s2 ON s2.id = a.send_id WHERE a.submission_id = sh3), 'true/true');
  PERFORM pg_temp.check_eq('hide: ed (editor, active seat) hides it [positive control]', pg_temp.hide(u_ed, sh3), 'ok');
  PERFORM pg_temp.check_eq('hide again: ok, already hidden', pg_temp.hide(u_ed, sh3), 'ok:already');
  PERFORM pg_temp.check_eq('the send is given back: uncounted for reason hidden',
    (SELECT counted::text || '/' || uncounted_reason FROM voice_analysis_sends WHERE submission_id = sh3), 'false/hidden');
  PERFORM pg_temp.check_eq('read after the hide: the owner sees none, the editor still sees it',
    pg_temp.sees(u_h, sh3) || '/' || pg_temp.sees(u_ed, sh3), '0/1');
  PERFORM pg_temp.check_eq('h send after the hide: accepted again', pg_temp.send(u_h, cs, la, s[5]), 'ok:self_paced:true');
  PERFORM pg_temp.check_eq('h: the take is send 5, and the ledger has 4 rows, 3 counted',
    (SELECT id = s[5] FROM voice_submissions WHERE user_id = u_h AND lesson_id = la)::text || '/' ||
    (SELECT count(*)::text || '/' || count(*) FILTER (WHERE counted)::text FROM voice_analysis_sends WHERE user_id = u_h AND lesson_id = la), 'true/4/3');
  PERFORM pg_temp.check_eq('h send 6: refused again (3 counted)', pg_temp.send(u_h, cs, la, gen_random_uuid()), 'PT429|task_cap|');

  -- ── 5. A late result for a replaced take writes nothing -------------------
  sl1 := gen_random_uuid(); sl2 := gen_random_uuid();
  PERFORM pg_temp.check_eq('l send 1', pg_temp.send(u_l, cs, la, sl1), 'ok:self_paced:true');
  PERFORM pg_temp.check_eq('l send 2 (replaces send 1)', pg_temp.send(u_l, cs, la, sl2), 'ok:self_paced:true');
  PERFORM pg_temp.check_eq('late: the result for the replaced take: false', pg_temp.finish(sl1), 'false');
  PERFORM pg_temp.check_eq('late: no analysis row exists for it, and the live take''s is still pending',
    (SELECT count(*)::text FROM voice_analyses WHERE submission_id = sl1) || '/' ||
    (SELECT status FROM voice_analyses WHERE submission_id = sl2), '0/pending');
  PERFORM pg_temp.check_eq('late: the failure report for the replaced take: false (and nothing uncounted)',
    pg_temp.as_service(format($q$ SELECT public.voice_analysis_fail(%L, 'late')::text $q$, sl1)) || '/' ||
    (SELECT count(*)::text FROM voice_analysis_sends WHERE user_id = u_l AND NOT counted), 'false/0');
  PERFORM pg_temp.check_eq('the result for the live take: true [positive control]', pg_temp.finish(sl2), 'true');
  PERFORM pg_temp.check_eq('the live take''s analysis is done, with its fields',
    (SELECT status || '/' || transcript || '/' || instruction || '/' || prompt_version || '/' || model FROM voice_analyses WHERE submission_id = sl2),
    'done/hello world/first/v1/claude-sonnet-5-5');

  -- ── 6. Failed on our side gives the send back -----------------------------
  s := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  PERFORM pg_temp.check_eq('f send 1', pg_temp.send(u_f, cs, la, s[1]), 'ok:self_paced:true');
  PERFORM pg_temp.check_eq('f send 2', pg_temp.send(u_f, cs, la, s[2]), 'ok:self_paced:true');
  PERFORM pg_temp.check_eq('f send 3', pg_temp.send(u_f, cs, la, s[3]), 'ok:self_paced:true');
  sf3 := s[3];
  PERFORM pg_temp.check_eq('f send 4: refused before the failure', pg_temp.send(u_f, cs, la, s[4]), 'PT429|task_cap|');
  PERFORM pg_temp.check_eq('fail: the service role marks send 3 failed',
    pg_temp.as_service(format($q$ SELECT public.voice_analysis_fail(%L, 'provider timeout')::text $q$, sf3)), 'true');
  PERFORM pg_temp.check_eq('fail: the analysis is failed and its send uncounted for reason failed',
    (SELECT a.status || '/' || a.failure || '/' || s2.counted::text || '/' || s2.uncounted_reason
       FROM voice_analyses a JOIN voice_analysis_sends s2 ON s2.id = a.send_id WHERE a.submission_id = sf3), 'failed/provider timeout/false/failed');
  PERFORM pg_temp.check_eq('fail again: false', pg_temp.as_service(format($q$ SELECT public.voice_analysis_fail(%L, 'x')::text $q$, sf3)), 'false');
  PERFORM pg_temp.check_eq('f send after the failure: accepted again', pg_temp.send(u_f, cs, la, gen_random_uuid()), 'ok:self_paced:true');

  -- ── 7. Account deletion removes the ledger and the analyses ---------------
  PERFORM pg_temp.check_eq('x send', pg_temp.send(u_x, cs, la, gen_random_uuid()), 'ok:self_paced:true');
  PERFORM pg_temp.check_eq('x before deleting: 1 ledger row, 1 analysis',
    (SELECT count(*)::text FROM voice_analysis_sends WHERE user_id = u_x) || '/' ||
    (SELECT count(*)::text FROM voice_analyses a JOIN voice_submissions v ON v.id = a.submission_id WHERE v.user_id = u_x), '1/1');
  PERFORM pg_temp.check_eq('delete_my_account: ok', pg_temp.as_user(u_x, 'SELECT (public.delete_my_account())->>''ok'''), 'true');
  PERFORM pg_temp.check_eq('delete_my_account: x''s ledger rows and analyses are gone',
    (SELECT count(*)::text FROM voice_analysis_sends WHERE user_id = u_x) || '/' ||
    (SELECT count(*)::text FROM voice_analyses a JOIN voice_submissions v ON v.id = a.submission_id WHERE v.user_id = u_x), '0/0');
  PERFORM pg_temp.check_eq('delete_my_account: another learner''s ledger rows are untouched [positive control]',
    (SELECT (count(*) > 0)::text FROM voice_analysis_sends WHERE user_id = u_h), 'true');

  RAISE NOTICE 'VOICE-011 PASS: 096 full protocol (% asserted cells)', (SELECT n FROM pg_temp.tally);
END;
$$;

ROLLBACK;
