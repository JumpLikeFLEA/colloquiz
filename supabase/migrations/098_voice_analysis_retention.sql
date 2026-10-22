-- ============================================================
-- 098_voice_analysis_retention.sql
--
-- VOICE-016 (#241). Transcripts and analyses follow the audio (docs/decisions/0156
-- Decision 7). Choices made while writing this file are in docs/decisions/0195.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time and again
-- before commit:
--   latest migration before this one        -> 097_voice_analysis_pipeline.sql
--   latest body of the account-delete RPC   -> 096_voice_analyses.sql. NOT re-emitted:
--     erasure already leaves no analysis (cascade from voice_submissions) and no ledger
--     row (096's added DELETE); this card only proves it (supabase/verify/098).
--   latest body of voice_mark_removed       -> 060_voice_submissions.sql (094 re-emits
--     voice_purge_due, not this). Re-emitted below with one added statement.
--
-- ── 1. my_voice_analyses_export ─────────────────────────────────────────
-- The caller's own analyses, HIDDEN ONES TOO. The owner's RLS policy on voice_analyses
-- hides a withdrawn row from the owner, so the export cannot read the table; this
-- definer function keys off auth.uid() and returns the rows. Not returned: usage (our
-- cost), failure (an internal string), hidden_by (another person), lease_until, send_id.
--
-- ── 2. voice_mark_removed ───────────────────────────────────────────────
-- 060's body, plus: the analysis of each take that is marked purged is deleted in the
-- same statement, so the audio, the transcript and the analysis go together
-- (0156 Decision 7; "Rejected: keeping the analysis after the audio is purged").
-- The function only touches takes whose object_name is in the list, so a replaced take
-- (row already gone) and an erased account (rows already gone) are unaffected.
--
-- ── 3. voice_purge_ledger ───────────────────────────────────────────────
-- Ledger rows older than 6 months are deleted. A row still referenced by an analysis is
-- kept (voice_analyses.send_id is ON DELETE CASCADE, so deleting it would delete a live
-- analysis early: a cohort take is purged 6 months after the RUN ends, up to a run's
-- length after its send). That analysis goes at its own purge, and the ledger row on the
-- next run. Called by the voice-purge cron after the objects are removed.
--
-- Not destructive: no table or column is dropped, no existing row is changed by the
-- migration itself. The two functions delete rows only when the purge cron calls them.
-- Safe to re-apply: CREATE OR REPLACE.
-- ============================================================

BEGIN;

-- ── 1. Export ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION my_voice_analyses_export()
RETURNS TABLE (
  submission_id          UUID,
  status                 TEXT,
  instruction            TEXT,
  transcript             TEXT,
  result                 JSONB,
  prompt_version         TEXT,
  model                  TEXT,
  baseline_submission_id UUID,
  hidden_at              TIMESTAMPTZ,
  created_at             TIMESTAMPTZ,
  finished_at            TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.submission_id, a.status, a.instruction, a.transcript, a.result,
         a.prompt_version, a.model, a.baseline_submission_id, a.hidden_at,
         a.created_at, a.finished_at
  FROM voice_analyses a
  JOIN voice_submissions s ON s.id = a.submission_id
  WHERE s.user_id = (SELECT auth.uid())
  ORDER BY a.created_at DESC;
$$;

REVOKE ALL ON FUNCTION my_voice_analyses_export() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_voice_analyses_export() TO authenticated;


-- ── 2. voice_mark_removed (re-emitted from 060) ─────────────────────────
-- Called with the names the Storage API removed (or reported as already gone). A take
-- purged for retention keeps its row, with object_name NULL and purged_at set; its
-- analysis (transcript and result) is deleted; queued names leave the queue.
CREATE OR REPLACE FUNCTION voice_mark_removed(p_names TEXT[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_marked INTEGER;
BEGIN
  WITH marked AS (
    UPDATE voice_submissions
       SET object_name = NULL,
           purged_at   = now()
     WHERE object_name = ANY(p_names)
    RETURNING id
  ),
  gone AS (
    DELETE FROM voice_analyses a
    USING marked m
    WHERE a.submission_id = m.id
    RETURNING a.submission_id
  )
  SELECT count(*) INTO v_marked FROM marked;

  DELETE FROM voice_object_deletions WHERE object_name = ANY(p_names);
  RETURN v_marked;
END;
$$;

REVOKE ALL ON FUNCTION voice_mark_removed(TEXT[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION voice_mark_removed(TEXT[]) TO service_role;


-- ── 3. voice_purge_ledger ───────────────────────────────────────────────
-- p_now exists for the protocol; the route passes nothing.
CREATE OR REPLACE FUNCTION voice_purge_ledger(p_now TIMESTAMPTZ DEFAULT now())
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM voice_analysis_sends s
  WHERE s.created_at + INTERVAL '6 months' <= p_now
    AND NOT EXISTS (SELECT 1 FROM voice_analyses a WHERE a.send_id = s.id);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION voice_purge_ledger(TIMESTAMPTZ) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION voice_purge_ledger(TIMESTAMPTZ) TO service_role;

COMMIT;
