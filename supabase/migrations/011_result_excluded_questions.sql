-- ============================================================
-- 011_result_excluded_questions.sql
--
-- Records which questions were excluded from a result's scoring.
--
-- A user who reports a question WITHOUT answering it may now skip it, and the
-- skipped question is left out of the score entirely: it is not counted in
-- total_questions and is NOT listed in wrong_question_ids.
--
-- That last part is why this column is needed. The results review page treats
-- "not in wrong_question_ids" as CORRECT, so without an explicit record of the
-- exclusions a skipped question would render as a green tick. This column lets
-- the UI show a neutral "Reported — not scored" third state instead.
--
-- Note: total_questions now means "questions scored", not "questions in the
-- quiz". Migration 008's subject-stats RPC aggregates correct/total_questions,
-- so dashboard accuracy automatically ignores skipped questions.
--
-- Safe to re-apply. Existing rows default to '{}' — no backfill needed.
--
-- Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================

ALTER TABLE results
  ADD COLUMN IF NOT EXISTS excluded_question_ids TEXT[] NOT NULL DEFAULT '{}';
