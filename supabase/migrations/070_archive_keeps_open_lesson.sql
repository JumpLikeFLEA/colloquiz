-- ============================================================
-- 070_archive_keeps_open_lesson.sql
--
-- CNT-016 (docs/decisions/0099 Decision 3). set_lesson_archived refuses to
-- archive the last non-archived `anyone` lesson of a published self-paced
-- course (no_open_lesson), the rule 055 put in publish_course and
-- set_lesson_access_level and 058 limited to self_paced.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header):
--   latest migration before this one -> 069_drop_in_free_sample.sql
--   latest body re-emitted here      -> 044_lesson_authoring_rpcs.sql
--     (set_lesson_archived; rg -n "FUNCTION set_lesson_archived"
--     supabase/migrations finds no later definition).
-- Changes to the body: the course row is read FOR UPDATE (the
-- set_lesson_access_level precedent, so two concurrent archives of the
-- last two open lessons serialise), and the guard below. Restoring
-- (p_archived = false) is never refused.
-- ============================================================

CREATE OR REPLACE FUNCTION set_lesson_archived(p_lesson_id UUID, p_archived BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       UUID := (SELECT auth.uid());
  v_course   UUID;
  v_level    TEXT;
  v_archived BOOLEAN;
  v_status   TEXT;
  v_format   TEXT;
BEGIN
  SELECT course_id, access_level, archived_at IS NOT NULL
  INTO v_course, v_level, v_archived
  FROM lessons WHERE id = p_lesson_id;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT status, format INTO v_status, v_format FROM courses WHERE id = v_course FOR UPDATE;

  IF p_archived
     AND NOT v_archived
     AND v_level = 'anyone'
     AND v_format = 'self_paced'
     AND v_status = 'published'
     AND NOT EXISTS (
       SELECT 1 FROM lessons
       WHERE course_id = v_course
         AND id <> p_lesson_id
         AND access_level = 'anyone'
         AND archived_at IS NULL
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_open_lesson');
  END IF;

  UPDATE lessons
  SET archived_at = CASE WHEN p_archived THEN NOW() ELSE NULL END
  WHERE id = p_lesson_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION set_lesson_archived(UUID, BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION set_lesson_archived(UUID, BOOLEAN) TO authenticated;
