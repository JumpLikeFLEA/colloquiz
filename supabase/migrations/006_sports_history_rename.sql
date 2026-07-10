-- ============================================================
-- 006_sports_history_rename.sql
--
-- Refactor: the "Sports" subject becomes "Sports History", and its
-- subtopics drop the redundant "History" qualifier (which now lives in
-- the subject name). Going forward every subtopic under this subject is
-- a bare noun:  subject "Sports History" → subtopics "Chess", "Tennis".
--
--   subject id : 'sports' → 'sports_history'
--                (also matches legacy 'games' in case 005 was never run,
--                 so the end state is correct either way)
--   tag slugs  : 'chess history'  → 'chess'
--                'tennis history' → 'tennis'
--
-- Touches every table that stores a subject or a tag:
--   questions.subject, questions.tags
--   quizzes.tags               (quizzes reference subjects only via tags)
--   custom_quizzes.subject
--   results.tag_breakdown      (JSONB keyed by tag; currently always {},
--                               renamed defensively in case that changes)
--
-- Idempotent: array_replace and the JSONB key-rename are no-ops once the
-- new names are in place, and the subject predicate matches nothing after
-- the first run.
--
-- Run via Supabase SQL Editor, or:  npx supabase db push
-- ============================================================


-- ── questions: subject rename ───────────────────────────────
UPDATE questions
  SET subject = 'sports_history'
  WHERE subject IN ('games', 'sports');

-- ── questions: tag renames ──────────────────────────────────
UPDATE questions
  SET tags = array_replace(tags, 'chess history', 'chess')
  WHERE 'chess history' = ANY(tags);

UPDATE questions
  SET tags = array_replace(tags, 'tennis history', 'tennis')
  WHERE 'tennis history' = ANY(tags);


-- ── quizzes: tag renames ────────────────────────────────────
UPDATE quizzes
  SET tags = array_replace(tags, 'chess history', 'chess')
  WHERE 'chess history' = ANY(tags);

UPDATE quizzes
  SET tags = array_replace(tags, 'tennis history', 'tennis')
  WHERE 'tennis history' = ANY(tags);


-- ── custom_quizzes: subject rename ──────────────────────────
UPDATE custom_quizzes
  SET subject = 'sports_history'
  WHERE subject IN ('games', 'sports');


-- ── results: rename JSONB keys in tag_breakdown (defensive) ──
UPDATE results
  SET tag_breakdown = (tag_breakdown - 'chess history')
                      || jsonb_build_object('chess', tag_breakdown -> 'chess history')
  WHERE tag_breakdown ? 'chess history';

UPDATE results
  SET tag_breakdown = (tag_breakdown - 'tennis history')
                      || jsonb_build_object('tennis', tag_breakdown -> 'tennis history')
  WHERE tag_breakdown ? 'tennis history';


-- Sanity checks (expect the second to return 0):
--   SELECT subject, tags FROM questions WHERE subject = 'sports_history';
--   SELECT COUNT(*) FROM questions WHERE subject IN ('games', 'sports');
