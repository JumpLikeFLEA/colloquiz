-- ============================================================
-- 071_delete_run_invite.sql
--
-- COH-009. An editor typed a wrong email into an invite and could only
-- Revoke it (059), which keeps the row, with the wrong contact label, until
-- purge_unclaimed_run_invites removes it 30 days later. This adds the
-- editor's own delete for an invite nobody has claimed.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header):
--   latest migration before this one -> 070_archive_keeps_open_lesson.sql
--   re-emitted bodies                -> none (a new function only)
--
-- Rules:
--   * gated on can_edit_course of the run's course, after "not found";
--   * only an unclaimed invite (claimed_at IS NULL): pending, expired or
--     revoked-and-unclaimed. A claimed invite is refused (invite_claimed):
--     its label is kept with the enrolment (059 section 6) and Revoke is the
--     path after a refund;
--   * the row is locked FOR UPDATE so a claim racing the delete serialises:
--     either the claim wins (this sees claimed_at, refuses) or the delete
--     wins (the claim sees not_found).
-- No grants on run_invites change. Safe to re-apply (CREATE OR REPLACE).
-- ============================================================

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
  IF v_claimed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_claimed');
  END IF;

  DELETE FROM run_invites WHERE id = p_invite_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION delete_run_invite(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_run_invite(UUID) TO authenticated;
