-- ============================================================
-- 066_enrolment_tier.sql
--
-- COH-007. An editor changes the tier of one enrolment in place: basic ->
-- extended after an upgrade, extended -> basic after a partial refund.
-- docs/decisions/0093 "Tier change" settled the shape (update `tier` in
-- place, no tier history); 0107 Decision 3 found no path that writes it.
-- Choices made while writing this are in docs/decisions/0122.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 065_course_stats.sql
--   latest body of the account-delete RPC   -> 061_run_final_comments.sql
-- Re-emitted bodies, each from its latest definition:
--   course_run_invites       059 (one added output column, enrolment_id)
-- delete_my_account is NOT touched: no new table, no new user-keyed row.
-- The access function (_lesson_access_at, can_read_lesson,
-- course_lesson_states) is NOT touched: tier gates calls only, and
-- course_calls (058) already reads run_enrolments.tier live.
--
-- ── 1. set_enrolment_tier ───────────────────────────────────────────────
-- SECURITY DEFINER, gated on can_edit_course of the enrolment's run's
-- course before anything beyond "not found" is revealed (058's
-- convention). Refuses a revoked enrolment: a refunded learner is
-- re-enrolled by a new invite, never revived by a tier edit. Setting the
-- tier it already has is ok with changed = false.
--
-- It also sets run_invites.tier on the invite that created the enrolment
-- (run_invites.enrolment_id, 059), so the runs page row and the claim page
-- name the tier the learner has now. 0093 keeps no tier history, so the
-- invite's original tier is not a record worth preserving.
--
-- Locks the invite before the enrolment, the order revoke_run_invite (059)
-- takes them, so the two can't deadlock.
--
-- ── 2. course_run_invites ───────────────────────────────────────────────
-- Re-emitted from 059 with enrolment_id appended, so the runs page can name
-- the enrolment a claimed invite created. A RETURNS TABLE change needs DROP
-- + CREATE; the grants are re-stated after it.
--
-- No grants on run_enrolments change: it stays owner-read, no writer but
-- SECURITY DEFINER functions.
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the owner, never by a session.
--
-- Safe to re-apply: CREATE OR REPLACE, DROP FUNCTION IF EXISTS.
-- ============================================================

BEGIN;

-- ── 1. set_enrolment_tier ───────────────────────────────────────────────
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

REVOKE ALL ON FUNCTION set_enrolment_tier(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_enrolment_tier(UUID, TEXT) TO authenticated;

-- ── 2. course_run_invites (059 + enrolment_id) ──────────────────────────
DROP FUNCTION IF EXISTS course_run_invites(UUID);
CREATE FUNCTION course_run_invites(p_course_id UUID)
RETURNS TABLE (
  invite_id       UUID,
  run_id          UUID,
  tier            TEXT,
  invitee_name    TEXT,
  invitee_contact TEXT,
  state           TEXT,
  created_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  claimed_at      TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  enrolment_id    UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.run_id, i.tier, i.invitee_name, i.invitee_contact,
         _run_invite_state(i.claimed_at, i.revoked_at, i.expires_at, r.ends_at, now()),
         i.created_at, LEAST(i.expires_at, r.ends_at), i.claimed_at, i.revoked_at,
         i.enrolment_id
  FROM run_invites i
  JOIN course_runs r ON r.id = i.run_id
  WHERE r.course_id = p_course_id
    AND can_edit_course(p_course_id, (SELECT auth.uid()))
  ORDER BY i.created_at DESC;
$$;

REVOKE ALL ON FUNCTION course_run_invites(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION course_run_invites(UUID) TO authenticated;

COMMIT;
