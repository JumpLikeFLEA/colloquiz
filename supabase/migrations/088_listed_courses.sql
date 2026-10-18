-- ============================================================
-- 088_listed_courses.sql
--
-- TCH-010 (#224): a teacher's course opens by its link but stays out of the
-- public catalogue until an admin promotes it (docs/decisions/0141 Decision 1;
-- choices made while writing this file are in docs/decisions/0171).
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 087_teacher_course_grants.sql
--   latest body of the account-delete RPC   -> 086_calendar_feed.sql (NOT
--     re-emitted here: courses.listed is a flag on a course, not user-keyed
--     data; the export and the erasure do not read or need it)
--   assign_homework latest body             -> 083_seat_freeze.sql (re-emitted
--     below with ONE line changed, marked TCH-010)
--   homework_assignable latest body         -> 080_homework.sql (re-emitted
--     below with ONE line changed, marked TCH-010)
-- REQUIRES 028 (courses), 080 (homework), 082 (author_seats), 083.
--
-- ── 1. The column ───────────────────────────────────────────────────────
-- courses.listed BOOLEAN NOT NULL DEFAULT false. The catalogue (landing,
-- hero CTA) reads status = 'published' AND listed. A published, unlisted
-- course still opens by its URL: nothing in RLS or can_read_lesson changes.
-- The anon/authenticated table-level SELECT (028, 041) already covers a new
-- column, so no GRANT is added; the column is written only by the RPC below.
--
-- ── 2. The backfill, once ───────────────────────────────────────────────
-- Every course that is published when this file is first applied is set
-- listed = true, so the catalogue does not empty. It runs only when the
-- column is created by this run: re-applying the file must not re-list a
-- course an admin has since unlisted. Counts are printed as a NOTICE
-- (published / listed before / listed after).
--
-- ── 3. The admin functions ──────────────────────────────────────────────
-- set_course_listed(course, listed): admin only, JSONB {ok, error?}.
-- Errors: forbidden, course_not_found, not_published (only a published
-- course can be listed; unlisting is always allowed). No seat check: an
-- admin always may write (083).
-- admin_courses_listing(): admin only, one row per course with the author's
-- public name, for the /studio/authors panel. RAISEs 'forbidden' otherwise.
--
-- ── 4. Homework ─────────────────────────────────────────────────────────
-- assign_homework and homework_assignable offered "published, or edited by
-- the caller". They now offer "published AND listed, or edited by the
-- caller". An assignment already made to a course that is later unlisted
-- stays: students read it through the reader that 080 defines, unchanged.
--
-- Not destructive: one ADD COLUMN, a one-time UPDATE that only sets the new
-- column, two new functions, two re-emitted. No DROP, no TRUNCATE, no DELETE.
-- Safe to re-apply: IF-guarded column, CREATE OR REPLACE, backfill guard.
-- ============================================================

BEGIN;

-- ── 1 + 2. Column and one-time backfill ─────────────────────────────────
DO $$
DECLARE
  v_had     BOOLEAN;
  v_pub     INTEGER;
  v_listed0 INTEGER;
  v_listed1 INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'listed'
  ) INTO v_had;

  IF NOT v_had THEN
    ALTER TABLE courses ADD COLUMN listed BOOLEAN NOT NULL DEFAULT false;
    SELECT count(*) INTO v_pub FROM courses WHERE status = 'published';
    SELECT count(*) INTO v_listed0 FROM courses WHERE listed;
    UPDATE courses SET listed = true WHERE status = 'published';
    SELECT count(*) INTO v_listed1 FROM courses WHERE listed;
    RAISE NOTICE '088 backfill: published=%, listed before=%, listed after=%', v_pub, v_listed0, v_listed1;
  ELSE
    RAISE NOTICE '088: courses.listed already exists; backfill skipped';
  END IF;
END;
$$;

-- ── 3. set_course_listed ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_course_listed(p_course UUID, p_listed BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_status TEXT;
BEGIN
  IF v_me IS NULL OR NOT is_admin(v_me) OR p_listed IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT status INTO v_status FROM courses WHERE id = p_course;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;
  IF p_listed AND v_status <> 'published' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_published');
  END IF;

  UPDATE courses SET listed = p_listed WHERE id = p_course;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION set_course_listed(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_course_listed(UUID, BOOLEAN) TO authenticated;

-- ── admin_courses_listing ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_courses_listing()
RETURNS TABLE (
  course_id   UUID,
  slug        TEXT,
  title       TEXT,
  status      TEXT,
  listed      BOOLEAN,
  author_name TEXT,
  author_kind TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL OR NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT c.id, c.slug, c.title, c.status, c.listed, s.public_name, s.kind
  FROM courses c
  LEFT JOIN author_seats s ON s.user_id = c.author_id
  ORDER BY c.listed DESC, lower(c.title), c.id;
END;
$$;

REVOKE ALL ON FUNCTION admin_courses_listing() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_courses_listing() TO authenticated;

-- ── 4. homework_assignable (from 080_homework.sql) ──────────────────────
-- What the assign dialog may offer: LISTED published courses and courses the
-- caller edits, each with its published non-archived lessons.
CREATE OR REPLACE FUNCTION homework_assignable()
RETURNS TABLE (
  course_id      UUID,
  course_title   TEXT,
  course_slug    TEXT,
  course_edited  BOOLEAN,
  lesson_id      UUID,
  lesson_title   TEXT,
  lesson_ordinal INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.title, c.slug, can_edit_course(c.id, (SELECT auth.uid())),
         l.id, l.title, l.ordinal
  FROM courses c
  JOIN lessons l ON l.course_id = c.id
                AND l.published_version_id IS NOT NULL
                AND l.archived_at IS NULL
  WHERE _is_teacher((SELECT auth.uid()))
    AND ((c.status = 'published' AND c.listed) OR can_edit_course(c.id, (SELECT auth.uid())))  -- TCH-010: was c.status = 'published' alone
  ORDER BY can_edit_course(c.id, (SELECT auth.uid())) DESC, lower(c.title), c.id, l.ordinal, l.id;
$$;

REVOKE ALL ON FUNCTION homework_assignable() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION homework_assignable() TO authenticated;

-- assign_homework (from 083_seat_freeze.sql)
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
    WHERE c.id = p_course AND ((c.status = 'published' AND c.listed) OR can_edit_course(c.id, v_me))  -- TCH-010: was c.status = 'published' alone
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

REVOKE ALL ON FUNCTION assign_homework(UUID, UUID, DATE, TEXT, UUID[], UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION assign_homework(UUID, UUID, DATE, TEXT, UUID[], UUID[]) TO authenticated;

COMMIT;
