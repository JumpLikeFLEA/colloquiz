-- ============================================================
-- 008_subject_stats_rpc.sql
--
-- Home's subject grid needs a per-subject question count and the set of
-- difficulties present. Previously the app pulled EVERY approved+shared
-- question row (subject, difficulty) and counted them in JS. Replace that
-- full-row scan with a DB-side GROUP BY so only ~(#subjects × 3) rows return.
--
-- Safe to re-apply: CREATE OR REPLACE + IF NOT EXISTS.
--
-- Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================

-- SECURITY INVOKER (the default): the anon key used by getSubjectStats() still
-- only sees approved+shared rows via the existing "questions: public read
-- approved" RLS policy. The WHERE is explicit for clarity and index use.
CREATE OR REPLACE FUNCTION get_subject_stats()
RETURNS TABLE (subject TEXT, difficulty TEXT, cnt BIGINT)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT subject, difficulty, COUNT(*)
  FROM questions
  WHERE status = 'approved' AND visibility = 'shared'
  GROUP BY subject, difficulty;
$$;

GRANT EXECUTE ON FUNCTION get_subject_stats() TO anon, authenticated;

-- Covering index keeps the aggregate cheap (matches the WHERE + GROUP BY).
CREATE INDEX IF NOT EXISTS questions_pool_stats_idx
  ON questions (status, visibility, subject, difficulty);
