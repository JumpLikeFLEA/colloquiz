-- ============================================================
-- 110_carried_lesson_answers.sql
--
-- PLAY-021 (#284, docs/decisions/0228): the exercises a learner answered on an
-- EARLIER version of a lesson that the played version carries unchanged, so a
-- republish does not send a half-done lesson back to 0 in the player.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time:
--   latest migration before this one        -> 109_writing_submissions.sql
--   latest body of the account-delete RPC   -> 109_writing_submissions.sql
-- Re-emitted bodies: none. delete_my_account is NOT touched: this migration
-- adds no table and stores nothing.
--
-- Why SECURITY DEFINER: a learner cannot read a superseded version's document
-- (lesson_versions "published content read", 041), and "unchanged" needs the
-- old block to compare. The function compares in SQL and returns only the
-- caller's own (block_id, earned, possible): never a document, a block or
-- another user's row.
--
-- The rule:
--   * p_lesson_version_id must be its lesson's published_version_id; any
--     other id returns nothing (no probing of drafts or old versions).
--   * The caller is auth.uid(); NULL returns nothing. EXECUTE is granted to
--     authenticated only.
--   * A row is returned for a block id when the played version's document
--     holds it as a practice block, an earlier version of the same lesson
--     held a block with that id that is identical as JSONB (key order
--     ignored) apart from `convertedFrom` (an authoring note the learner never
--     sees), and the caller has an attempt on that earlier version's block.
--     Any other edit, an explanation typo included, counts as changed.
--   * One row per block: the best attempt across the matching earlier
--     versions (the 050 order, earned / possible, then the earliest).
--   * Attempts on the played version itself are not returned; the page reads
--     them through the owner-read policy (048) as before (0210).
--
-- Not applied by this file's author until "The hosted-apply gate" passes.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION carried_lesson_answers(p_lesson_version_id UUID)
RETURNS TABLE (block_id TEXT, earned NUMERIC, possible NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT auth.uid() AS uid WHERE auth.uid() IS NOT NULL
  ),
  played AS (
    SELECT v.id, v.lesson_id, v.document
    FROM lesson_versions v
    JOIN lessons l ON l.id = v.lesson_id AND l.published_version_id = v.id
    WHERE v.id = p_lesson_version_id
  ),
  played_blocks AS (
    SELECT b->>'id' AS block_id, b - 'convertedFrom' AS block
    FROM played p
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(p.document) = 'array' THEN p.document ELSE '[]'::jsonb END
    ) b
    WHERE b->>'kind' = 'practice' AND b->>'id' IS NOT NULL
  ),
  earlier_blocks AS (
    SELECT o.id AS version_id, b->>'id' AS block_id, b - 'convertedFrom' AS block
    FROM played p
    JOIN lesson_versions o ON o.lesson_id = p.lesson_id AND o.id <> p.id
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(o.document) = 'array' THEN o.document ELSE '[]'::jsonb END
    ) b
    WHERE b->>'kind' = 'practice' AND b->>'id' IS NOT NULL
  ),
  unchanged AS (
    SELECT DISTINCT e.version_id, e.block_id
    FROM earlier_blocks e
    JOIN played_blocks pb ON pb.block_id = e.block_id AND pb.block = e.block
  )
  SELECT a.block_id,
         (array_agg(a.earned   ORDER BY a.earned / a.possible DESC, a.created_at))[1],
         (array_agg(a.possible ORDER BY a.earned / a.possible DESC, a.created_at))[1]
  FROM me
  JOIN lesson_attempts a ON a.user_id = me.uid
  JOIN unchanged u ON u.version_id = a.lesson_version_id AND u.block_id = a.block_id
  GROUP BY a.block_id;
$$;

REVOKE ALL ON FUNCTION carried_lesson_answers(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION carried_lesson_answers(UUID) TO authenticated;

COMMIT;
