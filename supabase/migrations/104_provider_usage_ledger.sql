-- ============================================================
-- 104_provider_usage_ledger.sql
--
-- OPS-031: a durable ledger of paid provider calls (docs/decisions/0207 Decisions 2-5).
-- Claude and AssemblyAI usage was stored only in voice_analyses.usage (096/097) and
-- course_imports.usage (103), rows that are deleted with a take or an account, and a refused
-- or cut-off call stored nothing. This table keeps one row per provider call, for the Studio
-- costs dashboard (OPS-032) and the sponsor report (OPS-033).
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time:
--   latest migration before this one        -> 103_course_imports.sql
--   latest body of the account-delete RPC   -> 103_course_imports.sql. NOT re-emitted: the
--     ledger holds no user id (0207 Decision 2), so there is nothing in it to erase.
-- REQUIRES 096/097 (voice_analyses, its usage keys), 103 (course_imports) and is_admin (027).
--
-- ── 1. provider_usage_events ────────────────────────────────────────────
-- One row per call: provider, feature, model, the pipeline step, token counts (Claude) or
-- audio seconds (AssemblyAI), and an outcome:
--   ok      an answer came back and its usage was read;
--   failed  the provider ran but the answer was refused, cut off or unparsable.
-- A failed call whose usage the SDK dropped has NULL token counts ("unknown usage" on the
-- dashboard, never $0; 0207 Decision 4). NO user id and NO take or import id (Decision 2).
-- RLS on with no policies, and no table grants to anon or authenticated: only the functions
-- below read or write it.
--
-- ── 2. record_provider_usage(...)   service_role only ─────────────────────
-- What lib/voice/analysis/server.ts and lib/courseImport/server.ts call after each provider
-- call (they already run as the service role).
--
-- ── 3. admin_usage_summary(from, to), admin_usage_ledger_start()   admins only ──
-- Totals per UTC day x provider x feature x model x outcome, and the first row's time, for
-- the dashboard. Raise insufficient_privilege for anyone else.
--
-- ── 4. Backfill ─────────────────────────────────────────────────────────
-- Copies the usage still stored in voice_analyses (a Claude row where usage has inputTokens,
-- an AssemblyAI row where it has audioSeconds) and in each element of course_imports.usage,
-- with source = 'backfill'. Times are the closest the source keeps: finished_at (else
-- updated_at) for a voice analysis, created_at for the AssemblyAI half and for an import's
-- calls. The STT model is not stored per row; _backfill_provider_usage() names STT_MODEL from
-- lib/voice/analysis/assemblyai.ts, the only model the pipeline has used. It runs only when
-- no backfill row exists yet, so re-applying adds nothing.
--
-- Not destructive: no DROP, no TRUNCATE, no UPDATE or DELETE of an existing row. Safe to
-- re-apply: IF NOT EXISTS, CREATE OR REPLACE, and a backfill that returns 0 once any backfill
-- row exists.
-- ============================================================

BEGIN;

-- ── 1. provider_usage_events ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_usage_events (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider           TEXT NOT NULL CHECK (provider IN ('anthropic', 'assemblyai')),
  feature            TEXT NOT NULL CHECK (feature IN ('voice_analysis', 'course_import')),
  model              TEXT NOT NULL CHECK (length(model) BETWEEN 1 AND 100),
  step               TEXT CHECK (step IS NULL OR length(step) <= 60),
  input_tokens       INTEGER CHECK (input_tokens >= 0),
  output_tokens      INTEGER CHECK (output_tokens >= 0),
  cache_write_tokens INTEGER CHECK (cache_write_tokens >= 0),
  cache_read_tokens  INTEGER CHECK (cache_read_tokens >= 0),
  audio_seconds      NUMERIC(10, 2) CHECK (audio_seconds >= 0),
  outcome            TEXT NOT NULL CHECK (outcome IN ('ok', 'failed')),
  source             TEXT NOT NULL DEFAULT 'live' CHECK (source IN ('live', 'backfill')),
  -- Claude rows carry tokens and no audio; AssemblyAI rows the reverse.
  CONSTRAINT provider_usage_shape CHECK (
    (provider = 'anthropic' AND audio_seconds IS NULL)
    OR (provider = 'assemblyai' AND input_tokens IS NULL AND output_tokens IS NULL
        AND cache_write_tokens IS NULL AND cache_read_tokens IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS provider_usage_events_occurred_at ON provider_usage_events (occurred_at);

ALTER TABLE provider_usage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE provider_usage_events FROM PUBLIC, anon, authenticated;

-- ── 2. record_provider_usage ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_provider_usage(
  p_provider           TEXT,
  p_feature            TEXT,
  p_model              TEXT,
  p_step               TEXT,
  p_input_tokens       INTEGER,
  p_output_tokens      INTEGER,
  p_cache_write_tokens INTEGER,
  p_cache_read_tokens  INTEGER,
  p_audio_seconds      NUMERIC,
  p_outcome            TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO provider_usage_events (
    provider, feature, model, step, input_tokens, output_tokens,
    cache_write_tokens, cache_read_tokens, audio_seconds, outcome
  ) VALUES (
    p_provider, p_feature, p_model, p_step, p_input_tokens, p_output_tokens,
    p_cache_write_tokens, p_cache_read_tokens, p_audio_seconds, p_outcome
  );
$$;

REVOKE ALL ON FUNCTION record_provider_usage(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_provider_usage(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT)
  TO service_role;

-- ── 3. Admin reads ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_usage_summary(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (
  day                DATE,
  provider           TEXT,
  feature            TEXT,
  model              TEXT,
  outcome            TEXT,
  calls              INTEGER,
  unknown_calls      INTEGER,
  input_tokens       BIGINT,
  output_tokens      BIGINT,
  cache_write_tokens BIGINT,
  cache_read_tokens  BIGINT,
  audio_seconds      NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL OR NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    (e.occurred_at AT TIME ZONE 'UTC')::DATE,
    e.provider,
    e.feature,
    e.model,
    e.outcome,
    count(*)::INTEGER,
    -- A Claude call with no token counts: the SDK dropped its usage (0207 Decision 4).
    count(*) FILTER (WHERE e.provider = 'anthropic' AND e.input_tokens IS NULL)::INTEGER,
    COALESCE(sum(e.input_tokens), 0)::BIGINT,
    COALESCE(sum(e.output_tokens), 0)::BIGINT,
    COALESCE(sum(e.cache_write_tokens), 0)::BIGINT,
    COALESCE(sum(e.cache_read_tokens), 0)::BIGINT,
    COALESCE(sum(e.audio_seconds), 0)::NUMERIC
  FROM provider_usage_events e
  WHERE e.occurred_at >= p_from AND e.occurred_at < p_to
  GROUP BY 1, 2, 3, 4, 5
  ORDER BY 1, 2, 3, 4, 5;
END;
$$;

REVOKE ALL ON FUNCTION admin_usage_summary(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_usage_summary(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION admin_usage_ledger_start()
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN (SELECT min(occurred_at) FROM provider_usage_events);
END;
$$;

REVOKE ALL ON FUNCTION admin_usage_ledger_start() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_usage_ledger_start() TO authenticated;

-- ── 4. Backfill ─────────────────────────────────────────────────────────
-- A function rather than a DO block so that supabase/verify/104 can run it on seeded rows.
-- Owner-only: no role but postgres may call it.
CREATE OR REPLACE FUNCTION _usage_json_int(p JSONB, p_key TEXT)
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
  -- A JSON number, or NULL for anything else (a missing key, a string).
  SELECT CASE WHEN jsonb_typeof(p -> p_key) = 'number' THEN (p ->> p_key)::NUMERIC::INTEGER END
$$;

CREATE OR REPLACE FUNCTION _backfill_provider_usage()
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rows INTEGER := 0;
  v_n    INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM provider_usage_events WHERE source = 'backfill') THEN
    RETURN 0;
  END IF;

  -- Voice analysis, the Claude call.
  INSERT INTO provider_usage_events (
    occurred_at, provider, feature, model, step, input_tokens, output_tokens,
    cache_write_tokens, cache_read_tokens, outcome, source
  )
  SELECT
    COALESCE(v.finished_at, v.updated_at),
    'anthropic', 'voice_analysis', COALESCE(NULLIF(v.model, ''), 'unknown'), v.instruction,
    _usage_json_int(v.usage, 'inputTokens'),
    _usage_json_int(v.usage, 'outputTokens'),
    COALESCE(_usage_json_int(v.usage, 'cacheWriteTokens'), 0),
    COALESCE(_usage_json_int(v.usage, 'cacheReadTokens'), 0),
    'ok', 'backfill'
  FROM voice_analyses v
  WHERE jsonb_typeof(v.usage -> 'inputTokens') = 'number';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_rows := v_rows + v_n;

  -- Voice analysis, the AssemblyAI transcript.
  INSERT INTO provider_usage_events (occurred_at, provider, feature, model, step, audio_seconds, outcome, source)
  SELECT
    v.created_at, 'assemblyai', 'voice_analysis', 'universal-3-5-pro', 'transcript',
    (v.usage ->> 'audioSeconds')::NUMERIC, 'ok', 'backfill'
  FROM voice_analyses v
  WHERE jsonb_typeof(v.usage -> 'audioSeconds') = 'number';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_rows := v_rows + v_n;

  -- Course import, one row per stored call.
  INSERT INTO provider_usage_events (
    occurred_at, provider, feature, model, step, input_tokens, output_tokens,
    cache_write_tokens, cache_read_tokens, outcome, source
  )
  SELECT
    c.created_at, 'anthropic', 'course_import',
    COALESCE(NULLIF(u ->> 'model', ''), NULLIF(c.model, ''), 'unknown'),
    left(u ->> 'step', 60),
    _usage_json_int(u, 'inputTokens'),
    _usage_json_int(u, 'outputTokens'),
    COALESCE(_usage_json_int(u, 'cacheWriteTokens'), 0),
    COALESCE(_usage_json_int(u, 'cacheReadTokens'), 0),
    'ok', 'backfill'
  FROM course_imports c
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(c.usage) = 'array' THEN c.usage ELSE '[]'::JSONB END
  ) AS u
  WHERE jsonb_typeof(u -> 'inputTokens') = 'number';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_rows := v_rows + v_n;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION _usage_json_int(JSONB, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION _backfill_provider_usage() FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE '104: backfilled % row(s)', _backfill_provider_usage();
END;
$$;

COMMIT;
