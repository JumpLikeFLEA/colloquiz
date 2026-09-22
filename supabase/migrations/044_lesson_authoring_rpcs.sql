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
-- lesson must stop being playable/readable by a non-editor, non-purchaser —
-- see the `can_read_lesson` and "lessons: published read" changes below —
-- but stays fully visible to editors (existing "lessons: editor read"
-- policy, 041, already has no archived-state clause and needs none: editors
-- must keep seeing an archived lesson to unarchive it).
--
-- ── entitled reads bypass content-state gates (docs/decisions/0025) ────────
-- An earlier version of this migration gated `archived_at IS NULL`
-- unconditionally, ahead of the entitlement check — which revoked a
-- purchaser's read access exactly like a hard delete would, contradicting
-- the "purchasers keep access" line above. `can_read_lesson` below is now
-- three branches (editor; free-sample; entitled), and entitled reads bypass
-- BOTH `archived_at` and the course's `status`, so `unpublish_course`
-- (added further down this file) doesn't revoke a purchaser's access
-- either. `published_version_id IS NOT NULL` stays un-bypassed in every
-- branch — a lesson that was never published stays invisible regardless of
-- entitlement (0019 Decision 2). See docs/decisions/0025 for the full
-- reasoning and what this deliberately does not solve (revocable access is
-- M3's `revoked_at`, not built here).
--
-- ── create_lesson: now generates its own slug (0023, CNT-002/041 gap) ──────
-- Migration 043 made `lessons.slug` NOT NULL with no DEFAULT, but 041's
-- `create_lesson` never set it — any interactive caller would fail the NOT
-- NULL constraint today. docs/decisions/0023 "Consequence for AUTH-001":
-- "the lesson editor must generate a lesson's slug from its title at
-- CREATION time only." Slugified here (not in a TS layer) because the
-- generation happens under the same `FOR UPDATE` lock on the parent course
-- that already exists in this function, for the same reason `in_free_sample`
-- is decided under that lock (041): two concurrent creates with the same
-- title must not race to the same slug. Deduped by suffixing -2, -3, ... on
-- collision within the course (`lessons.slug` is unique per course, 043, not
-- globally). VERIFIED, not just reasoned: two real concurrent psql sessions
-- (docs/decisions/0025 "Verification (create_lesson concurrency)") called
-- create_lesson with the identical title against the same course — the
-- second call blocked on the lock for the full duration the first held its
-- transaction open, then produced the correctly-deduped `-2` slug once the
-- first committed. `lessons_course_slug_idx` (043's `UNIQUE (course_id,
-- slug)`) is the backstop if this lock were ever removed — it would turn a
-- race into a constraint-violation error instead of a silent collision, not
-- prevent the race. `lib/lessonSlug.ts` (added alongside this migration)
-- mirrors this algorithm in TS for the create-lesson form's live preview
-- only — it has no authority of its own, matching the
-- `CEFR_LEVELS`/`courses_level_check` mirroring precedent (042).
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


-- ── has_course_entitlement: the one place course_entitlements is queried ────
-- SECURITY DEFINER so neither caller (can_read_lesson, itself already
-- SECURITY DEFINER, nor the "lessons: published read" RLS policy, which
-- runs as the CALLING role) ever needs a table-level grant on
-- course_entitlements to ask this question — the same no-grant-needed shape
-- CLAUDE.md's player_ratings rule already uses ("RLS on with no policies
-- and no grants; only the tier reaches the client"), and the reason a
-- GRANT SELECT ... TO anon on course_entitlements, briefly added by this
-- same migration to fix the policy directly, is removed below in favour of
-- this function (docs/decisions/0025 Decision 4).
CREATE OR REPLACE FUNCTION has_course_entitlement(p_course_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM course_entitlements
    WHERE user_id = (SELECT auth.uid()) AND course_id = p_course_id
  );
$$;

GRANT EXECUTE ON FUNCTION has_course_entitlement(UUID) TO anon, authenticated;


-- ── can_read_lesson: editor / free-sample / entitled ────────────────────────
-- Three branches, each independently sufficient:
--   1. editor  — can_edit_course; sees drafts, archived and unpublished alike
--      via the existing "lessons: editor read" policy, which this function
--      doesn't gate.
--   2. free-sample — course published, lesson published, NOT archived, and
--      flagged in_free_sample. An archived free-sample lesson stops being
--      free-sample-readable: an anonymous/non-buying visitor never bought
--      anything, so there is no purchaser promise to protect here.
--   3. entitled — has_course_entitlement(). Bypasses BOTH `c.status` and
--      `l.archived_at`: unpublishing the course or archiving the lesson
--      must not revoke a purchaser's access (docs/decisions/0025).
-- `l.published_version_id IS NOT NULL` is required in every non-editor
-- branch and never bypassed — a lesson that was never published stays
-- invisible regardless of entitlement (0019 Decision 2).
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
         AND l.in_free_sample
       )
       OR (
         l.published_version_id IS NOT NULL
         AND has_course_entitlement(l.course_id)
       )
     FROM lessons l
     JOIN courses c ON c.id = l.course_id
     WHERE l.id = p_lesson_id),
    FALSE
  );
$$;

GRANT EXECUTE ON FUNCTION can_read_lesson(UUID) TO anon, authenticated;


-- ── RLS: lessons published read, with the same entitled bypass ─────────────
-- Base case (everyone): a published, non-archived lesson's title/description/
-- published_item_count is visible to anon and authenticated alike, matching
-- can_read_lesson's free-sample branch's content-state conditions (this
-- policy itself carries no in_free_sample check — preview metadata is
-- visible for every lesson, free or paid, per docs/handoff.md). Entitled
-- bypass (matching can_read_lesson's entitled branch): a purchaser can still
-- SELECT the row — to render the lesson page's own title/description — even
-- when the lesson is archived or its course unpublished. Calls
-- has_course_entitlement() rather than querying course_entitlements
-- directly — this is a plain RLS policy (no SECURITY DEFINER of its own),
-- so a direct EXISTS here would run as the calling role, which is exactly
-- the mistake this migration made and then fixed with a table grant before
-- replacing that grant with this function (docs/decisions/0025 Decision 4).
DROP POLICY IF EXISTS "lessons: published read" ON lessons;
CREATE POLICY "lessons: published read"
  ON lessons FOR SELECT
  USING (
    published_version_id IS NOT NULL
    AND (
      (
        archived_at IS NULL
        AND EXISTS (SELECT 1 FROM courses c WHERE c.id = lessons.course_id AND c.status = 'published')
      )
      OR has_course_entitlement(lessons.course_id)
    )
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
--
-- FULL REPLACE, NOT A PARTIAL PATCH: p_description and p_estimated_minutes
-- are written exactly as given, including NULL — passing NULL CLEARS the
-- field, it does not mean "leave unchanged". This is a deliberate choice,
-- not an oversight (docs/decisions/0025): the only caller today
-- (EditLessonDialog, app/(main)/app/admin/courses/[id]/CourseDetailView.tsx)
-- always initialises its form from the lesson's current values and submits
-- all three fields together, so it is a whole-form save by construction —
-- clearing the description field in that form and saving SHOULD clear it in
-- the database, and there is no cheaper way to represent "clear this" than
-- NULL once title stays required. A future caller that wants to change only
-- one field must read the lesson first and pass its existing
-- description/estimated_minutes back explicitly; passing NULL to preserve
-- them is a bug in that caller, not in this function.
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
-- Gated on can_edit_course, same as every RPC in this file except
-- create_course (see file header) — so any course_editors delegate, not
-- only an admin, can archive a lesson. Since can_read_lesson's entitled
-- branch now bypasses archived_at (above), this no longer touches a
-- purchaser's access; it only removes the lesson from the free sample and
-- the catalogue. docs/decisions/0025 notes this RPC (and unpublish_course,
-- below) are reachable directly regardless of the admin-only page gate on
-- /app/admin/courses/**, and revisits that when a delegated-editor screen
-- is built.
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
