-- ============================================================
-- 083_seat_freeze.sql
--
-- TCH-008 (#222): a lapsed seat freezes the teacher's Studio. When a seat's
-- expiry passes, the teacher can read but not change anything, and nobody
-- loses access (docs/decisions/0141 Decision 4; choices made while writing
-- this file are in docs/decisions/0155).
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 082_author_seats.sql
--   latest body of the account-delete RPC   -> 082_author_seats.sql (NOT
--     re-emitted here: this file adds no user-keyed table)
-- REQUIRES 082 (author_seats, _author_seat_active) and every file that last
-- defined a function re-emitted below (each section names its source).
--
-- ── 1. One predicate ────────────────────────────────────────────────────
-- _studio_can_write(user): the user is an admin, or holds an ACTIVE seat
-- (082's _author_seat_active). No seat at all is NOT allowed either, which is
-- the card's "active seat or admin" and 082's create_course rule; the backfill
-- seated every existing editor, so nobody who could write yesterday is turned
-- away today (0155 Decision 1). It is NOT an entitlement rule: it decides who
-- may change Studio data, never who may open a lesson.
--
-- studio_can_write() is the same answer for the caller, granted to
-- authenticated so a storage policy (which runs as the caller) and the app
-- (which only shows the banner; the database refuses regardless) can ask it.
-- my_author_seat_state() returns the caller's own seat's expiry for that
-- banner, and nothing else of the row (the notes are the admin's).
--
-- ── 2. Where the predicate sits ─────────────────────────────────────────
-- Every Studio write path below gets ONE added statement, AFTER its existing
-- authorisation check, so a caller who may not act at all still hears
-- 'forbidden' and only an authorised-but-frozen caller hears 'seat_lapsed':
--   course and lesson authoring (15), runs, calls, invites and tiers (11),
--   the join-link rotation, groups (5) and homework (3), the lesson-images
--   storage policies, and the start of a NEW conversation.
-- Each body is the latest one, verbatim except for that statement.
--
-- ── 3. What a lapse does not change ─────────────────────────────────────
-- Published courses, entitlements, enrolments, links (and ending one),
-- the teacher's reads, replies in existing conversations, and feedback on
-- voice recordings (save_voice_feedback, save_final_comment) are untouched:
-- those files are not re-emitted. A student cannot START a conversation with
-- a frozen teacher ('teacher_unavailable'); the "Ask the teacher" dialog does
-- not list one either. No lesson policy or entitlement function is touched,
-- so the anonymous-path rows are not affected (the verify script prints a
-- learner's lesson access before and after anyway).
--
-- Not destructive: no DROP of a table or column, no TRUNCATE, no UPDATE or
-- DELETE of an existing row. The lesson-images policies are dropped and
-- recreated inside this transaction, as 041 and 044 did.
--
-- Safe to re-apply: CREATE OR REPLACE and DROP POLICY IF EXISTS throughout;
-- CREATE OR REPLACE keeps each function's existing privileges, so no GRANT is
-- repeated for a re-emitted function.
-- ============================================================

BEGIN;

-- ── 1. The predicate ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _studio_can_write(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user IS NOT NULL AND (is_admin(p_user) OR _author_seat_active(p_user));
$$;

REVOKE ALL ON FUNCTION _studio_can_write(UUID) FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION studio_can_write()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _studio_can_write((SELECT auth.uid()));
$$;

REVOKE ALL ON FUNCTION studio_can_write() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION studio_can_write() TO authenticated;


-- Zero rows when the caller has no seat. The expiry is the banner's date.
CREATE OR REPLACE FUNCTION my_author_seat_state()
RETURNS TABLE (
  is_active  BOOLEAN,
  expires_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (s.expires_at IS NULL OR s.expires_at > now()), s.expires_at
  FROM author_seats s
  WHERE s.user_id = (SELECT auth.uid());
$$;

REVOKE ALL ON FUNCTION my_author_seat_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_author_seat_state() TO authenticated;


-- ── 4. Course and lesson authoring ─────────────────────────────────
-- Each body is the latest one (file in the comment), verbatim except for the
-- one guard marked TCH-008, placed AFTER the existing authorisation check so a
-- caller who may not act at all still gets 'forbidden', not 'seat_lapsed'.

-- save_lesson_version: from 041_alliengll_schema.sql
CREATE OR REPLACE FUNCTION save_lesson_version(
  p_lesson_id        UUID,
  p_document         JSONB,
  p_base_version_id  UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me         UUID := (SELECT auth.uid());
  v_course     UUID;
  v_latest_id  UUID;
  v_new_id     UUID;
BEGIN
  SELECT course_id INTO v_course FROM lessons WHERE id = p_lesson_id FOR UPDATE;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;

  -- Structural backstop only — see the file header. Per-block validation is
  -- CNT-003's job, run in the API route before this RPC is ever called.
  IF jsonb_typeof(p_document) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_document');
  END IF;

  SELECT id INTO v_latest_id FROM lesson_versions
  WHERE lesson_id = p_lesson_id
  ORDER BY created_at DESC LIMIT 1;

  IF p_base_version_id IS DISTINCT FROM v_latest_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale');
  END IF;

  INSERT INTO lesson_versions (lesson_id, document, source, created_by)
  VALUES (p_lesson_id, p_document, 'editor', v_me)
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('ok', true, 'version_id', v_new_id);
END;
$$;

-- reorder_lessons: from 044_lesson_authoring_rpcs.sql
CREATE OR REPLACE FUNCTION reorder_lessons(p_course_id UUID, p_lesson_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me          UUID := (SELECT auth.uid());
  v_actual_ids  UUID[];
BEGIN
  IF NOT can_edit_course(p_course_id, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;

  SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO v_actual_ids
  FROM lessons WHERE course_id = p_course_id;

  -- Set-equality check: the caller must send every one of the course's
  -- lesson ids, exactly once, no foreign ids. Sorting both sides makes the
  -- comparison order-independent.
  IF (SELECT COALESCE(array_agg(x ORDER BY x), '{}'::uuid[]) FROM unnest(p_lesson_ids) x) <> v_actual_ids THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_set_mismatch');
  END IF;

  UPDATE lessons l
  SET ordinal = u.ord
  FROM unnest(p_lesson_ids) WITH ORDINALITY AS u(id, ord)
  WHERE l.id = u.id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- unpublish_course: from 044_lesson_authoring_rpcs.sql
CREATE OR REPLACE FUNCTION unpublish_course(p_course_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := (SELECT auth.uid());
BEGIN
  IF NOT can_edit_course(p_course_id, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM courses WHERE id = p_course_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;

  UPDATE courses SET status = 'draft' WHERE id = p_course_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- update_lesson: from 044_lesson_authoring_rpcs.sql
CREATE OR REPLACE FUNCTION update_lesson(
  p_lesson_id         UUID,
  p_title             TEXT,
  p_description       TEXT,
  p_estimated_minutes INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_course UUID;
BEGIN
  SELECT course_id INTO v_course FROM lessons WHERE id = p_lesson_id;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_title');
  END IF;
  IF p_estimated_minutes IS NOT NULL AND p_estimated_minutes <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_estimated_minutes');
  END IF;

  UPDATE lessons
  SET title = p_title,
      description = p_description,
      estimated_minutes = p_estimated_minutes
  WHERE id = p_lesson_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- update_lesson_slug: from 046_lesson_slug_transliteration.sql
CREATE OR REPLACE FUNCTION update_lesson_slug(p_lesson_id UUID, p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        UUID := (SELECT auth.uid());
  v_course    UUID;
  v_frozen_at TIMESTAMPTZ;
BEGIN
  SELECT course_id, slug_frozen_at INTO v_course, v_frozen_at
  FROM lessons WHERE id = p_lesson_id FOR UPDATE;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF v_frozen_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slug_frozen');
  END IF;
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_slug');
  END IF;
  IF EXISTS (
    SELECT 1 FROM lessons WHERE course_id = v_course AND slug = p_slug AND id <> p_lesson_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_slug_taken');
  END IF;

  UPDATE lessons SET slug = p_slug WHERE id = p_lesson_id;

  RETURN jsonb_build_object('ok', true, 'slug', p_slug);
END;
$$;

-- update_course: from 047_course_catalogue_fields.sql
CREATE OR REPLACE FUNCTION update_course(
  p_course_id       UUID,
  p_title           TEXT,
  p_description     TEXT,
  p_level           TEXT,
  p_subtitle        TEXT,
  p_cover_image_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_status TEXT;
BEGIN
  IF NOT can_edit_course(p_course_id, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_title');
  END IF;
  IF p_level IS NULL OR p_level NOT IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_level');
  END IF;
  IF p_subtitle IS NOT NULL AND char_length(p_subtitle) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'subtitle_too_long');
  END IF;

  SELECT status INTO v_status FROM courses WHERE id = p_course_id;
  IF v_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;
  IF v_status = 'published' AND p_cover_image_url IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_cover');
  END IF;
  IF v_status = 'published' AND p_subtitle IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_subtitle');
  END IF;

  UPDATE courses
  SET title = p_title,
      description = p_description,
      level = p_level,
      subtitle = p_subtitle,
      cover_image_url = p_cover_image_url
  WHERE id = p_course_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- set_course_format: from 058_cohort_schema.sql
CREATE OR REPLACE FUNCTION set_course_format(p_course_id UUID, p_format TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_status TEXT;
  v_format TEXT;
BEGIN
  SELECT status, format INTO v_status, v_format FROM courses WHERE id = p_course_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;
  IF NOT can_edit_course(p_course_id, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF p_format IS NULL OR p_format NOT IN ('self_paced', 'cohort') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_format');
  END IF;
  IF p_format = v_format THEN
    RETURN jsonb_build_object('ok', true);
  END IF;
  IF EXISTS (SELECT 1 FROM course_runs WHERE course_id = p_course_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'format_locked');
  END IF;
  -- Becoming self-paced brings back the open-lesson rule (0094 Decision 2).
  IF p_format = 'self_paced' AND v_status = 'published' AND NOT EXISTS (
    SELECT 1 FROM lessons
    WHERE course_id = p_course_id AND access_level = 'anyone' AND archived_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_open_lesson');
  END IF;

  UPDATE courses SET format = p_format WHERE id = p_course_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- set_course_how_to_join_url: from 058_cohort_schema.sql
CREATE OR REPLACE FUNCTION set_course_how_to_join_url(p_course_id UUID, p_url TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me  UUID := (SELECT auth.uid());
  v_url TEXT := NULLIF(btrim(p_url), '');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM courses WHERE id = p_course_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;
  IF NOT can_edit_course(p_course_id, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF v_url IS NOT NULL AND v_url !~ '^https://\S+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_url');
  END IF;

  UPDATE courses SET how_to_join_url = v_url WHERE id = p_course_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- set_lesson_week: from 058_cohort_schema.sql
CREATE OR REPLACE FUNCTION set_lesson_week(p_lesson_id UUID, p_week INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        UUID := (SELECT auth.uid());
  v_course    UUID;
  v_old_week  SMALLINT;
  v_level     TEXT;
  v_published BOOLEAN;
  v_format    TEXT;
BEGIN
  SELECT course_id, week, access_level, published_version_id IS NOT NULL
  INTO v_course, v_old_week, v_level, v_published
  FROM lessons WHERE id = p_lesson_id;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF p_week IS NOT NULL AND (p_week < 1 OR p_week > 32767) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_week');
  END IF;

  SELECT format INTO v_format FROM courses WHERE id = v_course FOR UPDATE;

  IF p_week IS NULL AND v_format = 'cohort' AND v_published AND v_level = 'entitled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'week_required');
  END IF;
  IF v_published
     AND v_old_week IS NOT NULL
     AND (p_week IS NULL OR p_week > v_old_week)
     AND _course_run_in_progress(v_course) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'week_frozen');
  END IF;

  UPDATE lessons SET week = p_week WHERE id = p_lesson_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- publish_course: from 058_cohort_schema.sql
CREATE OR REPLACE FUNCTION publish_course(p_course_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       UUID := (SELECT auth.uid());
  v_cover    TEXT;
  v_subtitle TEXT;
  v_format   TEXT;
BEGIN
  IF NOT can_edit_course(p_course_id, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;

  SELECT cover_image_url, subtitle, format INTO v_cover, v_subtitle, v_format
  FROM courses WHERE id = p_course_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;
  IF v_cover IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_cover');
  END IF;
  IF v_subtitle IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_subtitle');
  END IF;
  IF v_format = 'self_paced' AND NOT EXISTS (
    SELECT 1 FROM lessons
    WHERE course_id = p_course_id AND access_level = 'anyone' AND archived_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_open_lesson');
  END IF;

  UPDATE courses SET status = 'published' WHERE id = p_course_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- publish_lesson: from 058_cohort_schema.sql
CREATE OR REPLACE FUNCTION publish_lesson(
  p_lesson_id            UUID,
  p_expected_version_id  UUID,
  p_item_count           INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me         UUID := (SELECT auth.uid());
  v_course     UUID;
  v_level      TEXT;
  v_week       SMALLINT;
  v_latest_id  UUID;
BEGIN
  SELECT course_id, access_level, week INTO v_course, v_level, v_week
  FROM lessons WHERE id = p_lesson_id FOR UPDATE;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF p_item_count IS NULL OR p_item_count < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_item_count');
  END IF;
  IF v_level = 'entitled' AND v_week IS NULL
     AND EXISTS (SELECT 1 FROM courses WHERE id = v_course AND format = 'cohort') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'week_required');
  END IF;

  SELECT id INTO v_latest_id FROM lesson_versions
  WHERE lesson_id = p_lesson_id
  ORDER BY created_at DESC LIMIT 1;
  IF v_latest_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_draft');
  END IF;

  IF p_expected_version_id IS DISTINCT FROM v_latest_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale');
  END IF;

  UPDATE lessons
  SET published_version_id = p_expected_version_id,
      published_item_count = p_item_count,
      slug_frozen_at = COALESCE(slug_frozen_at, now())
  WHERE id = p_lesson_id;

  RETURN jsonb_build_object('ok', true, 'version_id', p_expected_version_id, 'item_count', p_item_count);
END;
$$;

-- create_lesson: from 069_drop_in_free_sample.sql
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
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
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

-- set_lesson_access_level: from 069_drop_in_free_sample.sql
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
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
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

-- set_lesson_archived: from 070_archive_keeps_open_lesson.sql
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
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
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

-- delete_course: from 068_delete_course.sql
CREATE OR REPLACE FUNCTION delete_course(p_course_id UUID, p_confirm_title TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_title  TEXT;
  v_check  JSONB;
BEGIN
  IF NOT can_edit_course(p_course_id, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;

  SELECT title INTO v_title FROM courses WHERE id = p_course_id FOR UPDATE;
  IF v_title IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;
  IF p_confirm_title IS NULL OR btrim(p_confirm_title) <> btrim(v_title) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'title_mismatch');
  END IF;

  -- Hold every row a blocker insert would reference (header, section 2).
  PERFORM 1 FROM lessons WHERE course_id = p_course_id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM lesson_versions v JOIN lessons l ON l.id = v.lesson_id
    WHERE l.course_id = p_course_id ORDER BY v.id FOR UPDATE OF v;
  PERFORM 1 FROM course_runs WHERE course_id = p_course_id ORDER BY id FOR UPDATE;

  v_check := course_delete_blockers(p_course_id);
  IF NOT (v_check->>'ok')::BOOLEAN THEN
    RETURN v_check;
  END IF;
  IF jsonb_array_length(v_check->'blockers') > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_deletable', 'blockers', v_check->'blockers');
  END IF;

  DELETE FROM course_runs WHERE course_id = p_course_id;
  DELETE FROM courses WHERE id = p_course_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── 5. Runs, calls, invites and tiers ──────────────────────────────
-- Each body is the latest one (file in the comment), verbatim except for the
-- one guard marked TCH-008, placed AFTER the existing authorisation check so a
-- caller who may not act at all still gets 'forbidden', not 'seat_lapsed'.

-- create_run: from 058_cohort_schema.sql
CREATE OR REPLACE FUNCTION create_run(p_course_id UUID, p_starts_at TIMESTAMPTZ, p_title TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_format TEXT;
  v_end    TIMESTAMPTZ;
  v_id     UUID;
BEGIN
  SELECT format INTO v_format FROM courses WHERE id = p_course_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;
  IF NOT can_edit_course(p_course_id, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF v_format <> 'cohort' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_cohort_course');
  END IF;
  IF p_starts_at IS NULL OR p_starts_at = 'infinity' OR p_starts_at = '-infinity' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_starts_at');
  END IF;
  v_end := _course_run_end(p_course_id, p_starts_at);
  IF v_end IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_scheduled_lessons');
  END IF;

  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
  VALUES (p_course_id, NULLIF(btrim(p_title), ''), p_starts_at, v_end)
  RETURNING id, ends_at INTO v_id, v_end;

  RETURN jsonb_build_object('ok', true, 'run_id', v_id, 'ends_at', v_end);
END;
$$;

-- update_run: from 058_cohort_schema.sql
CREATE OR REPLACE FUNCTION update_run(p_run_id UUID, p_starts_at TIMESTAMPTZ, p_title TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_course UUID;
  v_start  TIMESTAMPTZ;
  v_end    TIMESTAMPTZ;
BEGIN
  SELECT course_id, starts_at INTO v_course, v_start FROM course_runs WHERE id = p_run_id FOR UPDATE;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'run_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF p_starts_at IS NULL OR p_starts_at = 'infinity' OR p_starts_at = '-infinity' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_starts_at');
  END IF;
  IF v_start <= now() AND p_starts_at IS DISTINCT FROM v_start THEN
    RETURN jsonb_build_object('ok', false, 'error', 'run_started');
  END IF;

  UPDATE course_runs
  SET starts_at = p_starts_at, title = NULLIF(btrim(p_title), '')
  WHERE id = p_run_id
  RETURNING ends_at INTO v_end;

  RETURN jsonb_build_object('ok', true, 'ends_at', v_end);
END;
$$;

-- close_run: from 058_cohort_schema.sql
CREATE OR REPLACE FUNCTION close_run(p_run_id UUID, p_ends_at TIMESTAMPTZ DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_course UUID;
  v_start  TIMESTAMPTZ;
  v_end    TIMESTAMPTZ;
  v_new    TIMESTAMPTZ := COALESCE(p_ends_at, now());
BEGIN
  SELECT course_id, starts_at, ends_at INTO v_course, v_start, v_end
  FROM course_runs WHERE id = p_run_id FOR UPDATE;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'run_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF v_start > now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'run_not_started');
  END IF;
  IF v_new > v_end THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_extend_started_run');
  END IF;
  IF v_new <= v_start THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_ends_at');
  END IF;

  UPDATE course_runs SET ends_at = v_new WHERE id = p_run_id;
  RETURN jsonb_build_object('ok', true, 'ends_at', v_new);
END;
$$;

-- delete_run: from 058_cohort_schema.sql
CREATE OR REPLACE FUNCTION delete_run(p_run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_course UUID;
  v_start  TIMESTAMPTZ;
BEGIN
  SELECT course_id, starts_at INTO v_course, v_start FROM course_runs WHERE id = p_run_id FOR UPDATE;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'run_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF v_start <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'run_started');
  END IF;
  IF EXISTS (SELECT 1 FROM run_enrolments WHERE run_id = p_run_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'run_has_enrolments');
  END IF;

  DELETE FROM course_runs WHERE id = p_run_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- create_call: from 058_cohort_schema.sql
CREATE OR REPLACE FUNCTION create_call(p_run_id UUID, p_starts_at TIMESTAMPTZ, p_meet_url TEXT, p_title TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_course UUID;
  v_url    TEXT := btrim(p_meet_url);
  v_id     UUID;
BEGIN
  SELECT course_id INTO v_course FROM course_runs WHERE id = p_run_id;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'run_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF p_starts_at IS NULL OR p_starts_at = 'infinity' OR p_starts_at = '-infinity' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_starts_at');
  END IF;
  IF v_url IS NULL OR v_url !~ '^https://\S+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_url');
  END IF;

  INSERT INTO run_calls (run_id, starts_at, meet_url, title)
  VALUES (p_run_id, p_starts_at, v_url, NULLIF(btrim(p_title), ''))
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'call_id', v_id);
END;
$$;

-- update_call: from 058_cohort_schema.sql
CREATE OR REPLACE FUNCTION update_call(p_call_id UUID, p_starts_at TIMESTAMPTZ, p_meet_url TEXT, p_title TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_course UUID;
  v_url    TEXT := btrim(p_meet_url);
BEGIN
  SELECT r.course_id INTO v_course
  FROM run_calls k JOIN course_runs r ON r.id = k.run_id
  WHERE k.id = p_call_id;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'call_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF p_starts_at IS NULL OR p_starts_at = 'infinity' OR p_starts_at = '-infinity' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_starts_at');
  END IF;
  IF v_url IS NULL OR v_url !~ '^https://\S+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_url');
  END IF;

  UPDATE run_calls
  SET starts_at = p_starts_at, meet_url = v_url, title = NULLIF(btrim(p_title), '')
  WHERE id = p_call_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- delete_call: from 058_cohort_schema.sql
CREATE OR REPLACE FUNCTION delete_call(p_call_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_course UUID;
BEGIN
  SELECT r.course_id INTO v_course
  FROM run_calls k JOIN course_runs r ON r.id = k.run_id
  WHERE k.id = p_call_id;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'call_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;

  DELETE FROM run_calls WHERE id = p_call_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- create_run_invite: from 059_run_invites.sql
CREATE OR REPLACE FUNCTION create_run_invite(p_run_id UUID, p_tier TEXT, p_name TEXT, p_contact TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      UUID := (SELECT auth.uid());
  v_course  UUID;
  v_ends_at TIMESTAMPTZ;
  v_name    TEXT := btrim(p_name);
  v_contact TEXT := btrim(p_contact);
  v_token   TEXT;
  v_id      UUID;
  v_expires TIMESTAMPTZ;
BEGIN
  SELECT course_id, ends_at INTO v_course, v_ends_at FROM course_runs WHERE id = p_run_id;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'run_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF p_tier IS NULL OR p_tier NOT IN ('basic', 'extended') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_tier');
  END IF;
  IF v_name IS NULL OR char_length(v_name) NOT BETWEEN 1 AND 120 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_invitee_name');
  END IF;
  -- An email, or a Telegram username (5-32 of [A-Za-z0-9_], written with @).
  IF v_contact IS NULL
     OR char_length(v_contact) > 254
     OR NOT (v_contact ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR v_contact ~ '^@[A-Za-z0-9_]{5,32}$') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_invitee_contact');
  END IF;
  IF now() >= v_ends_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'run_ended');
  END IF;

  DELETE FROM run_invite_creation_log WHERE created_at <= NOW() - INTERVAL '1 hour';
  BEGIN
    INSERT INTO run_invite_creation_log (user_id) VALUES (v_me);
  EXCEPTION WHEN SQLSTATE 'PT429' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END;

  v_token   := encode(extensions.gen_random_bytes(16), 'hex');
  v_expires := now() + INTERVAL '30 days';

  INSERT INTO run_invites (run_id, tier, token_hash, invitee_name, invitee_contact, created_by, expires_at)
  VALUES (p_run_id, p_tier, _run_invite_token_hash(v_token), v_name, v_contact, v_me, v_expires)
  RETURNING id INTO v_id;

  -- The raw token leaves the database here and nowhere else.
  RETURN jsonb_build_object('ok', true, 'invite_id', v_id, 'token', v_token,
                            'expires_at', LEAST(v_expires, v_ends_at));
END;
$$;

-- revoke_run_invite: from 059_run_invites.sql
CREATE OR REPLACE FUNCTION revoke_run_invite(p_invite_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me         UUID := (SELECT auth.uid());
  v_course     UUID;
  v_revoked_at TIMESTAMPTZ;
  v_enrolment  UUID;
  v_ended      INTEGER := 0;
BEGIN
  SELECT r.course_id, i.revoked_at, i.enrolment_id
  INTO v_course, v_revoked_at, v_enrolment
  FROM run_invites i JOIN course_runs r ON r.id = i.run_id
  WHERE i.id = p_invite_id
  FOR UPDATE OF i;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF v_revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'enrolment_revoked', false);
  END IF;

  UPDATE run_invites SET revoked_at = now() WHERE id = p_invite_id;

  -- Exactly the enrolment this invite created (0093 Decision 2).
  IF v_enrolment IS NOT NULL THEN
    UPDATE run_enrolments SET revoked_at = now()
    WHERE id = v_enrolment AND revoked_at IS NULL;
    GET DIAGNOSTICS v_ended = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('ok', true, 'enrolment_revoked', v_ended > 0);
END;
$$;

-- delete_run_invite: from 071_delete_run_invite.sql
CREATE OR REPLACE FUNCTION delete_run_invite(p_invite_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me         UUID := (SELECT auth.uid());
  v_course     UUID;
  v_claimed_at TIMESTAMPTZ;
BEGIN
  SELECT r.course_id, i.claimed_at
  INTO v_course, v_claimed_at
  FROM run_invites i JOIN course_runs r ON r.id = i.run_id
  WHERE i.id = p_invite_id
  FOR UPDATE OF i;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF v_claimed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_claimed');
  END IF;

  DELETE FROM run_invites WHERE id = p_invite_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- set_enrolment_tier: from 066_enrolment_tier.sql
CREATE OR REPLACE FUNCTION set_enrolment_tier(p_enrolment_id UUID, p_tier TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me         UUID := (SELECT auth.uid());
  v_course     UUID;
  v_tier       TEXT;
  v_revoked_at TIMESTAMPTZ;
BEGIN
  SELECT r.course_id INTO v_course
  FROM run_enrolments e JOIN course_runs r ON r.id = e.run_id
  WHERE e.id = p_enrolment_id;
  IF v_course IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'enrolment_not_found');
  END IF;
  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF p_tier IS NULL OR p_tier NOT IN ('basic', 'extended') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_tier');
  END IF;

  PERFORM 1 FROM run_invites WHERE enrolment_id = p_enrolment_id FOR UPDATE;
  SELECT tier, revoked_at INTO v_tier, v_revoked_at
  FROM run_enrolments WHERE id = p_enrolment_id
  FOR UPDATE;
  IF v_revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'enrolment_revoked');
  END IF;
  IF v_tier = p_tier THEN
    RETURN jsonb_build_object('ok', true, 'changed', false, 'tier', v_tier);
  END IF;

  UPDATE run_enrolments SET tier = p_tier WHERE id = p_enrolment_id;
  UPDATE run_invites    SET tier = p_tier WHERE enrolment_id = p_enrolment_id;

  RETURN jsonb_build_object('ok', true, 'changed', true, 'tier', p_tier);
END;
$$;

-- ── 6. Teacher links, groups and homework ──────────────────────────
-- Each body is the latest one (file in the comment), verbatim except for the
-- one guard marked TCH-008, placed AFTER the existing authorisation check so a
-- caller who may not act at all still gets 'forbidden', not 'seat_lapsed'.

-- rotate_teacher_join_token: from 076_teacher_links.sql
CREATE OR REPLACE FUNCTION rotate_teacher_join_token()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    UUID := (SELECT auth.uid());
  v_token TEXT;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF NOT _is_teacher(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;

  v_token := encode(extensions.gen_random_bytes(16), 'hex');
  INSERT INTO teacher_join_tokens (teacher_id, token_hash)
  VALUES (v_me, _teacher_join_token_hash(v_token))
  ON CONFLICT (teacher_id)
    DO UPDATE SET token_hash = EXCLUDED.token_hash, rotated_at = now();

  RETURN jsonb_build_object('ok', true, 'token', v_token);
END;
$$;

-- create_teacher_group: from 077_teacher_groups.sql
CREATE OR REPLACE FUNCTION create_teacher_group(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   UUID := (SELECT auth.uid());
  v_name TEXT := btrim(COALESCE(p_name, ''));
  v_id   UUID;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF NOT _is_teacher(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 60 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_name');
  END IF;

  BEGIN
    INSERT INTO teacher_groups (teacher_id, name) VALUES (v_me, v_name) RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_taken');
  END;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

-- rename_teacher_group: from 077_teacher_groups.sql
CREATE OR REPLACE FUNCTION rename_teacher_group(p_group UUID, p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   UUID := (SELECT auth.uid());
  v_name TEXT := btrim(COALESCE(p_name, ''));
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 60 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_name');
  END IF;

  BEGIN
    UPDATE teacher_groups SET name = v_name WHERE id = p_group AND teacher_id = v_me;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_taken');
  END;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- delete_teacher_group: from 077_teacher_groups.sql
CREATE OR REPLACE FUNCTION delete_teacher_group(p_group UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := (SELECT auth.uid());
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;

  DELETE FROM teacher_groups WHERE id = p_group AND teacher_id = v_me;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- add_teacher_group_members: from 077_teacher_groups.sql
CREATE OR REPLACE FUNCTION add_teacher_group_members(p_group UUID, p_students UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    UUID := (SELECT auth.uid());
  v_ids   UUID[];
  v_added INTEGER;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM teacher_groups WHERE id = p_group AND teacher_id = v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT COALESCE(array_agg(DISTINCT s), ARRAY[]::UUID[])
    INTO v_ids
  FROM unnest(COALESCE(p_students, ARRAY[]::UUID[])) AS s;

  IF cardinality(v_ids) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_ids) AS s WHERE NOT _teacher_linked(v_me, s)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_linked');
  END IF;

  INSERT INTO teacher_group_members (group_id, teacher_id, student_id)
  SELECT p_group, v_me, s FROM unnest(v_ids) AS s
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_added = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'added', v_added);
END;
$$;

-- remove_teacher_group_member: from 077_teacher_groups.sql
CREATE OR REPLACE FUNCTION remove_teacher_group_member(p_group UUID, p_student UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := (SELECT auth.uid());
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;

  DELETE FROM teacher_group_members
   WHERE group_id = p_group AND teacher_id = v_me AND student_id = p_student;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- assign_homework: from 080_homework.sql
CREATE OR REPLACE FUNCTION assign_homework(
  p_course   UUID,
  p_lesson   UUID,
  p_due      DATE,
  p_note     TEXT,
  p_students UUID[],
  p_groups   UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       UUID := (SELECT auth.uid());
  v_note     TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_students UUID[];
  v_groups   UUID[];
  v_id       UUID;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF NOT _is_teacher(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM courses c
    WHERE c.id = p_course AND (c.status = 'published' OR can_edit_course(c.id, v_me))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;

  IF p_lesson IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM lessons l
    WHERE l.id = p_lesson AND l.course_id = p_course
      AND l.published_version_id IS NOT NULL AND l.archived_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_not_found');
  END IF;

  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_note');
  END IF;

  SELECT COALESCE(array_agg(DISTINCT s), ARRAY[]::UUID[]) INTO v_students
  FROM unnest(COALESCE(p_students, ARRAY[]::UUID[])) AS s;
  SELECT COALESCE(array_agg(DISTINCT g), ARRAY[]::UUID[]) INTO v_groups
  FROM unnest(COALESCE(p_groups, ARRAY[]::UUID[])) AS g;

  IF cardinality(v_students) + cardinality(v_groups) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_targets');
  END IF;
  IF cardinality(v_students) > 500 OR cardinality(v_groups) > 100 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_students) AS s WHERE NOT _teacher_linked(v_me, s)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_linked');
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_groups) AS g
    WHERE NOT EXISTS (SELECT 1 FROM teacher_groups tg WHERE tg.id = g AND tg.teacher_id = v_me)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'group_not_found');
  END IF;

  INSERT INTO homework_assignments (teacher_id, course_id, lesson_id, due_on, note)
  VALUES (v_me, p_course, p_lesson, p_due, v_note)
  RETURNING id INTO v_id;

  INSERT INTO homework_targets (assignment_id, teacher_id, student_id)
  SELECT v_id, v_me, s FROM unnest(v_students) AS s;
  INSERT INTO homework_targets (assignment_id, teacher_id, group_id)
  SELECT v_id, v_me, g FROM unnest(v_groups) AS g;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

-- update_homework: from 080_homework.sql
CREATE OR REPLACE FUNCTION update_homework(p_assignment UUID, p_due DATE, p_note TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   UUID := (SELECT auth.uid());
  v_note TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_note');
  END IF;

  UPDATE homework_assignments SET due_on = p_due, note = v_note
   WHERE id = p_assignment AND teacher_id = v_me;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- delete_homework: from 080_homework.sql
CREATE OR REPLACE FUNCTION delete_homework(p_assignment UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := (SELECT auth.uid());
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;

  DELETE FROM homework_assignments WHERE id = p_assignment AND teacher_id = v_me;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── 7. New conversations need a teacher who is not frozen ──────────
-- A reply in a conversation that already exists is unchanged by a lapse; only
-- a NEW conversation (either side starting it) needs studio-write rights.

-- send_teacher_message (4 arguments): from 081_ask_the_teacher.sql
CREATE OR REPLACE FUNCTION send_teacher_message(
  p_teacher    UUID,
  p_student    UUID,
  p_body       JSONB,
  p_attachment JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   UUID := (SELECT auth.uid());
  v_conv UUID;
  v_msg  UUID;
  v_norm JSONB;
  v_att  JSONB;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF p_teacher IS NULL OR p_student IS NULL OR p_teacher = p_student
     OR (v_me <> p_teacher AND v_me <> p_student) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT _message_body_valid(p_body) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_body');
  END IF;

  SELECT c.id INTO v_conv
  FROM teacher_conversations c
  WHERE c.teacher_id = p_teacher AND c.student_id = p_student;

  IF NOT (_teacher_linked(p_teacher, p_student) AND _is_teacher(p_teacher)) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', CASE WHEN v_conv IS NULL THEN 'not_linked' ELSE 'closed' END
    );
  END IF;

  -- TCH-008 (0141 Decision 4): students cannot open a new thread with a frozen
  -- teacher, and a frozen teacher cannot open one either. A conversation that
  -- already exists keeps working, both ways.
  IF v_conv IS NULL AND NOT _studio_can_write(p_teacher) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', CASE WHEN v_me = p_teacher THEN 'seat_lapsed' ELSE 'teacher_unavailable' END
    );
  END IF;

  -- Only the student asks about an exercise, and the snapshot is rebuilt from
  -- the database before anything is written (section 5 of the header).
  IF p_attachment IS NOT NULL THEN
    IF v_me <> p_student THEN
      RETURN jsonb_build_object('ok', false, 'error', 'attachment_not_allowed');
    END IF;
    v_norm := _attachment_normalise(p_teacher, p_student, p_attachment);
    IF NOT COALESCE((v_norm->>'ok')::boolean, false) THEN
      RETURN jsonb_build_object('ok', false, 'error', COALESCE(v_norm->>'error', 'attachment_invalid'));
    END IF;
    v_att := v_norm->'attachment';
  END IF;

  IF v_conv IS NULL THEN
    INSERT INTO teacher_conversations (teacher_id, student_id)
    VALUES (p_teacher, p_student)
    ON CONFLICT (teacher_id, student_id) DO NOTHING
    RETURNING id INTO v_conv;
    IF v_conv IS NULL THEN
      SELECT c.id INTO v_conv
      FROM teacher_conversations c
      WHERE c.teacher_id = p_teacher AND c.student_id = p_student;
    END IF;
  END IF;

  INSERT INTO teacher_messages (conversation_id, author_id, body, attachment)
  VALUES (v_conv, v_me, p_body, v_att)
  RETURNING id INTO v_msg;

  RETURN jsonb_build_object('ok', true, 'conversation_id', v_conv, 'message_id', v_msg);
END;
$$;

-- _ask_teacher_allowed: from 081_ask_the_teacher.sql
CREATE OR REPLACE FUNCTION _ask_teacher_allowed(p_teacher UUID, p_student UUID, p_lesson UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_teacher IS NOT NULL AND p_student IS NOT NULL AND p_lesson IS NOT NULL
    AND p_teacher <> p_student
    AND _teacher_linked(p_teacher, p_student)
    AND _is_teacher(p_teacher)
    -- TCH-008: a frozen teacher is not offered to a student with no thread yet,
    -- so the dialog never lists someone the send would then refuse.
    AND (
      _studio_can_write(p_teacher)
      OR EXISTS (
        SELECT 1 FROM teacher_conversations c
        WHERE c.teacher_id = p_teacher AND c.student_id = p_student
      )
    )
    AND EXISTS (
      SELECT 1
      FROM lessons l
      WHERE l.id = p_lesson
        AND (
          can_edit_course(l.course_id, p_teacher)
          OR EXISTS (
            SELECT 1
            FROM _homework_recipients(p_teacher, p_student) r
            JOIN homework_assignments a ON a.id = r.assignment_id
            WHERE a.teacher_id = p_teacher
              AND a.course_id = l.course_id
              AND (a.lesson_id IS NULL OR a.lesson_id = l.id)
          )
        )
    );
$$;

-- ── 8. Lesson images: the storage policies freeze too ───────────────────
-- 041's editor insert/update/delete, with the one added condition. Reading
-- (the public read policy) is untouched, so published lessons keep their
-- pictures. studio_can_write() is the caller-facing form of the predicate.
DROP POLICY IF EXISTS "lesson_images: editor insert" ON storage.objects;
CREATE POLICY "lesson_images: editor insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lesson-images'
    AND can_edit_course((storage.foldername(name))[1]::uuid, (SELECT auth.uid()))
    AND studio_can_write()
  );

DROP POLICY IF EXISTS "lesson_images: editor update" ON storage.objects;
CREATE POLICY "lesson_images: editor update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'lesson-images'
    AND can_edit_course((storage.foldername(name))[1]::uuid, (SELECT auth.uid()))
    AND studio_can_write()
  );

DROP POLICY IF EXISTS "lesson_images: editor delete" ON storage.objects;
CREATE POLICY "lesson_images: editor delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'lesson-images'
    AND can_edit_course((storage.foldername(name))[1]::uuid, (SELECT auth.uid()))
    AND studio_can_write()
  );

COMMIT;
