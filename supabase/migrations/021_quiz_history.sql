-- ============================================================
-- 021_quiz_history.sql
--
-- Progress > History: the full quiz history, paginated and filterable by
-- subject and difficulty.
--
-- Why an RPC rather than a PostgREST select:
--   A result's subject is not stored on the row. It is derived from the FIRST
--   question of the quiz that was played — quizzes.question_ids[1] -> questions
--   .subject. question_ids is a TEXT[], not a foreign key, so PostgREST cannot
--   embed or filter through it. The app has been resolving that in JS after
--   fetching every result row, which is exactly what a paginated view cannot do:
--   you cannot take page 3 of a filter you can only evaluate after loading
--   everything. Doing the lookup in SQL makes subject a first-class filter and
--   keeps the payload to one page.
--
-- SECURITY INVOKER (the default) throughout, so the caller's RLS still applies:
--   - results:   "results: owner read/write" (auth.uid() = user_id)
--   - quizzes:   "quizzes: authenticated read"
--   - questions: the visibility policies
-- The explicit `user_id = auth.uid()` is belt-and-braces, and lets the planner
-- use results_user_taken_idx.
--
-- A quiz whose first question the caller cannot read (or that has been deleted)
-- yields a NULL subject, which the app renders as "Mixed" — the same fallback
-- the JS path already used.
--
-- Safe to re-apply: CREATE OR REPLACE + IF NOT EXISTS.
--
-- Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================

-- ── one page of history, plus the total the filter matches ───────────────────
--
-- total_count is repeated on every row rather than returned separately: it must
-- be computed from the same filtered set in the same snapshot, and one round
-- trip beats two that can disagree. Callers read it off row 0.
--
-- p_subject is a subject ID (e.g. 'sports_history'), not a display name — the
-- display names live in data/subjects.json, which the database knows nothing
-- about. p_difficulty matches quizzes.difficulty_mix, so 'mixed' is a real
-- value (that is what a quiz played at "Any" difficulty is stored as), not a
-- synonym for "no filter". NULL means "no filter" for both.
CREATE OR REPLACE FUNCTION get_quiz_history(
  p_subject    TEXT DEFAULT NULL,
  p_difficulty TEXT DEFAULT NULL,
  p_limit      INT  DEFAULT 25,
  p_offset     INT  DEFAULT 0
)
RETURNS TABLE (
  id              TEXT,
  mode            TEXT,
  score           NUMERIC,
  correct         INTEGER,
  total_questions INTEGER,
  taken_at        TIMESTAMPTZ,
  time_taken      INTEGER,
  subject         TEXT,
  difficulty      TEXT,
  total_count     BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT
      r.id,
      r.mode,
      r.score,
      r.correct,
      r.total_questions,
      r.taken_at,
      r.time_taken,
      q0.subject                            AS subject,
      COALESCE(qz.difficulty_mix, 'mixed')  AS difficulty
    FROM results r
    LEFT JOIN quizzes   qz ON qz.id = r.quiz_id
    LEFT JOIN questions q0 ON q0.id = qz.question_ids[1]
    WHERE r.user_id = auth.uid()
      AND (p_subject    IS NULL OR q0.subject = p_subject)
      AND (p_difficulty IS NULL OR COALESCE(qz.difficulty_mix, 'mixed') = p_difficulty)
  )
  SELECT
    f.*,
    (SELECT COUNT(*) FROM filtered) AS total_count
  FROM filtered f
  ORDER BY f.taken_at DESC
  LIMIT  GREATEST(p_limit, 0)
  OFFSET GREATEST(p_offset, 0);
$$;

GRANT EXECUTE ON FUNCTION get_quiz_history(TEXT, TEXT, INT, INT) TO authenticated;

-- ── the subjects this user actually has history in ───────────────────────────
--
-- Feeds the History filter's subject dropdown. Offering the whole catalogue
-- would list ~20 subjects, most of which the user has never played, so every
-- other choice would be a dead end that renders "no results".
CREATE OR REPLACE FUNCTION get_quiz_history_subjects()
RETURNS TABLE (subject TEXT, cnt BIGINT)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT q0.subject, COUNT(*)
  FROM results r
  JOIN quizzes   qz ON qz.id = r.quiz_id
  JOIN questions q0 ON q0.id = qz.question_ids[1]
  WHERE r.user_id = auth.uid()
    AND q0.subject IS NOT NULL
  GROUP BY q0.subject
  ORDER BY q0.subject;
$$;

GRANT EXECUTE ON FUNCTION get_quiz_history_subjects() TO authenticated;

-- results(user_id, taken_at DESC) already exists as results_user_taken_idx
-- (015_ranking_xp.sql) and is what both functions scan. The quizzes/questions
-- sides are primary-key lookups.
