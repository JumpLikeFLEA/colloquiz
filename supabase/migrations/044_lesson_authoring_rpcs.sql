-- ============================================================
-- 044_lesson_authoring_rpcs.sql
--
-- AUTH-001. The minimum write path for the course/lesson-list authoring
-- screens: create/edit/publish a course, create/rename/archive/reorder a
-- lesson. Everything here is additive over 041/042/043 — no table this file
-- touches changes shape except `lessons` gaining one nullable column.
--
-- ── lessons.archived_at (soft archive, no hard delete) ──────────────────────
-- AUTH-001 acceptance: "No hard delete, because purchasers keep access to
-- what they bought." Mirrors `course_stages.archived_at` (028). An archived
-- lesson must stop being playable/readable by a non-editor — see the
-- `can_read_lesson` and "lessons: published read" changes below — but stays
-- fully visible to editors (existing "lessons: editor read" policy, 041,
-- already has no archived-state clause and needs none: editors must keep
-- seeing an archived lesson to unarchive it).
--
-- ── create_lesson: now generates its own slug (0023, CNT-002/041 gap) ──────
-- Migration 043 made `lessons.slug` NOT NULL with no DEFAULT, but 041's
-- `create_lesson` never set it — any interactive caller would fail the NOT
-- NULL constraint today. docs/decisions/0023 "Consequence for AUTH-001":
-- "the lesson editor must generate a lesson's slug from its title at
-- CREATION time only." Slugified here (not in a TS layer) because the
-- generation must happen under the same FOR UPDATE lock on the parent course
-- that already exists in this function, for the same reason `in_free_sample`
-- is decided under that lock (041): two concurrent creates with the same
-- title must not race to the same slug. Deduped by suffixing -2, -3, ... on
-- collision within the course (`lessons.slug` is unique per course, 043, not
-- globally). `lib/lessonSlug.ts` (added alongside this migration) mirrors
-- this algorithm in TS for the create-lesson form's live preview only — it
-- has no authority of its own, matching the `CEFR_LEVELS`/`courses_level_
-- check` mirroring precedent (042).
--
-- ── create_course is admin-only, not can_edit_course ────────────────────────
-- A course has no `course_editors` rows until after it exists, so gating
-- creation on `can_edit_course` (is_admin OR editor-of-this-course) would be
-- circular for a not-yet-created course. Matches `grant_course_editor`'s
-- existing admin-only gate (029): an admin creates the course, then delegates
-- editing via the existing grant RPC. Decided with the owner 2026-09-22 (see
-- docs/decisions/0025).
--
-- `author_id` is set to the creating admin. Nothing in AUTH-001's acceptance
-- list asks for attributing a course to a different profile (e.g. the
-- partner) at creation time; that is unbuilt scope, not a decision made here.
--
-- No guard against publishing a course with zero published lessons — not in
-- AUTH-001's acceptance list, and an empty-but-published course is a
-- harmless, correctable state (decided with the owner 2026-09-22).
--
-- ── reorder_lessons takes the FULL ordering, not a single move ──────────────
-- Simplest contract that cannot desync: the caller (the lesson-list UI, which
-- already has every row) sends the complete lesson-id order for the course;
-- the RPC validates it is exactly a permutation of that course's lesson ids
-- (archived included — archived rows still occupy a position in the list)
-- and writes ordinal = 1-based position. A "move one lesson" RPC would need
-- its own tie-breaking logic for an unordered `ordinal` column (041 already
-- rejected uniqueness on (course_id, ordinal) to make reordering swap-free);
-- sending the whole order sidesteps that entirely.
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the user, never db push from the agent.
--
-- Wrapped in one explicit transaction, consistent with 041/042/043.
--
-- Safe to re-apply: ADD COLUMN IF NOT EXISTS is idempotent, every function is
-- CREATE OR REPLACE, and DROP POLICY IF EXISTS precedes each recreated
-- policy. No data migration to re-run.
-- ============================================================

BEGIN;

-- ── lessons.archived_at ──────────────────────────────────────────────────
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;


-- ── can_read_lesson: archived lessons are never readable by non-editors ────
-- Same shape as 041's original, with one added clause. can_edit_course is
-- unaffected: editors still read an archived lesson via the existing
-- "lessons: editor read" / "lesson_versions: editor read" policies, which
-- this function doesn't gate.
CREATE OR REPLACE FUNCTION can_read_lesson(p_lesson_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT
       can_edit_course(l.course_id, (SELECT auth.uid()))
       OR (
         c.status = 'published'
         AND l.published_version_id IS NOT NULL
         AND l.archived_at IS NULL
         AND (
           l.in_free_sample
           OR EXISTS (
             SELECT 1 FROM course_entitlements ce
             WHERE ce.user_id = (SELECT auth.uid()) AND ce.course_id = l.course_id
           )
         )
       )
     FROM lessons l
     JOIN courses c ON c.id = l.course_id
     WHERE l.id = p_lesson_id),
    FALSE
  );
$$;

GRANT EXECUTE ON FUNCTION can_read_lesson(UUID) TO anon, authenticated;


-- ── RLS: lessons published read excludes archived ──────────────────────────
DROP POLICY IF EXISTS "lessons: published read" ON lessons;
CREATE POLICY "lessons: published read"
  ON lessons FOR SELECT
  USING (
    published_version_id IS NOT NULL
    AND archived_at IS NULL
    AND EXISTS (SELECT 1 FROM courses c WHERE c.id = lessons.course_id AND c.status = 'published')
  );


-- ── create_lesson: generate + dedupe slug from title ────────────────────────
CREATE OR REPLACE FUNCTION create_lesson(p_course_id UUID, p_title TEXT, p_description TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        UUID := (SELECT auth.uid());
  v_ordinal   INT;
  v_is_first  BOOLEAN;
  v_id        UUID;
  v_base_slug TEXT;
  v_slug      TEXT;
  v_suffix    INT := 1;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM courses WHERE id = p_course_id FOR UPDATE) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;
  IF NOT can_edit_course(p_course_id, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_title');
  END IF;

  -- Lowercase kebab-case, matching lessons_slug_check (043): strip anything
  -- outside [a-z0-9], collapse runs of separators to one hyphen, trim edge
  -- hyphens. A title with no ASCII alphanumeric (rare in practice — English
  -- lesson titles) falls back to "lesson" rather than producing an empty,
  -- constraint-violating slug.
  v_base_slug := lower(regexp_replace(btrim(p_title), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := btrim(v_base_slug, '-');
  IF v_base_slug = '' THEN
    v_base_slug := 'lesson';
  END IF;

  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM lessons WHERE course_id = p_course_id AND slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  END LOOP;

  SELECT COUNT(*) = 0, COALESCE(MAX(ordinal), 0) + 1
  INTO v_is_first, v_ordinal
  FROM lessons WHERE course_id = p_course_id;

  INSERT INTO lessons (course_id, ordinal, title, description, in_free_sample, slug)
  VALUES (p_course_id, v_ordinal, p_title, p_description, v_is_first, v_slug)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'lesson_id', v_id, 'in_free_sample', v_is_first, 'slug', v_slug);
END;
$$;

REVOKE ALL ON FUNCTION create_lesson(UUID, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION create_lesson(UUID, TEXT, TEXT) TO authenticated;


-- ── update_lesson: rename, edit description, edit estimated_minutes ────────
-- Deliberately separate from set_lesson_free_sample (041) and
-- set_lesson_archived (below) — same "explicit action, not a side effect"
-- reasoning 0018/041 already applies to in_free_sample. slug is NOT a
-- parameter: immutable once created (0023), no RPC path may change it.
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

REVOKE ALL ON FUNCTION update_lesson(UUID, TEXT, TEXT, INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION update_lesson(UUID, TEXT, TEXT, INT) TO authenticated;


-- ── set_lesson_archived ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_lesson_archived(p_lesson_id UUID, p_archived BOOLEAN)
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

  UPDATE lessons
  SET archived_at = CASE WHEN p_archived THEN NOW() ELSE NULL END
  WHERE id = p_lesson_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION set_lesson_archived(UUID, BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION set_lesson_archived(UUID, BOOLEAN) TO authenticated;


-- ── reorder_lessons: full-order replace ─────────────────────────────────
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

REVOKE ALL ON FUNCTION reorder_lessons(UUID, UUID[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION reorder_lessons(UUID, UUID[]) TO authenticated;


-- ── create_course (admin-only — see file header) ────────────────────────
CREATE OR REPLACE FUNCTION create_course(p_slug TEXT, p_title TEXT, p_level TEXT, p_description TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := (SELECT auth.uid());
  v_id UUID;
BEGIN
  IF NOT is_admin(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_title');
  END IF;
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_slug');
  END IF;
  IF p_level IS NULL OR p_level NOT IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_level');
  END IF;
  IF EXISTS (SELECT 1 FROM courses WHERE slug = p_slug) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slug_taken');
  END IF;

  INSERT INTO courses (slug, title, description, level, status, author_id)
  VALUES (p_slug, p_title, p_description, p_level, 'draft', v_me)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'course_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION create_course(TEXT, TEXT, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION create_course(TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ── update_course ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_course(p_course_id UUID, p_title TEXT, p_description TEXT, p_level TEXT)
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
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_title');
  END IF;
  IF p_level IS NULL OR p_level NOT IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_level');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM courses WHERE id = p_course_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;

  UPDATE courses
  SET title = p_title,
      description = p_description,
      level = p_level
  WHERE id = p_course_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION update_course(UUID, TEXT, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION update_course(UUID, TEXT, TEXT, TEXT) TO authenticated;


-- ── publish_course / unpublish_course ────────────────────────────────────
-- No "at least one published lesson" guard — see file header. Idempotent
-- (setting an already-published course to published is a no-op success).
CREATE OR REPLACE FUNCTION publish_course(p_course_id UUID)
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
  IF NOT EXISTS (SELECT 1 FROM courses WHERE id = p_course_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;

  UPDATE courses SET status = 'published' WHERE id = p_course_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION publish_course(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION publish_course(UUID) TO authenticated;

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
  IF NOT EXISTS (SELECT 1 FROM courses WHERE id = p_course_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;

  UPDATE courses SET status = 'draft' WHERE id = p_course_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION unpublish_course(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION unpublish_course(UUID) TO authenticated;

COMMIT;
