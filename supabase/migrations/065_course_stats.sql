-- ============================================================
-- 065_course_stats.sql
--
-- AUTH-014. The read path for the Studio course stats page
-- (/studio/courses/[id]/stats): which lesson loses learners and which
-- exercise is broken or too hard, without identifying anyone
-- (docs/decisions/0109 Decision 9). Owner-approved as a schema change on
-- 2026-10-11 (#179); choices made while writing it are in
-- docs/decisions/0121.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 064_learner_detail.sql
--   latest body of the account-delete RPC   -> 061_run_final_comments.sql
-- Re-emitted bodies: none. delete_my_account is NOT touched (this migration
-- adds no table and stores nothing), and no access function is touched.
--
-- Why a function: an editor cannot read lesson_opens (056) or
-- lesson_attempts (048); each is owner-read only. The function is SECURITY
-- DEFINER, read-only (STABLE), and returns no rows unless
-- can_edit_course(p_course_id, auth.uid()). EXECUTE to authenticated only.
--
-- ── course_stats(course) ────────────────────────────────────────────────
-- One row per practice block of each published, non-archived lesson of the
-- course, in the published version's order; a lesson with no practice
-- block gets one row with the block columns NULL. Learners are accounts
-- with profiles.deleted_at IS NULL.
--   opened_learners     distinct learners who opened the lesson by 063's
--                       rule: a lesson_opens row, an attempt or a voice
--                       take (an attempt uploaded from before sign-in has
--                       no open row; 0121 Decision 3). No threshold (0109
--                       Decision 9: the author already sees per-learner
--                       opens).
--   attempted_learners  distinct learners with a lesson_attempts row on any
--                       version of the lesson. No threshold, same reason.
--   block_learners      distinct learners whose attempts count toward the
--                       block (below).
--   block_avg           mean over those learners of earned/possible of
--                       each learner's FIRST counted attempt on the block
--                       (0121 Decision 2), 0..1. NULL when block_learners
--                       < 5: the threshold lives here, not in the UI.
-- Which attempts count toward a block (0121 Decision 1): an attempt on
-- version V counts when V's block with the same id is byte-for-byte the
-- same JSON as the published version's block (jsonb =). Editing an
-- exercise starts its stats over; republishing a lesson for an edit
-- elsewhere keeps them.
-- Order: lesson ordinal, then block position.
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the owner, never by a session.
--
-- Safe to re-apply: CREATE OR REPLACE.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION course_stats(p_course_id UUID)
RETURNS TABLE (
  lesson_id           UUID,
  lesson_title        TEXT,
  lesson_ordinal      INTEGER,
  week                INTEGER,
  opened_learners     INTEGER,
  attempted_learners  INTEGER,
  block_id            TEXT,
  block_position      INTEGER,
  block_type          TEXT,
  block_prompt        JSONB,
  block_learners      INTEGER,
  block_avg           NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ok AS (
    SELECT c.id
    FROM courses c
    WHERE c.id = p_course_id
      AND can_edit_course(c.id, (SELECT auth.uid()))
  ),
  listed AS (
    SELECT l.id, l.title, l.ordinal, l.week, l.published_version_id
    FROM lessons l
    JOIN ok ON ok.id = l.course_id
    WHERE l.published_version_id IS NOT NULL AND l.archived_at IS NULL
  ),
  -- Practice blocks of the published version, with their position.
  blocks AS (
    SELECT ls.id AS lesson_id, b.value AS block, b.ordinality::INTEGER AS pos
    FROM listed ls
    JOIN lesson_versions v ON v.id = ls.published_version_id
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(v.document) = 'array' THEN v.document ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS b(value, ordinality)
    WHERE b.value->>'kind' = 'practice'
  ),
  -- Every attempt on any version of a listed lesson, by a live account.
  attempts AS (
    SELECT v.lesson_id, v.document, a.user_id, a.block_id, a.earned, a.possible,
           a.created_at, a.id
    FROM lesson_attempts a
    JOIN lesson_versions v ON v.id = a.lesson_version_id
    JOIN listed ls ON ls.id = v.lesson_id
    JOIN profiles p ON p.id = a.user_id AND p.deleted_at IS NULL
  ),
  attempted AS (
    SELECT lesson_id, count(DISTINCT user_id)::INTEGER AS n
    FROM attempts
    GROUP BY lesson_id
  ),
  opened AS (
    SELECT x.lesson_id, count(DISTINCT x.user_id)::INTEGER AS n
    FROM (
      SELECT o.lesson_id, o.user_id FROM lesson_opens o
      UNION SELECT a.lesson_id, a.user_id FROM attempts a
      UNION SELECT s.lesson_id, s.user_id FROM voice_submissions s
    ) x
    JOIN listed ls ON ls.id = x.lesson_id
    JOIN profiles p ON p.id = x.user_id AND p.deleted_at IS NULL
    GROUP BY x.lesson_id
  ),
  -- Each learner's first attempt on a block, counting only versions whose
  -- block is identical to the published one.
  first_attempts AS (
    SELECT DISTINCT ON (bl.lesson_id, bl.block->>'id', x.user_id)
      bl.lesson_id, bl.block->>'id' AS block_id, x.user_id,
      x.earned / x.possible AS ratio
    FROM blocks bl
    JOIN attempts x
      ON x.lesson_id = bl.lesson_id AND x.block_id = bl.block->>'id'
    WHERE EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(x.document) = 'array' THEN x.document ELSE '[]'::jsonb END
      ) ob
      WHERE ob->>'id' = bl.block->>'id' AND ob = bl.block
    )
    ORDER BY bl.lesson_id, bl.block->>'id', x.user_id, x.created_at, x.id
  ),
  per_block AS (
    SELECT lesson_id, block_id,
           count(*)::INTEGER AS n,
           avg(ratio) AS avg_ratio
    FROM first_attempts
    GROUP BY lesson_id, block_id
  )
  SELECT
    ls.id, ls.title, ls.ordinal, ls.week,
    COALESCE(op.n, 0), COALESCE(att.n, 0),
    bl.block->>'id',
    bl.pos,
    bl.block->>'type',
    bl.block->'payload'->'prompt',
    CASE WHEN bl.lesson_id IS NULL THEN NULL ELSE COALESCE(pb.n, 0) END,
    CASE WHEN pb.n >= 5 THEN pb.avg_ratio ELSE NULL END
  FROM listed ls
  LEFT JOIN opened op    ON op.lesson_id = ls.id
  LEFT JOIN attempted att ON att.lesson_id = ls.id
  LEFT JOIN blocks bl    ON bl.lesson_id = ls.id
  LEFT JOIN per_block pb ON pb.lesson_id = ls.id AND pb.block_id = bl.block->>'id'
  ORDER BY ls.ordinal, ls.id, bl.pos;
$$;

REVOKE ALL ON FUNCTION course_stats(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION course_stats(UUID) TO authenticated;

COMMIT;
