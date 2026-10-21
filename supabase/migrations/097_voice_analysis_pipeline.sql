-- ============================================================
-- 097_voice_analysis_pipeline.sql
--
-- VOICE-012 (#235). The database half of the analysis pipeline (docs/decisions/0187):
-- the lease that makes a step claimable, the step advance that makes a crash
-- recoverable, the pause that gives a send back, and the sweep for rows stuck over 24 h.
-- 096 left exactly these to this card (docs/decisions/0185 Decisions 9 and 10).
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time and again
-- before commit:
--   latest migration before this one        -> 096_voice_analyses.sql
--   latest body of the account-delete RPC   -> 096 (re-emitted there from 090). NOT
--     re-emitted here: nothing below touches account deletion, and voice_analyses
--     cascades with the takes.
-- Re-emitted bodies: none. Every function below is new.
--
-- ── 1. voice_analyses.stt_job_id ────────────────────────────────────────
-- The speech-to-text job's id, written the moment the job exists, so a run that dies
-- after creating it is picked up again by polling THAT job instead of paying for a
-- second one, and so the transcript at the provider can be deleted by whoever finishes.
-- No grant: authenticated has column-level SELECT (096) and this column is not in it.
--
-- ── 2. voice_analysis_claim(submission, lease_seconds)   service_role ───
-- One atomic UPDATE: a non-terminal analysis whose lease is absent or expired gets a new
-- lease. FALSE ("claimed": false) means a live lease holds it, or the row is terminal, or
-- gone (a replaced take's analysis cascaded away). The same call is the first claim by
-- the send's own after() and the re-claim by the status route.
--
-- ── 3. voice_analysis_advance(...)                       service_role ───
-- Moves a row forward only (pending -> transcribing -> analysing), records the job id, the
-- transcript and the take's length in seconds (in `usage`, which finish later replaces
-- with the full figure), and renews the lease. A late or repeated call matches nothing.
-- The seconds are kept so a re-claimed row can still say whether the 180 s cap cut it.
--
-- ── 4. voice_analysis_pause(submission)                  service_role ───
-- 0185 Decision 10: under VOICE_ANALYSIS_MODE paused (or off) the send is given back. The
-- row exists only because SQL cannot see the variable, so a still-pending row is DELETED
-- (no analysis exists) and its ledger row is un-counted with reason 'paused', the value
-- 096's CHECK already allows. Only a pending row: one a provider already touched is not
-- paused, it finishes or fails.
--
-- ── 5. voice_analysis_sweep(age)                         service_role ───
-- Fails every non-terminal analysis older than `age` (24 h by default) the way
-- voice_analysis_fail does (the send is given back), and returns their ids and job ids
-- so the cron route can delete the transcripts still held at the provider.
--
-- Written, not applied to hosted. Safe to re-apply: ADD COLUMN IF NOT EXISTS, CREATE OR
-- REPLACE.
-- ============================================================

BEGIN;

-- ── 1. stt_job_id ───────────────────────────────────────────────────────
ALTER TABLE voice_analyses ADD COLUMN IF NOT EXISTS stt_job_id TEXT;


-- ── 2. claim ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION voice_analysis_claim(p_submission_id UUID, p_lease_seconds INTEGER DEFAULT 150)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status     TEXT;
  v_job        TEXT;
  v_transcript TEXT;
  v_audio      NUMERIC;
  v_seconds    INTEGER := LEAST(GREATEST(COALESCE(p_lease_seconds, 150), 10), 600);
BEGIN
  UPDATE voice_analyses
     SET lease_until = now() + make_interval(secs => v_seconds), updated_at = now()
   WHERE submission_id = p_submission_id
     AND status IN ('pending', 'transcribing', 'analysing')
     AND (lease_until IS NULL OR lease_until <= now())
  RETURNING status, stt_job_id, transcript, (usage->>'audioSeconds')::NUMERIC
       INTO v_status, v_job, v_transcript, v_audio;

  IF FOUND THEN
    RETURN jsonb_build_object('claimed', true, 'status', v_status, 'stt_job_id', v_job,
                              'transcript', v_transcript, 'audio_seconds', v_audio);
  END IF;

  SELECT status INTO v_status FROM voice_analyses WHERE submission_id = p_submission_id;
  RETURN jsonb_build_object('claimed', false, 'status', COALESCE(v_status, 'missing'));
END;
$$;

REVOKE ALL ON FUNCTION voice_analysis_claim(UUID, INTEGER) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION voice_analysis_claim(UUID, INTEGER) TO service_role;


-- ── 3. advance ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION voice_analysis_advance(
  p_submission_id UUID,
  p_status        TEXT,
  p_stt_job_id    TEXT    DEFAULT NULL,
  p_transcript    TEXT    DEFAULT NULL,
  p_audio_seconds NUMERIC DEFAULT NULL,
  p_lease_seconds INTEGER DEFAULT 150
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order   TEXT[] := ARRAY['pending', 'transcribing', 'analysing'];
  v_seconds INTEGER := LEAST(GREATEST(COALESCE(p_lease_seconds, 150), 10), 600);
BEGIN
  IF p_status NOT IN ('transcribing', 'analysing') THEN
    RAISE EXCEPTION 'voice_analysis_advance: % is not a step', p_status;
  END IF;

  UPDATE voice_analyses
     SET status      = p_status,
         stt_job_id  = COALESCE(p_stt_job_id, stt_job_id),
         transcript  = COALESCE(p_transcript, transcript),
         usage       = CASE WHEN p_audio_seconds IS NULL THEN usage
                            ELSE COALESCE(usage, '{}'::jsonb) || jsonb_build_object('audioSeconds', p_audio_seconds) END,
         lease_until = now() + make_interval(secs => v_seconds),
         updated_at  = now()
   WHERE submission_id = p_submission_id
     AND status IN ('pending', 'transcribing', 'analysing')
     AND array_position(v_order, status) <= array_position(v_order, p_status);
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION voice_analysis_advance(UUID, TEXT, TEXT, TEXT, NUMERIC, INTEGER) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION voice_analysis_advance(UUID, TEXT, TEXT, TEXT, NUMERIC, INTEGER) TO service_role;


-- ── 4. pause ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION voice_analysis_pause(p_submission_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_send UUID;
BEGIN
  DELETE FROM voice_analyses
   WHERE submission_id = p_submission_id AND status = 'pending'
  RETURNING send_id INTO v_send;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  UPDATE voice_analysis_sends
     SET counted = FALSE, uncounted_reason = 'paused', uncounted_at = now()
   WHERE id = v_send AND counted;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION voice_analysis_pause(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION voice_analysis_pause(UUID) TO service_role;


-- ── 5. sweep ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION voice_analysis_sweep(p_age INTERVAL DEFAULT INTERVAL '24 hours')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out JSONB;
BEGIN
  WITH stuck AS (
    UPDATE voice_analyses
       SET status = 'failed', failure = 'timeout', lease_until = NULL,
           updated_at = now(), finished_at = now()
     WHERE status IN ('pending', 'transcribing', 'analysing')
       AND created_at < now() - p_age
    RETURNING submission_id, send_id, stt_job_id
  ), given_back AS (
    UPDATE voice_analysis_sends s
       SET counted = FALSE, uncounted_reason = 'failed', uncounted_at = now()
      FROM stuck
     WHERE s.id = stuck.send_id AND s.counted
    RETURNING s.id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('submission_id', submission_id, 'stt_job_id', stt_job_id)), '[]'::jsonb)
    INTO v_out
    FROM stuck;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION voice_analysis_sweep(INTERVAL) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION voice_analysis_sweep(INTERVAL) TO service_role;

COMMIT;
