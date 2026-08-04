-- ============================================================
-- 030_delete_theory_version.sql
--
-- Adds a SECURITY DEFINER RPC that lets an admin or delegated course editor
-- prune a single row from course_stage_theory_versions (029). History is
-- append-only by default — every save snapshots the REPLACED blocks — and the
-- log can accumulate noise (typos saved and immediately corrected, dozens of
-- one-word tweaks) that has no operational value. This gives authors a way to
-- collapse the timeline without touching CURRENT state.
--
-- Delete is NOT a rewind: the current stage lives in course_stage_theory, not
-- in _versions. Pruning an old snapshot cannot corrupt the live blocks or the
-- optimistic-concurrency token. Reverts still work against any surviving
-- version, and a revert itself writes a fresh snapshot — the newest version
-- always reflects what was replaced most recently.
--
-- Authorization is can_edit_course (029): admins for every course, editors for
-- courses they hold a course_editors grant for. Same gate as save/read.
--
-- House style: table grants are unchanged (still SELECT-only); the write path
-- is the RPC. SET search_path = public. Safe to re-apply: CREATE OR REPLACE.
-- ============================================================


CREATE OR REPLACE FUNCTION delete_stage_theory_version(p_version_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_stage  UUID;
  v_course UUID;
BEGIN
  -- Resolve the owning stage + course so we can gate by can_edit_course.
  -- A row lookup by PK is cheap and gives us both a not-found signal and the
  -- ids we need in one shot.
  SELECT stage_id INTO v_stage
  FROM course_stage_theory_versions
  WHERE id = p_version_id;
  IF v_stage IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_not_found');
  END IF;

  SELECT course_id INTO v_course FROM course_stages WHERE id = v_stage;
  IF v_course IS NULL THEN
    -- The stage was deleted since the version row was written (ON DELETE
    -- CASCADE would have taken this version with it, so this branch is
    -- effectively unreachable — but keep the check so a broken FK doesn't
    -- silently 403).
    RETURN jsonb_build_object('ok', false, 'error', 'version_not_found');
  END IF;

  IF NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  DELETE FROM course_stage_theory_versions WHERE id = p_version_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION delete_stage_theory_version(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION delete_stage_theory_version(UUID) TO authenticated;
