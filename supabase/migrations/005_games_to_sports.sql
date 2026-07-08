-- ============================================================
-- 005_games_to_sports.sql
--
-- Refactor: the "games" subject is removed and its content is
-- folded into a new broader "sports" subject. The only subject
-- that existed under "games" was Chess History; Sports now also
-- gains Tennis History (imported separately from
-- authored/tennis_hist.json).
--
-- This migrates the CURRENT set of questions already in the DB:
-- every row tagged subject='games' becomes subject='sports'. The
-- subtopic tag ('chess history') is unchanged — Chess History is
-- still a subtopic, just under a different parent subject — so
-- tags[], quizzes.tags, and results.tag_breakdown need no edits.
--
-- Idempotent: re-running is a no-op once no 'games' rows remain.
--
-- Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================

UPDATE questions
  SET subject = 'sports'
  WHERE subject = 'games';

-- Sanity check: after this runs there should be zero 'games' rows.
-- SELECT subject, COUNT(*) FROM questions GROUP BY subject ORDER BY subject;
