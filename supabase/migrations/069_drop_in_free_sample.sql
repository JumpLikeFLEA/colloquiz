-- ============================================================
-- 069_drop_in_free_sample.sql
--
-- CNT-015 (docs/decisions/0103 Decision 5). Drops lessons.in_free_sample,
-- the deprecated mirror of access_level = 'anyone' (055).
--
-- Print rule (scripts/board/backlog.mjs, M3 section header):
--   latest migration before this one -> 068_delete_course.sql
--   latest bodies re-emitted here    -> 058_cohort_schema.sql (§9a, §9b);
--     no migration 059-068 defines create_lesson or set_lesson_access_level
--     (rg -n "set_lesson_access_level|create_lesson" supabase/migrations).
--
-- Order matters: both functions are re-emitted WITHOUT the column before the
-- CHECK and the column go, so no function body names a missing column.
-- Changes to the re-emitted bodies: the in_free_sample assignments and the
-- create_lesson result's 'in_free_sample' key are removed. Nothing else.
-- ============================================================

-- Three changes: the open-lesson rule applies to self_paced courses only
-- (0094 Decision 2); raising a published lesson to `entitled` while a run
-- is in progress is refused (0094 Decision 4); and raising a published
-- lesson of a cohort course to `entitled` needs a week first (header §1).
CREATE OR REPLACE FUNCTION set_lesson_access_level(p_lesson_id UUID, p_level TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        UUID := (SELECT auth.uid());
  v_course    UUID;
  v_status    TEXT;
  v_format    TEXT;
  v_old_level TEXT;
  v_week      SMALLINT;
  v_published BOOLEAN;
BEGIN
  SELECT course_id, access_level, week, published_version_id IS NOT NULL
  INTO v_course, v_old_level, v_week, v_published
  FROM lessons WHERE id = p_lesson_id;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_level IS NULL OR p_level NOT IN ('anyone', 'signed_in', 'entitled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_access_level');
  END IF;

  SELECT status, format INTO v_status, v_format FROM courses WHERE id = v_course FOR UPDATE;

  IF v_format = 'self_paced'
     AND v_status = 'published'
     AND p_level <> 'anyone'
     AND NOT EXISTS (
       SELECT 1 FROM lessons
       WHERE course_id = v_course
         AND id <> p_lesson_id
         AND access_level = 'anyone'
         AND archived_at IS NULL
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_open_lesson');
  END IF;

  IF p_level = 'entitled' AND v_old_level <> 'entitled' AND v_published THEN
    IF _course_run_in_progress(v_course) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'access_level_frozen');
    END IF;
    IF v_format = 'cohort' AND v_week IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'week_required');
    END IF;
  END IF;

  UPDATE lessons
  SET access_level = p_level
  WHERE id = p_lesson_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION set_lesson_access_level(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION set_lesson_access_level(UUID, TEXT) TO authenticated;


-- ── create_lesson (re-emitted from 058 §9b) ─────────────────────────
-- One change: `anyone` for the first lesson of a self_paced course only;
-- every lesson of a cohort course starts `entitled` (0094 Decision 2).

CREATE OR REPLACE FUNCTION create_lesson(
  p_course_id   UUID,
  p_title       TEXT,
  p_slug        TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        UUID := (SELECT auth.uid());
  v_ordinal   INT;
  v_is_first  BOOLEAN;
  v_format    TEXT;
  v_level     TEXT;
  v_id        UUID;
  v_base_slug TEXT;
  v_slug      TEXT;
  v_suffix    INT := 1;
BEGIN
  SELECT format INTO v_format FROM courses WHERE id = p_course_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;
  IF NOT can_edit_course(p_course_id, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_title');
  END IF;

  -- Format only — never trust a caller-supplied string, even though the app's
  -- only caller (the lessons API route) always runs this through
  -- lib/lessonSlug.ts's slugifyLessonTitle first, which already produces
  -- something matching this. Same pattern lessons_slug_check (043) enforces
  -- at the column level.
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_slug');
  END IF;

  v_base_slug := p_slug;
  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM lessons WHERE course_id = p_course_id AND slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  END LOOP;

  SELECT COUNT(*) = 0, COALESCE(MAX(ordinal), 0) + 1
  INTO v_is_first, v_ordinal
  FROM lessons WHERE course_id = p_course_id;

  v_level := CASE WHEN v_is_first AND v_format = 'self_paced' THEN 'anyone' ELSE 'entitled' END;

  INSERT INTO lessons (course_id, ordinal, title, description, access_level, slug)
  VALUES (p_course_id, v_ordinal, p_title, p_description, v_level, v_slug)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true, 'lesson_id', v_id, 'access_level', v_level, 'slug', v_slug
  );
END;
$$;

REVOKE ALL ON FUNCTION create_lesson(UUID, TEXT, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION create_lesson(UUID, TEXT, TEXT, TEXT) TO authenticated;


-- ── Drop the mirror ─────────────────────────────────────────────────────
ALTER TABLE lessons DROP CONSTRAINT lessons_in_free_sample_mirrors_access_level;
ALTER TABLE lessons DROP COLUMN in_free_sample;
