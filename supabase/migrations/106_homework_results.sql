-- ============================================================
-- 106_homework_results.sql
--
-- TCH-018 (docs/decisions/0213): an assignment's results by exercise. One
-- read-only SECURITY DEFINER function, no table, column or grant change.
--
--   homework_results(p_assignment)
--     one row per (current recipient, exercise) of the lessons the
--     assignment covers: a lesson assignment's lesson, or a course
--     assignment's published, non-archived lessons. An exercise is a
--     `practice` block of the lesson's PUBLISHED version, in document order
--     (075 scopes "complete" the same way). The student's cell is their best
--     attempt on that exercise ON THAT VERSION: highest earned/possible, the
--     latest on a tie; earned/possible/response are NULL when there is none.
--     The block rides along so Studio can render the answer with
--     lib/learners/answerText (TCH-003, 0150).
--
-- Gate: returns rows only when the caller is the assignment's teacher, and
-- only for _homework_recipients() (080: ACTIVE link, not deleted), the same
-- rule linked_student_attempts (078, widened by 080) applies. Any other
-- caller, an ended link, or another teacher's assignment returns nothing,
-- not an error. Nothing is shown for a student who is not linked.
--
-- Written, not applied. Local: docker exec -i supabase_db_colloquiz psql
-- -U postgres -d postgres -v ON_ERROR_STOP=1 < this file. Hosted only
-- through the hosted-apply gate (CLAUDE.md).
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION homework_results(p_assignment UUID)
RETURNS TABLE (
  student_id     UUID,
  lesson_id      UUID,
  lesson_title   TEXT,
  lesson_ordinal INTEGER,
  block_id       TEXT,
  block_pos      INTEGER,
  block          JSONB,
  earned         NUMERIC,
  possible       NUMERIC,
  response       JSONB,
  attempted_at   TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH asg AS (
    SELECT a.id, a.course_id, a.lesson_id
    FROM homework_assignments a
    WHERE a.id = p_assignment
      AND a.teacher_id = (SELECT auth.uid())
      AND (SELECT auth.uid()) IS NOT NULL
  ),
  recips AS (
    SELECT r.student_id
    FROM asg, _homework_recipients((SELECT auth.uid()), NULL) r
    WHERE r.assignment_id = asg.id
  ),
  ex AS (
    SELECT l.id AS lesson_id, l.title AS lesson_title, l.ordinal AS lesson_ordinal,
           l.published_version_id AS version_id,
           b.value->>'id' AS block_id, b.ordinality::INTEGER AS block_pos, b.value AS block
    FROM asg
    JOIN lessons l ON l.course_id = asg.course_id
                  AND l.published_version_id IS NOT NULL
                  AND l.archived_at IS NULL
                  AND (asg.lesson_id IS NULL OR l.id = asg.lesson_id)
    JOIN lesson_versions v ON v.id = l.published_version_id
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(v.document) = 'array' THEN v.document ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS b(value, ordinality)
    WHERE b.value->>'kind' = 'practice'
  )
  SELECT rc.student_id, ex.lesson_id, ex.lesson_title, ex.lesson_ordinal,
         ex.block_id, ex.block_pos, ex.block,
         best.earned, best.possible, best.response, best.created_at
  FROM recips rc
  CROSS JOIN ex
  LEFT JOIN LATERAL (
    SELECT at.earned, at.possible, at.response, at.created_at
    FROM lesson_attempts at
    WHERE at.user_id = rc.student_id
      AND at.lesson_version_id = ex.version_id
      AND at.block_id = ex.block_id
    ORDER BY (CASE WHEN at.possible > 0 THEN at.earned / at.possible ELSE 0 END) DESC,
             at.created_at DESC
    LIMIT 1
  ) best ON TRUE
  ORDER BY ex.lesson_ordinal, ex.lesson_id, ex.block_pos, rc.student_id;
$$;

REVOKE ALL ON FUNCTION homework_results(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION homework_results(UUID) TO authenticated;

COMMIT;
