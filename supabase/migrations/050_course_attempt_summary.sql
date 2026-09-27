-- ============================================================
-- 050_course_attempt_summary.sql
--
-- ANON-005: the read side of "the course page shows their best score from
-- the server" (SHELL-008/0059's own "what would make us revisit it" —
-- ANON-002/003 have now landed, so the course page's `{}` placeholder
-- attempts map needs to become a real one).
--
-- A plain PostgREST embed (`lesson_attempts.select("*, lesson_versions(lesson_id)")`)
-- cannot do this: "lesson_versions: published content read" (migration 041
-- §8) only lets a non-editor read the row that IS the lesson's CURRENT
-- published_version_id. Once a lesson is republished, a learner's own past
-- attempts against the superseded version become attempts against a
-- lesson_versions row RLS no longer lets them read — the embed silently
-- drops those rows, undercounting a real best score. A SECURITY DEFINER
-- function (same shape as can_read_lesson) is the only way to join through
-- lesson_versions regardless of which version is currently published.
--
-- Adds:
--   • get_course_attempt_summary(p_course_id UUID)
--     RETURNS TABLE(lesson_slug TEXT, best_percent INT)
--     For the CALLING user only (auth.uid(), never a parameter — same
--     "caller's own JWT is the only selector" shape as the account
--     export/delete routes). Per lesson in p_course_id:
--       1. Best attempt per (lesson_version_id, block_id) — a learner may
--          retake a block (docs/handoff.md: "Display the best score,
--          always"), so a later worse attempt must not pull the average
--          down. DISTINCT ON ... ORDER BY (earned/possible) DESC, not just
--          MAX(earned): possible is expected constant for a given
--          version+block (same authored item), but ordering by ratio is the
--          general "best" definition already used by
--          lib/lessonPlayer/attemptStore.ts's percentOf, so this stays
--          correct even if that ever stops holding.
--       2. Summed per lesson_version_id -> that version's percent.
--       3. MAX across every version_id the learner has attempted for that
--          lesson_id -> the lesson's best_percent (0048 Decision 6: "the
--          score displayed for a lesson is max(earned/possible) across
--          every version the learner has attempted").
--     LANGUAGE sql (not plpgsql), matching can_read_lesson's house style —
--     dependency-tracked, STABLE. Granted to authenticated only: anonymous
--     visitors have no lesson_attempts rows (no writer ever fires for them
--     yet — ANON-004/006, not this card), so there is nothing for them to
--     read and no reason to grant EXECUTE.
--
-- Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION get_course_attempt_summary(p_course_id UUID)
RETURNS TABLE(lesson_slug TEXT, best_percent INT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH best_per_block AS (
    SELECT DISTINCT ON (la.lesson_version_id, la.block_id)
      la.lesson_version_id,
      la.block_id,
      la.earned,
      la.possible
    FROM lesson_attempts la
    WHERE la.user_id = (SELECT auth.uid())
    ORDER BY la.lesson_version_id, la.block_id, (la.earned / la.possible) DESC
  ),
  per_version AS (
    SELECT
      lv.lesson_id,
      bpb.lesson_version_id,
      SUM(bpb.earned)   AS earned_sum,
      SUM(bpb.possible) AS possible_sum
    FROM best_per_block bpb
    JOIN lesson_versions lv ON lv.id = bpb.lesson_version_id
    GROUP BY lv.lesson_id, bpb.lesson_version_id
  ),
  per_lesson AS (
    SELECT
      lesson_id,
      MAX(ROUND(100.0 * earned_sum / possible_sum)) AS best_percent
    FROM per_version
    GROUP BY lesson_id
  )
  SELECT l.slug, pl.best_percent::INT
  FROM per_lesson pl
  JOIN lessons l ON l.id = pl.lesson_id
  WHERE l.course_id = p_course_id;
$$;

REVOKE ALL ON FUNCTION get_course_attempt_summary(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_course_attempt_summary(UUID) TO authenticated;

COMMIT;
