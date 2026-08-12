-- ============================================================
-- 034_progress_stats.sql
--
-- Progress > Stats (and the Achievements tab's totals) in ONE aggregate RPC,
-- so the page no longer transfers every result row to the app.
--
-- Before this, StatsTab loaded the user's ENTIRE results history
-- (getEnrichedResults) and computed the stat cards, the weekly chart, the
-- per-subject aggregate and the recent-10 list in JS. That payload grows without
-- bound as a user plays more quizzes — it just happened to be hidden from the
-- benchmark because <Suspense> streams the shell before it resolves. The
-- Achievements tab did the same with its own full `results` scan.
--
-- This computes the all-time aggregates in SQL and returns only bounded data:
--   totals      — one row of COUNT / AVG / SUM.
--   by_subject  — grouped, so ≤ catalogue size, never ≤ #quizzes.
--   recent      — the latest 10 rows only.
--   last_week   — rows in the last 8 days only (the weekly chart buckets by
--                 weekday in the viewer's OWN timezone client-side, so the
--                 bucketing stays in JS; 8 days over-covers the client's exact
--                 7-day window regardless of tz offset).
--
-- Subject derivation mirrors get_quiz_history (021): a result's subject is
-- questions.subject for quizzes.question_ids[1] (a TEXT[], not an FK). NULL —
-- quiz deleted, or its first question unreadable by this user — the app renders
-- as "Mixed", the same fallback getEnrichedResults used. Subject IDs are
-- returned; the app maps them to display names (data/subjects.json).
--
-- SECURITY INVOKER (the default), so the caller's RLS still scopes every table:
--   results owner-read, quizzes authenticated-read, questions visibility. The
--   explicit user_id = auth.uid() is belt-and-braces and lets the planner use
--   results_user_taken_idx (015).
--
-- Safe to re-apply: CREATE OR REPLACE.
--
-- Run via Supabase SQL Editor, or: npx supabase db push
-- ============================================================

CREATE OR REPLACE FUNCTION get_progress_stats()
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH mine AS (
    SELECT
      r.id,
      r.mode,
      r.score,
      r.correct,
      r.total_questions,
      r.taken_at,
      COALESCE(r.time_taken, 0)             AS time_taken,
      q0.subject                            AS subject,
      COALESCE(qz.difficulty_mix, 'mixed')  AS difficulty
    FROM results r
    LEFT JOIN quizzes   qz ON qz.id = r.quiz_id
    LEFT JOIN questions q0 ON q0.id = qz.question_ids[1]
    WHERE r.user_id = auth.uid()
  )
  SELECT jsonb_build_object(
    'totals', (
      SELECT jsonb_build_object(
        'quizzes',    COUNT(*),
        'avg_score',  COALESCE(AVG(score), 0),
        'total_time', COALESCE(SUM(time_taken), 0)
      )
      FROM mine
    ),
    'by_subject', (
      SELECT COALESCE(
               jsonb_agg(jsonb_build_object(
                 'subject',   g.subject,
                 'quizzes',   g.quizzes,
                 'avg_score', g.avg_score
               )),
               '[]'::jsonb
             )
      FROM (
        SELECT subject, COUNT(*) AS quizzes, AVG(score) AS avg_score
        FROM mine
        GROUP BY subject
      ) g
    ),
    'recent', (
      SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.taken_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, mode, score, correct, total_questions,
               taken_at, time_taken, subject, difficulty
        FROM mine
        ORDER BY taken_at DESC
        LIMIT 10
      ) t
    ),
    'last_week', (
      SELECT COALESCE(
               jsonb_agg(jsonb_build_object('taken_at', taken_at, 'score', score)),
               '[]'::jsonb
             )
      FROM mine
      WHERE taken_at >= now() - INTERVAL '8 days'
    )
  );
$$;

GRANT EXECUTE ON FUNCTION get_progress_stats() TO authenticated;
