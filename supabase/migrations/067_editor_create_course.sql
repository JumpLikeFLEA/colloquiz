-- ============================================================
-- 067_editor_create_course.sql
--
-- AUTH-015 (docs/decisions/0125 Decision 2). Redefines create_course from
-- 044 so an author who already edits a course can create a new one in
-- Studio and edit it at once.
--
-- ── Gate: is_admin OR an editor of ANY course ───────────────────────────
-- 044's header made create_course admin-only because gating on
-- can_edit_course(<the new course>) is circular: the course has no
-- course_editors rows until after it exists. This gate asks a different
-- question, "is the caller an editor of something", which needs no row for
-- the course being created. It is the same population that can open Studio
-- (lib/studioEditor.ts: admin, or at least one course_editors row).
--
-- ── A non-admin creator gets a course_editors row, an admin gets none ───
-- Inserted in the same function call, so in the same transaction as the
-- course: a creator can never end up with a course they cannot edit.
-- granted_by = the creator (0125 D2). An admin gets no row: is_admin
-- already passes can_edit_course (029), and a row would only clutter the
-- course's Editors list.
--
-- grant_course_editor / revoke_course_editor are NOT touched: granting and
-- revoking stay admin-only (0041 D4). This file writes course_editors only
-- for the caller, only for the course it just created.
--
-- ── slug_taken under a race ──────────────────────────────────────────────
-- The EXISTS pre-check stays (it is the normal path). Two concurrent
-- creates with the same slug can both pass it; courses_slug_key (UNIQUE)
-- then rejects the second INSERT. That unique_violation is caught and
-- returned as slug_taken, so the dialog shows the inline message instead of
-- a 500. The block's implicit savepoint rolls back nothing but the failed
-- INSERT.
--
-- Signature, return shape and grants are unchanged (CREATE OR REPLACE over
-- the same four-argument signature, so no second overload).
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the user, never db push from the agent.
--
-- Safe to re-apply: CREATE OR REPLACE, then REVOKE/GRANT, both idempotent.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION create_course(p_slug TEXT, p_title TEXT, p_level TEXT, p_description TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       UUID := (SELECT auth.uid());
  v_is_admin BOOLEAN;
  v_id       UUID;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  v_is_admin := is_admin(v_me);
  IF NOT v_is_admin AND NOT EXISTS (SELECT 1 FROM course_editors WHERE user_id = v_me) THEN
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

  BEGIN
    INSERT INTO courses (slug, title, description, level, status, author_id)
    VALUES (p_slug, p_title, p_description, p_level, 'draft', v_me)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slug_taken');
  END;

  IF NOT v_is_admin THEN
    INSERT INTO course_editors (course_id, user_id, granted_by)
    VALUES (v_id, v_me, v_me);
  END IF;

  RETURN jsonb_build_object('ok', true, 'course_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION create_course(TEXT, TEXT, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION create_course(TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMIT;
