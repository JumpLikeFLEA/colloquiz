-- ============================================================
-- 078_linked_student_answers.sql
--
-- TCH-003 (docs/decisions/0141 Decision 6, 0150): a teacher reads a LINKED
-- student's answers and scores. This supersedes 0109 Decision 8 for linked
-- students only.
--
-- Adds two read-only SECURITY DEFINER functions. Both return rows only when
--   • _teacher_linked(caller, p_student) is true (076: an ACTIVE link; an
--     ended link stops the read), AND
--   • the course is one the caller edits (can_edit_course, 029),
-- and nothing otherwise (no error, no row), so a caller learns nothing about
-- a student they are not linked to.
--
--   linked_student_attempts(p_student)
--     every lesson_attempts row of the student on those courses, with the
--     block JSON as it stands in the version the attempt was made on
--     (lesson_versions.document, the 064 learner_recordings pattern), so the
--     answer is read against the right item even after the lesson was edited.
--   linked_student_lesson_scores(p_student)
--     the best lesson score, from lesson_completion() (075), the one
--     definition of "best" and "complete"; this adds no second one.
--
-- No table, column or grant changes. lesson_attempts stays owner-read only;
-- these functions are the only teacher path.
--
-- Written, not applied. Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION linked_student_attempts(p_student UUID)
RETURNS TABLE (
  attempt_id         UUID,
  course_id          UUID,
  lesson_id          UUID,
  lesson_version_id  UUID,
  block_id           TEXT,
  earned             NUMERIC,
  possible           NUMERIC,
  response           JSONB,
  created_at         TIMESTAMPTZ,
  block              JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id, l.course_id, l.id, a.lesson_version_id, a.block_id,
    a.earned, a.possible, a.response, a.created_at,
    ob.block
  FROM lesson_attempts a
  JOIN lesson_versions v ON v.id = a.lesson_version_id
  JOIN lessons l         ON l.id = v.lesson_id
  JOIN profiles p        ON p.id = a.user_id AND p.deleted_at IS NULL
  LEFT JOIN LATERAL (
    SELECT b AS block
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v.document) = 'array' THEN v.document ELSE '[]'::jsonb END
    ) b
    WHERE b->>'id' = a.block_id AND b->>'kind' = 'practice'
    LIMIT 1
  ) ob ON TRUE
  WHERE a.user_id = p_student
    AND _teacher_linked(auth.uid(), p_student)
    AND can_edit_course(l.course_id, auth.uid())
  ORDER BY l.course_id, l.ordinal, a.block_id, a.created_at;
$$;

REVOKE ALL ON FUNCTION linked_student_attempts(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION linked_student_attempts(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION linked_student_lesson_scores(p_student UUID)
RETURNS TABLE (
  course_id          UUID,
  lesson_id          UUID,
  best_percent       INTEGER,
  complete           BOOLEAN,
  exercises_answered INTEGER,
  exercises_total    INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.course_id, c.lesson_id, c.best_percent, c.complete,
         c.exercises_answered, c.exercises_total
  FROM lesson_completion(
         p_student,
         ARRAY(SELECT co.id FROM courses co WHERE can_edit_course(co.id, auth.uid()))
       ) c
  JOIN lessons l ON l.id = c.lesson_id
  WHERE _teacher_linked(auth.uid(), p_student)
    AND can_edit_course(l.course_id, auth.uid());
$$;

REVOKE ALL ON FUNCTION linked_student_lesson_scores(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION linked_student_lesson_scores(UUID) TO authenticated;

COMMIT;
