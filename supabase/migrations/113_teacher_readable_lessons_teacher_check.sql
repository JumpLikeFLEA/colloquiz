-- ============================================================
-- 113_teacher_readable_lessons_teacher_check.sql — TCH-019 (#339, docs/decisions/0249)
--
-- _teacher_readable_lessons (080) asked for an active link but not _is_teacher, so a
-- person who had lost every course and seat, with a link still active and an old
-- assignment, still read the student's answers through every reader built on it
-- (shown on the local stack before this file: supabase/verify/113 printed
-- "x->s 1/1/1/1/0"). Messages and ask-the-teacher (079, 081, 083) ask for both.
--
-- The check is added in ONE place, the helper, so every caller inherits it:
--   linked_student_attempts          080
--   linked_student_lesson_scores     080
--   linked_student_assigned_lessons  080
--   _writing_can_review              109 (linked route; cohort route unchanged)
--   linked_student_notebook          112 (already checked _is_teacher; now redundant)
-- _is_teacher (082) is true for an admin, any course_editors row or any author_seats
-- row, lapsed or not, so a lapsed seat still reads (0155).
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time:
--   latest migration before this one -> 112_notebook.sql
--   latest body of delete_my_account -> 112_notebook.sql (not re-emitted here)
-- Re-emitted bodies, each from its latest definition:
--   _teacher_readable_lessons  080 (one added AND)
--
-- Not destructive: one CREATE OR REPLACE, same signature, same grants. Safe to re-apply.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION _teacher_readable_lessons(p_teacher UUID, p_student UUID)
RETURNS TABLE (lesson_id UUID, course_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH hw AS MATERIALIZED (
    SELECT a.course_id, a.lesson_id
    FROM _homework_recipients(p_teacher, p_student) r
    JOIN homework_assignments a ON a.id = r.assignment_id
    WHERE a.teacher_id = p_teacher
  )
  SELECT l.id, l.course_id
  FROM lessons l
  WHERE _is_teacher(p_teacher)
    AND _teacher_linked(p_teacher, p_student)
    AND (
      can_edit_course(l.course_id, p_teacher)
      OR EXISTS (
        SELECT 1 FROM hw
        WHERE hw.course_id = l.course_id AND (hw.lesson_id IS NULL OR hw.lesson_id = l.id)
      )
    );
$$;

REVOKE ALL ON FUNCTION _teacher_readable_lessons(UUID, UUID) FROM PUBLIC, anon, authenticated;

COMMIT;
