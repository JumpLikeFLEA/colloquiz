-- ============================================================
-- 009_quiz_sessions.sql
-- Adds the "active quiz session" concept: an in-progress quiz that
-- survives navigation and browser close, resumes at the exact spot,
-- and is limited to one active session per user.
--
-- Run this once against your Supabase project via:
--   npx supabase db push
-- or paste into the Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS quiz_sessions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quiz_id          TEXT        NOT NULL REFERENCES quizzes(id)  ON DELETE CASCADE,
  status           TEXT        NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'completed', 'abandoned')),
  -- Resume progress. `answers` is a (number | null)[] keyed by question
  -- position — the selected option index per question, null = unanswered.
  -- Resume-safe: question order (quiz.question_ids) is fixed and option
  -- order is deterministic per the `${quizId}:${questionId}` shuffle seed.
  current_index    INTEGER     NOT NULL DEFAULT 0,
  answers          JSONB       NOT NULL DEFAULT '[]',
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce exactly ONE active session per user (partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS quiz_sessions_one_active
  ON quiz_sessions (user_id) WHERE status = 'active';

ALTER TABLE quiz_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quiz_sessions: owner read/write"
  ON quiz_sessions
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
