-- ============================================================
-- 012_result_quiz_cascade.sql
--
-- Lets an author delete a quiz they created, even after it has been taken.
--
-- results.quiz_id was created with a plain FK (no ON DELETE action), so any
-- quiz with a recorded attempt could never be deleted — the API had to reject
-- the delete with a 409. Authors could not remove test quizzes they had run
-- themselves.
--
-- Deleting a quiz now cascades to every attempt of it: those results disappear
-- from the taker's history and stop counting toward their stats. That is the
-- intended behaviour — the quiz no longer exists, so neither do its scores.
-- Achievements already unlocked are NOT revoked.
--
-- assignments.quiz_id and quiz_sessions.quiz_id already cascade.
-- assignments.result_id is ON DELETE SET NULL, but assignment rows go with the
-- quiz anyway.
--
-- Safe to re-apply.
--
-- Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================

ALTER TABLE results
  DROP CONSTRAINT IF EXISTS results_quiz_id_fkey;

ALTER TABLE results
  ADD CONSTRAINT results_quiz_id_fkey
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE;
