-- ============================================================
-- supabase/verify/104_provider_usage_ledger.sql
--
-- OPS-031 full protocol for migration 104 (needs 096, 103 applied). NOT a
-- migration: run after 104 is applied, as postgres. Seeds its own data and
-- ROLLS BACK. A failed assertion aborts with "OPS-031 FAIL: ...". Every denial
-- is paired with a positive control, and the backfill is checked on a
-- non-empty seeded set against an independent count of its source rows.
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
    RAISE EXCEPTION 'OPS-031 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

-- A record_provider_usage call as SQL text, for as_role().
CREATE FUNCTION pg_temp.record_sql(p_provider TEXT, p_model TEXT, p_in TEXT, p_audio TEXT, p_outcome TEXT)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT format(
    'SELECT ''ok'' FROM (SELECT public.record_provider_usage(%L, %L, %L, %L, %s, %s, %s, %s, %s, %L)) x',
    p_provider, 'voice_analysis', p_model, 'v104',
    p_in, CASE WHEN p_in = 'NULL' THEN 'NULL' ELSE '50' END,
    CASE WHEN p_in = 'NULL' THEN 'NULL' ELSE '7' END, CASE WHEN p_in = 'NULL' THEN 'NULL' ELSE '3' END,
    p_audio, p_outcome)
$$;

DO $$
DECLARE
  a   UUID := gen_random_uuid();  -- admin
  p   UUID := gen_random_uuid();  -- plain user
  c   UUID; l UUID; v UUID;
  s1  UUID := gen_random_uuid();
  s2  UUID := gen_random_uuid();
  s3  UUID := gen_random_uuid();
  q   UUID := gen_random_uuid();  -- a third user, for the third take
  d1  UUID := gen_random_uuid(); d2 UUID := gen_random_uuid(); d3 UUID := gen_random_uuid();
  doc JSONB := '[{"id":"vt1","kind":"task","type":"voice","prompt":{"paragraphs":[{"runs":[{"text":"Say it"}]}],"maxSeconds":60}}]';
  t_from TEXT := quote_literal((now() - interval '1 day')::text);
  t_to   TEXT := quote_literal((now() + interval '1 day')::text);
  r TEXT;
  v_want INTEGER;
  v_got  INTEGER;
BEGIN
  INSERT INTO auth.users (id, aud, role, email)
  SELECT x, 'authenticated', 'authenticated', 'v104-' || x || '@verify.test' FROM unnest(ARRAY[a, p]) x;
  UPDATE profiles SET role = 'admin' WHERE id = a;

  -- A database that already holds ledger rows (a backfill, or live calls) would add to the totals
  -- checked below. Start this transaction from an empty table; the ROLLBACK restores them.
  DELETE FROM provider_usage_events;

  -- ── 0. Static facts ─────────────────────────────────────────────────────
  PERFORM pg_temp.check_eq('RLS is on and the table has no policy',
    (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.provider_usage_events'::regclass) || '/' ||
    (SELECT count(*)::text FROM pg_policies WHERE tablename = 'provider_usage_events'), 'true/0');
  PERFORM pg_temp.check_eq('anon and authenticated hold no table privilege; postgres does (positive control)',
    has_table_privilege('anon', 'public.provider_usage_events', 'SELECT')::text || '/' ||
    has_table_privilege('authenticated', 'public.provider_usage_events', 'SELECT')::text || '/' ||
    has_table_privilege('authenticated', 'public.provider_usage_events', 'INSERT')::text || '/' ||
    has_table_privilege('postgres', 'public.provider_usage_events', 'SELECT')::text, 'false/false/false/true');
  PERFORM pg_temp.check_eq('the table has no column naming a user, a take or an import',
    (SELECT count(*)::text FROM information_schema.columns WHERE table_name = 'provider_usage_events'
       AND column_name ~ '(user|submission|import|course|lesson|profile)'), '0');

  -- ── 1. Writes ───────────────────────────────────────────────────────────
  PERFORM pg_temp.check_eq('service_role records a Claude call',
    pg_temp.as_service(pg_temp.record_sql('anthropic', 'claude-sonnet-5-5', '100', 'NULL', 'ok')), 'ok');
  PERFORM pg_temp.check_eq('service_role records a second Claude call',
    pg_temp.as_service(pg_temp.record_sql('anthropic', 'claude-sonnet-5-5', '200', 'NULL', 'ok')), 'ok');
  PERFORM pg_temp.check_eq('service_role records a failed call whose usage is unknown',
    pg_temp.as_service(pg_temp.record_sql('anthropic', 'claude-sonnet-5-5', 'NULL', 'NULL', 'failed')), 'ok');
  PERFORM pg_temp.check_eq('service_role records a transcript',
    pg_temp.as_service(pg_temp.record_sql('assemblyai', 'universal-3-5-pro', 'NULL', '61.5', 'ok')), 'ok');
  PERFORM pg_temp.check_eq('...four rows written (step v104)',
    (SELECT count(*)::text FROM provider_usage_events WHERE step = 'v104'), '4');

  PERFORM pg_temp.check_eq('an AssemblyAI row with tokens is refused by the shape check',
    pg_temp.as_service(pg_temp.record_sql('assemblyai', 'universal-3-5-pro', '10', '5', 'ok')), 'ERR:23514');
  PERFORM pg_temp.check_eq('a Claude row with audio seconds is refused by the shape check',
    pg_temp.as_service(pg_temp.record_sql('anthropic', 'claude-sonnet-5-5', '10', '5', 'ok')), 'ERR:23514');
  PERFORM pg_temp.check_eq('an unknown provider is refused',
    pg_temp.as_service(pg_temp.record_sql('openai', 'x', '10', 'NULL', 'ok')), 'ERR:23514');

  PERFORM pg_temp.check_eq('an admin cannot call record_provider_usage',
    pg_temp.as_user(a, pg_temp.record_sql('anthropic', 'claude-sonnet-5-5', '1', 'NULL', 'ok')), 'ERR:42501');
  PERFORM pg_temp.check_eq('a plain user cannot either',
    pg_temp.as_user(p, pg_temp.record_sql('anthropic', 'claude-sonnet-5-5', '1', 'NULL', 'ok')), 'ERR:42501');
  PERFORM pg_temp.check_eq('anon cannot either',
    pg_temp.as_anon(pg_temp.record_sql('anthropic', 'claude-sonnet-5-5', '1', 'NULL', 'ok')), 'ERR:42501');
  PERFORM pg_temp.check_eq('a user cannot INSERT into the table directly',
    pg_temp.as_user(p, $q$INSERT INTO public.provider_usage_events (provider, feature, model, outcome)
      VALUES ('anthropic', 'voice_analysis', 'x', 'ok') RETURNING 'inserted'$q$), 'ERR:42501');
  PERFORM pg_temp.check_eq('...still four rows: the refused writes left nothing',
    (SELECT count(*)::text FROM provider_usage_events WHERE step = 'v104'), '4');

  -- ── 2. Reads ────────────────────────────────────────────────────────────
  r := pg_temp.as_user(a, format(
    $q$SELECT string_agg(concat_ws(':', provider, outcome, calls, unknown_calls, input_tokens, output_tokens,
         cache_write_tokens, cache_read_tokens, audio_seconds), ',' ORDER BY provider, outcome)
       FROM public.admin_usage_summary(%s, %s) WHERE model IN ('claude-sonnet-5-5', 'universal-3-5-pro')$q$, t_from, t_to));
  PERFORM pg_temp.check_eq('an admin reads the totals: 2 ok Claude calls summed, 1 failed with unknown usage, 1 transcript',
    r, 'anthropic:failed:1:1:0:0:0:0:0,anthropic:ok:2:0:300:100:14:6:0,assemblyai:ok:1:0:0:0:0:0:61.50');
  PERFORM pg_temp.check_eq('a plain user is refused the summary',
    pg_temp.as_user(p, format('SELECT count(*)::text FROM public.admin_usage_summary(%s, %s)', t_from, t_to)), 'ERR:42501');
  PERFORM pg_temp.check_eq('anon is refused the summary',
    pg_temp.as_anon(format('SELECT count(*)::text FROM public.admin_usage_summary(%s, %s)', t_from, t_to)), 'ERR:42501');
  PERFORM pg_temp.check_eq('a window that excludes the rows returns none of them (the admin read above is the control)',
    pg_temp.as_user(a, $q$SELECT count(*)::text FROM public.admin_usage_summary('2000-01-01', '2000-02-01')$q$), '0');
  PERFORM pg_temp.check_eq('the admin cannot SELECT the table directly either: only through the function',
    pg_temp.as_user(a, 'SELECT count(*)::text FROM public.provider_usage_events'), 'ERR:42501');
  PERFORM pg_temp.check_eq('an admin reads the ledger start; a plain user is refused',
    (pg_temp.as_user(a, 'SELECT (public.admin_usage_ledger_start() IS NOT NULL)::text')) || '/' ||
    pg_temp.as_user(p, 'SELECT public.admin_usage_ledger_start()::text'), 'true/ERR:42501');

  -- ── 3. Backfill ─────────────────────────────────────────────────────────
  -- Three takes (one user each: a self-paced take is one per user, lesson and block) and two
  -- imports, with distinctive numbers so the seeded rows are found among any real ones.
  INSERT INTO auth.users (id, aud, role, email) VALUES (q, 'authenticated', 'authenticated', 'v104-' || q || '@verify.test');
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url) VALUES ('v104-c', 'C', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO c;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (c, 1, 'L', 'l', 'anyone') RETURNING id INTO l;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (l, doc, 'editor') RETURNING id INTO v;
  UPDATE lessons SET published_version_id = v WHERE id = l;
  INSERT INTO voice_submissions (id, enrolment_id, user_id, course_id, lesson_id, block_id, lesson_version_id, object_name, content_type)
  VALUES (s1, NULL, p, c, l, 'vt1', v, 'v104/' || s1, 'audio/webm'),
         (s2, NULL, a, c, l, 'vt1', v, 'v104/' || s2, 'audio/webm'),
         (s3, NULL, q, c, l, 'vt1', v, 'v104/' || s3, 'audio/webm');
  INSERT INTO voice_analysis_sends (id, user_id, lesson_id, block_id, submission_id, slot)
  VALUES (d1, p, l, 'vt1', s1, 'self_paced'), (d2, a, l, 'vt1', s2, 'self_paced'), (d3, q, l, 'vt1', s3, 'self_paced');
  -- s1: analysed (Claude + transcript); s2: failed after the transcript (transcript only);
  -- s3: pending, nothing spent.
  INSERT INTO voice_analyses (submission_id, send_id, status, instruction, model, usage, finished_at) VALUES
    (s1, d1, 'done', 'first', 'claude-sonnet-5-5',
     '{"inputTokens":104001,"outputTokens":500,"cacheWriteTokens":10,"cacheReadTokens":20,"audioSeconds":104.25}', now()),
    (s2, d2, 'failed', NULL, NULL, '{"audioSeconds":104.5}', NULL),
    (s3, d3, 'pending', NULL, NULL, '{}', NULL);
  INSERT INTO course_imports (user_id, format, title, slug, level, status, model, usage) VALUES
    (a, 'pdf', 'I1', 'v104-i1', 'B1', 'done', 'claude-opus-5-5',
     '[{"step":"plan","model":"claude-opus-5-5","inputTokens":104002,"outputTokens":1,"cacheWriteTokens":0,"cacheReadTokens":0},
       {"step":"lesson-1","model":"claude-opus-5-5","inputTokens":104003,"outputTokens":1,"cacheWriteTokens":0,"cacheReadTokens":0},
       {"step":"lesson-1-repair","model":"claude-opus-5-5","inputTokens":104004,"outputTokens":1,"cacheWriteTokens":0,"cacheReadTokens":5}]'),
    (a, 'markdown', 'I2', 'v104-i2', 'B1', 'failed', NULL, '[]');

  -- The backfill runs once per database; start this transaction from none (rolled back).
  DELETE FROM provider_usage_events WHERE source = 'backfill';

  -- Independent count of what should be copied, per source, written apart from the function.
  v_want :=
    (SELECT count(*) FROM voice_analyses WHERE (usage ->> 'inputTokens') ~ '^[0-9]+$')
    + (SELECT count(*) FROM voice_analyses WHERE (usage ->> 'audioSeconds') ~ '^[0-9.]+$')
    + (SELECT count(*) FROM course_imports ci, jsonb_array_elements(CASE WHEN jsonb_typeof(ci.usage) = 'array' THEN ci.usage ELSE '[]' END) e
        WHERE (e ->> 'inputTokens') ~ '^[0-9]+$');
  PERFORM pg_temp.check_eq('the source holds rows to copy (guards the equality below)', (v_want >= 6)::text, 'true');

  PERFORM pg_temp.check_eq('service_role cannot run the backfill; only the owner can',
    pg_temp.as_service('SELECT public._backfill_provider_usage()::text'), 'ERR:42501');
  v_got := _backfill_provider_usage();
  PERFORM pg_temp.check_eq('the backfill copies exactly the independent count', v_got::text, v_want::text);
  PERFORM pg_temp.check_eq('...and the ledger now holds that many backfill rows',
    (SELECT count(*)::text FROM provider_usage_events WHERE source = 'backfill'), v_want::text);
  PERFORM pg_temp.check_eq('the seeded take: one Claude row with its tokens and step',
    (SELECT concat_ws(':', provider, feature, model, step, output_tokens, cache_write_tokens, cache_read_tokens, outcome)
       FROM provider_usage_events WHERE source = 'backfill' AND input_tokens = 104001),
    'anthropic:voice_analysis:claude-sonnet-5-5:first:500:10:20:ok');
  PERFORM pg_temp.check_eq('the two seeded transcripts, the failed take''s included',
    (SELECT string_agg(concat_ws(':', provider, model, audio_seconds), ',' ORDER BY audio_seconds)
       FROM provider_usage_events WHERE source = 'backfill' AND audio_seconds IN (104.25, 104.5)),
    'assemblyai:universal-3-5-pro:104.25,assemblyai:universal-3-5-pro:104.50');
  PERFORM pg_temp.check_eq('the seeded import: one row per call, with its step',
    (SELECT string_agg(concat_ws(':', feature, model, step), ',' ORDER BY input_tokens)
       FROM provider_usage_events WHERE source = 'backfill' AND input_tokens BETWEEN 104002 AND 104004),
    'course_import:claude-opus-5-5:plan,course_import:claude-opus-5-5:lesson-1,course_import:claude-opus-5-5:lesson-1-repair');
  PERFORM pg_temp.check_eq('a second run adds nothing', _backfill_provider_usage()::text, '0');

  RAISE NOTICE 'OPS-031 PASS: 104 full protocol';
END;
$$;

ROLLBACK;
