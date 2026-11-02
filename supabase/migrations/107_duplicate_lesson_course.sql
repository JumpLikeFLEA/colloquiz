-- ============================================================
-- 107_duplicate_lesson_course.sql
--
-- AUTH-022. Studio can copy a lesson (into the same course) or a whole
-- course (into a new unpublished, unlisted draft the caller edits).
--
--   duplicate_lesson(p_lesson_id, p_url_map)
--   duplicate_course(p_course_id, p_new_course_id, p_url_map)
--
-- SECURITY DEFINER, can_edit_course on the source, _studio_can_write (083,
-- docs/decisions/0155: a new Studio write calls it). duplicate_course also
-- needs what create_course (082) needs: an admin or an active author seat,
-- because it creates a course.
--
-- ── What is copied ──────────────────────────────────────────────────────
-- Course: title ("<title> (copy)"), subtitle, description, level, format,
-- how_to_join_url, cover. Not copied: status (always 'draft'), listed (always
-- false), author_id (the caller), slug (a free "<slug>-copy[-n]").
-- Lessons (not archived): title, description, estimated_minutes, access_level,
-- week, ordinal, and the LATEST document as one new 'editor' version. The
-- lesson is unpublished (published_version_id NULL, count 0). A lesson with
-- no version gets none.
-- Never copied: attempts, opens, runs, invites, enrolments, grants, homework,
-- voice submissions, editors other than the caller. Those tables are not read.
--
-- ── Images ───────────────────────────────────────────────────────────────
-- SQL cannot copy Storage files, and the course delete route purges the whole
-- "<course_id>/" prefix of lesson-images, so a copy pointing at the
-- original's objects would lose them with the original. The route copies the
-- objects first (service role) and passes p_url_map, {old URL: new URL}; this
-- function replaces each old URL, as a whole JSON string, in the copied
-- documents and the cover. A URL not in the map is kept as is.
-- p_new_course_id is chosen by the route so the objects can sit under the
-- new course's prefix before the row exists; it must be unused.
--
-- Safe to re-apply: CREATE OR REPLACE, then REVOKE/GRANT.
-- ============================================================

BEGIN;

-- Replace each map key by its value wherever it is a whole JSON string.
CREATE OR REPLACE FUNCTION _apply_url_map(p_doc JSONB, p_map JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_text TEXT;
  r      RECORD;
BEGIN
  IF p_doc IS NULL OR p_map IS NULL OR p_map = '{}'::jsonb THEN
    RETURN p_doc;
  END IF;
  v_text := p_doc::text;
  FOR r IN SELECT key, value FROM jsonb_each_text(p_map) LOOP
    v_text := replace(v_text, to_jsonb(r.key)::text, to_jsonb(r.value)::text);
  END LOOP;
  RETURN v_text::jsonb;
END;
$$;
REVOKE ALL ON FUNCTION _apply_url_map(JSONB, JSONB) FROM public, anon, authenticated;

-- A free "<base>[-n]" slug among a course's lessons.
CREATE OR REPLACE FUNCTION _free_lesson_slug(p_course UUID, p_base TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_slug TEXT := p_base;
  v_n    INT := 1;
BEGIN
  WHILE EXISTS (SELECT 1 FROM lessons WHERE course_id = p_course AND slug = v_slug) LOOP
    v_n := v_n + 1;
    v_slug := p_base || '-' || v_n;
  END LOOP;
  RETURN v_slug;
END;
$$;
REVOKE ALL ON FUNCTION _free_lesson_slug(UUID, TEXT) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION duplicate_lesson(p_lesson_id UUID, p_url_map JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_src    lessons%ROWTYPE;
  v_doc    JSONB;
  v_id     UUID;
  v_slug   TEXT;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  SELECT * INTO v_src FROM lessons WHERE id = p_lesson_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_not_found');
  END IF;
  IF NOT can_edit_course(v_src.course_id, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  -- Serialise with create_lesson on the same course (ordinal, slug).
  PERFORM 1 FROM courses WHERE id = v_src.course_id FOR UPDATE;
  IF v_src.archived_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_archived');
  END IF;

  SELECT document INTO v_doc FROM lesson_versions
   WHERE lesson_id = p_lesson_id ORDER BY created_at DESC, id DESC LIMIT 1;

  v_slug := _free_lesson_slug(v_src.course_id, left(v_src.slug, 80) || '-copy');

  INSERT INTO lessons (course_id, ordinal, title, description, estimated_minutes, slug, access_level, week)
  VALUES (v_src.course_id,
          (SELECT COALESCE(MAX(ordinal), 0) + 1 FROM lessons WHERE course_id = v_src.course_id),
          left(v_src.title, 190) || ' (copy)', v_src.description, v_src.estimated_minutes, v_slug,
          v_src.access_level, v_src.week)
  RETURNING id INTO v_id;

  IF v_doc IS NOT NULL THEN
    INSERT INTO lesson_versions (lesson_id, document, source, created_by)
    VALUES (v_id, _apply_url_map(v_doc, p_url_map), 'editor', v_me);
  END IF;

  RETURN jsonb_build_object('ok', true, 'lesson_id', v_id, 'course_id', v_src.course_id, 'slug', v_slug);
END;
$$;
REVOKE ALL ON FUNCTION duplicate_lesson(UUID, JSONB) FROM public, anon;
GRANT EXECUTE ON FUNCTION duplicate_lesson(UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION duplicate_course(p_course_id UUID, p_new_course_id UUID, p_url_map JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       UUID := (SELECT auth.uid());
  v_is_admin BOOLEAN;
  v_src      courses%ROWTYPE;
  v_slug     TEXT;
  v_base     TEXT;
  v_n        INT := 1;
  v_lessons  INT := 0;
  l          RECORD;
  v_new_l    UUID;
  v_doc      JSONB;
BEGIN
  IF v_me IS NULL OR p_new_course_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  SELECT * INTO v_src FROM courses WHERE id = p_course_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;
  IF NOT can_edit_course(p_course_id, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  v_is_admin := is_admin(v_me);
  IF NOT v_is_admin AND NOT _author_seat_active(v_me) THEN
    IF EXISTS (SELECT 1 FROM author_seats WHERE user_id = v_me) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF EXISTS (SELECT 1 FROM courses WHERE id = p_new_course_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'id_taken');
  END IF;

  v_base := left(v_src.slug, 80) || '-copy';
  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM courses WHERE slug = v_slug) LOOP
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  END LOOP;

  BEGIN
    INSERT INTO courses (id, slug, title, subtitle, description, level, format, how_to_join_url,
                         cover_image_url, status, listed, author_id)
    VALUES (p_new_course_id, v_slug, left(v_src.title, 190) || ' (copy)', v_src.subtitle, v_src.description,
            v_src.level, v_src.format, v_src.how_to_join_url,
            CASE WHEN v_src.cover_image_url IS NULL THEN NULL
                 ELSE COALESCE(p_url_map ->> v_src.cover_image_url, v_src.cover_image_url) END,
            'draft', FALSE, v_me);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slug_taken');
  END;

  IF NOT v_is_admin THEN
    INSERT INTO course_editors (course_id, user_id, granted_by)
    VALUES (p_new_course_id, v_me, v_me);
  END IF;

  FOR l IN SELECT * FROM lessons WHERE course_id = p_course_id AND archived_at IS NULL
           ORDER BY ordinal, created_at, id LOOP
    v_lessons := v_lessons + 1;
    INSERT INTO lessons (course_id, ordinal, title, description, estimated_minutes, slug, access_level, week)
    VALUES (p_new_course_id, v_lessons, l.title, l.description, l.estimated_minutes, l.slug, l.access_level, l.week)
    RETURNING id INTO v_new_l;

    SELECT document INTO v_doc FROM lesson_versions
     WHERE lesson_id = l.id ORDER BY created_at DESC, id DESC LIMIT 1;
    IF v_doc IS NOT NULL THEN
      INSERT INTO lesson_versions (lesson_id, document, source, created_by)
      VALUES (v_new_l, _apply_url_map(v_doc, p_url_map), 'editor', v_me);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'course_id', p_new_course_id, 'slug', v_slug, 'lessons', v_lessons);
END;
$$;
REVOKE ALL ON FUNCTION duplicate_course(UUID, UUID, JSONB) FROM public, anon;
GRANT EXECUTE ON FUNCTION duplicate_course(UUID, UUID, JSONB) TO authenticated;

COMMIT;
