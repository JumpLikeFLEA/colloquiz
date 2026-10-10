-- ============================================================
-- 059_run_invites.sql
--
-- COH-003. Invite links for cohort runs: the partner is paid outside the
-- app, then sends each learner a one-time link for a run and a tier
-- (docs/handoff.md "Payments"). Claiming it writes ONE run_enrolments row
-- (docs/decisions/0093 Decision 2, option c); revoking it sets that row's
-- revoked_at and nothing else. Choices made while writing it are in
-- docs/decisions/0107.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 058_cohort_schema.sql
--   latest body of the account-delete RPC   -> 058_cohort_schema.sql
-- Re-emitted bodies, each from its latest definition:
--   delete_my_account        058 (one added DELETE, section 7)
-- Nothing else is re-emitted. The access function (_lesson_access_at,
-- can_read_lesson, course_lesson_states) is NOT touched: an invite only
-- writes enrolment rows, and 058 already reads them.
--
-- ── 1. run_invites ──────────────────────────────────────────────────────
-- One row per invite. The raw token is 128 random bits, generated here by
-- create_run_invite and returned to the editor ONCE; only its SHA-256 hex
-- digest is stored (0066's format: 32 hex chars raw, 64 hex chars at rest).
-- invitee_name / invitee_contact are the "contact label" (0093, 0095): a
-- name and an email or @telegram handle the editor types. Personal data:
-- no grants at all on this table, every read goes through a SECURITY
-- DEFINER function that returns them to editors of the course only (and,
-- for the export, to the learner who claimed that invite).
--
-- ── 2. Rate limit ───────────────────────────────────────────────────────
-- run_invite_creation_log + a BEFORE INSERT trigger raising PT429, the 049
-- shape keyed by the editor's user id (the caller is signed in, so there is
-- no IP to trust). Swept inline on every create (051 / 052 precedent).
--
-- ── 3. Expiry ───────────────────────────────────────────────────────────
-- An invite expires 30 days after creation, or when its run ends, whichever
-- is first. The run's end is read at claim time, not copied, because an
-- unstarted run's ends_at is recomputed by 058's trigger. A claim into an
-- ended run is refused here as `expired` before 058's enrolment guard would
-- raise `run_ended`.
--
-- ── 4. Claim ────────────────────────────────────────────────────────────
-- claim_run_invite(token): the invite row is locked FOR UPDATE, so two
-- accounts claiming one link serialise and the second sees `used`. The
-- enrolment insert and the invite update are one statement block inside
-- one function call, so either both land or neither does. A learner who
-- already has an active enrolment in that run is refused with
-- `already_enrolled` and the invite stays unspent (0107 Decision 3).
--
-- ── 5. Revoke ───────────────────────────────────────────────────────────
-- revoke_run_invite(invite): sets the invite's revoked_at and, if it was
-- claimed, the revoked_at of exactly the enrolment it created
-- (run_invites.enrolment_id). Another enrolment of the same learner, in
-- another run or re-enrolled in this one, is not touched.
--
-- ── 6. Purge (0095: "Unclaimed labels are deleted 30 days after the
--      invite expires or is revoked") ───────────────────────────────────
-- purge_unclaimed_run_invites() DELETEs every unclaimed invite whose end
-- (the earliest of revoked_at, expires_at and its run's ends_at) is 30 days
-- or more in the past. Run daily by pg_cron (033 precedent). Claimed
-- invites are kept: their label is kept with the enrolment and deleted with
-- the account (section 7).
--
-- ── 7. Export and deletion ──────────────────────────────────────────────
-- my_claimed_invites() returns the caller's own claimed invites (label
-- included) for app/api/account/export. delete_my_account re-emitted from
-- 058 with one added DELETE: the invites the caller claimed.
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the owner, never by a session.
--
-- Safe to re-apply: CREATE TABLE / INDEX IF NOT EXISTS, DROP TRIGGER IF
-- EXISTS before each, every function CREATE OR REPLACE, cron.schedule
-- upserts by job name.
-- ============================================================

BEGIN;

-- ── 1. run_invites ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS run_invites (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID        NOT NULL REFERENCES course_runs(id) ON DELETE CASCADE,
  tier            TEXT        NOT NULL CHECK (tier IN ('basic', 'extended')),
  token_hash      TEXT        NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  invitee_name    TEXT        NOT NULL CHECK (char_length(invitee_name) BETWEEN 1 AND 120),
  invitee_contact TEXT        NOT NULL CHECK (char_length(invitee_contact) BETWEEN 1 AND 254),
  created_by      UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  claimed_at      TIMESTAMPTZ,
  claimed_by      UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  enrolment_id    UUID        REFERENCES run_enrolments(id) ON DELETE SET NULL,
  revoked_at      TIMESTAMPTZ,
  -- claimed_by may go NULL (ON DELETE SET NULL) on a claimed row; it may
  -- never be set on an unclaimed one.
  CONSTRAINT run_invites_claimed_by_needs_claim
    CHECK (claimed_by IS NULL OR claimed_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS run_invites_run_idx ON run_invites (run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS run_invites_claimed_by_idx ON run_invites (claimed_by) WHERE claimed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS run_invites_unclaimed_idx ON run_invites (expires_at) WHERE claimed_at IS NULL;

COMMENT ON COLUMN run_invites.invitee_name IS
  'Contact label (personal data, docs/decisions/0093/0095). Editors of the course only; purged 30 days after an unclaimed invite ends.';
COMMENT ON COLUMN run_invites.invitee_contact IS
  'Email or @telegram handle. Same rules as invitee_name.';

ALTER TABLE run_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE run_invites FROM PUBLIC, anon, authenticated;
-- No GRANT and no policy: only the SECURITY DEFINER functions below read or
-- write it.


-- ── 2. Rate limit on creation ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS run_invite_creation_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS run_invite_creation_log_user_recent_idx
  ON run_invite_creation_log (user_id, created_at DESC);

ALTER TABLE run_invite_creation_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE run_invite_creation_log FROM PUBLIC, anon, authenticated;

-- Invites per editor per rolling hour. A cohort is tens of learners, and an
-- editor creates them in one sitting after payments arrive (0107 Decision 2).
CREATE OR REPLACE FUNCTION run_invites_hourly_limit()
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 100 $$;

REVOKE ALL ON FUNCTION run_invites_hourly_limit() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION run_invites_enforce_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent INTEGER;
  v_limit  INTEGER := run_invites_hourly_limit();
BEGIN
  SELECT count(*) INTO v_recent
  FROM run_invite_creation_log
  WHERE user_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '1 hour';

  IF v_recent >= v_limit THEN
    RAISE EXCEPTION 'run invite rate limit reached (% per hour)', v_limit
      USING ERRCODE = 'PT429';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION run_invites_enforce_rate_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS run_invites_creation_rate_limit ON run_invite_creation_log;
CREATE TRIGGER run_invites_creation_rate_limit
  BEFORE INSERT ON run_invite_creation_log
  FOR EACH ROW
  EXECUTE FUNCTION run_invites_enforce_rate_limit();


-- ── 3. Helpers (no grants) ──────────────────────────────────────────────
-- The moment an invite stops being claimable: the earliest of its revoke,
-- its own expiry and its run's end.
CREATE OR REPLACE FUNCTION _run_invite_end(p_revoked_at TIMESTAMPTZ, p_expires_at TIMESTAMPTZ, p_run_ends_at TIMESTAMPTZ)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
AS $$ SELECT LEAST(COALESCE(p_revoked_at, 'infinity'::timestamptz), p_expires_at, p_run_ends_at) $$;

-- pending | claimed | expired | revoked. A claimed invite stays `claimed`
-- after its run ends; a revoked one is `revoked` whether or not it was
-- claimed first (the editor list shows claimed_at alongside).
CREATE OR REPLACE FUNCTION _run_invite_state(
  p_claimed_at TIMESTAMPTZ, p_revoked_at TIMESTAMPTZ, p_expires_at TIMESTAMPTZ, p_run_ends_at TIMESTAMPTZ, p_now TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_revoked_at IS NOT NULL THEN 'revoked'
    WHEN p_claimed_at IS NOT NULL THEN 'claimed'
    WHEN p_now >= LEAST(p_expires_at, p_run_ends_at) THEN 'expired'
    ELSE 'pending'
  END
$$;

-- A raw token's stored form. NULL for anything that is not 32 hex chars,
-- so a malformed link never reaches the index.
CREATE OR REPLACE FUNCTION _run_invite_token_hash(p_token TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_token ~ '^[0-9a-f]{32}$' THEN encode(extensions.digest(p_token, 'sha256'), 'hex')
  END
$$;

REVOKE ALL ON FUNCTION _run_invite_end(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _run_invite_state(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _run_invite_token_hash(TEXT) FROM PUBLIC, anon, authenticated;


-- ── 4. Editor functions ─────────────────────────────────────────────────
-- Every one returns { ok, error } and is gated on can_edit_course before
-- anything beyond "not found" is revealed (058's convention).
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

REVOKE ALL ON FUNCTION create_run_invite(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_run_invite(UUID, TEXT, TEXT, TEXT) TO authenticated;

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

REVOKE ALL ON FUNCTION revoke_run_invite(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION revoke_run_invite(UUID) TO authenticated;

-- Every invite of every run of a course, with its label, to an editor of
-- that course; zero rows to anyone else (course_calls' shape, 058).
CREATE OR REPLACE FUNCTION course_run_invites(p_course_id UUID)
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
  revoked_at      TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.run_id, i.tier, i.invitee_name, i.invitee_contact,
         _run_invite_state(i.claimed_at, i.revoked_at, i.expires_at, r.ends_at, now()),
         i.created_at, LEAST(i.expires_at, r.ends_at), i.claimed_at, i.revoked_at
  FROM run_invites i
  JOIN course_runs r ON r.id = i.run_id
  WHERE r.course_id = p_course_id
    AND can_edit_course(p_course_id, (SELECT auth.uid()))
  ORDER BY i.created_at DESC;
$$;

REVOKE ALL ON FUNCTION course_run_invites(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION course_run_invites(UUID) TO authenticated;


-- ── 5. The learner's side ───────────────────────────────────────────────
-- What the claim page shows for a token. Anyone holding the link may see
-- which course and run it is for; the label is never returned. For a
-- signed-in caller it also says whether the invite is theirs and whether
-- they are already in the run.
CREATE OR REPLACE FUNCTION run_invite_preview(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    UUID := (SELECT auth.uid());
  v_row   RECORD;
  v_state TEXT;
BEGIN
  SELECT i.run_id, i.tier, i.claimed_at, i.claimed_by, i.revoked_at, i.expires_at,
         r.title AS run_title, r.starts_at, r.ends_at, c.slug AS course_slug, c.title AS course_title
  INTO v_row
  FROM run_invites i
  JOIN course_runs r ON r.id = i.run_id
  JOIN courses c     ON c.id = r.course_id
  WHERE i.token_hash = _run_invite_token_hash(p_token);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'not_found');
  END IF;

  v_state := _run_invite_state(v_row.claimed_at, v_row.revoked_at, v_row.expires_at, v_row.ends_at, now());
  IF v_state = 'claimed' THEN
    v_state := CASE WHEN v_row.claimed_by = v_me THEN 'claimed_by_you' ELSE 'used' END;
  END IF;

  RETURN jsonb_build_object(
    'state',         v_state,
    'course_slug',   v_row.course_slug,
    'course_title',  v_row.course_title,
    'run_title',     v_row.run_title,
    'run_starts_at', v_row.starts_at,
    'tier',          v_row.tier,
    'already_enrolled', v_me IS NOT NULL AND EXISTS (
      SELECT 1 FROM run_enrolments
      WHERE run_id = v_row.run_id AND user_id = v_me AND revoked_at IS NULL
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION run_invite_preview(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION run_invite_preview(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION claim_run_invite(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        UUID := (SELECT auth.uid());
  v_invite    RECORD;
  v_enrolment UUID;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  -- Locks the invite: a second account claiming the same link waits here,
  -- then reads claimed_at and gets `used`.
  SELECT i.id, i.run_id, i.tier, i.claimed_at, i.claimed_by, i.revoked_at, i.expires_at,
         r.ends_at, c.slug AS course_slug
  INTO v_invite
  FROM run_invites i
  JOIN course_runs r ON r.id = i.run_id
  JOIN courses c     ON c.id = r.course_id
  WHERE i.token_hash = _run_invite_token_hash(p_token)
  FOR UPDATE OF i;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_invite.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'revoked');
  END IF;
  IF v_invite.claimed_at IS NOT NULL THEN
    IF v_invite.claimed_by = v_me THEN
      -- A reload or a double submit by the same learner: nothing to do.
      RETURN jsonb_build_object('ok', true, 'course_slug', v_invite.course_slug, 'already_claimed', true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'used');
  END IF;
  IF now() >= LEAST(v_invite.expires_at, v_invite.ends_at) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;
  IF EXISTS (
    SELECT 1 FROM run_enrolments
    WHERE run_id = v_invite.run_id AND user_id = v_me AND revoked_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_enrolled', 'course_slug', v_invite.course_slug);
  END IF;

  INSERT INTO run_enrolments (run_id, user_id, tier, source_ref)
  VALUES (v_invite.run_id, v_me, v_invite.tier, 'invite:' || v_invite.id)
  RETURNING id INTO v_enrolment;

  UPDATE run_invites
     SET claimed_at = now(), claimed_by = v_me, enrolment_id = v_enrolment
   WHERE id = v_invite.id;

  RETURN jsonb_build_object('ok', true, 'course_slug', v_invite.course_slug, 'already_claimed', false);
END;
$$;

REVOKE ALL ON FUNCTION claim_run_invite(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION claim_run_invite(TEXT) TO authenticated;

-- The caller's own claimed invites, label included, for the export
-- (privacy-policy.md §8: "an invite contact label is included once you
-- have claimed it").
CREATE OR REPLACE FUNCTION my_claimed_run_invites()
RETURNS TABLE (
  invite_id       UUID,
  run_id          UUID,
  enrolment_id    UUID,
  tier            TEXT,
  invitee_name    TEXT,
  invitee_contact TEXT,
  claimed_at      TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, run_id, enrolment_id, tier, invitee_name, invitee_contact, claimed_at, revoked_at
  FROM run_invites
  WHERE claimed_by = (SELECT auth.uid())
  ORDER BY claimed_at DESC;
$$;

REVOKE ALL ON FUNCTION my_claimed_run_invites() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_claimed_run_invites() TO authenticated;


-- ── 6. Purge of unclaimed labels ────────────────────────────────────────
CREATE OR REPLACE FUNCTION purge_unclaimed_run_invites()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM run_invites i
  USING course_runs r
  WHERE r.id = i.run_id
    AND i.claimed_at IS NULL
    AND _run_invite_end(i.revoked_at, i.expires_at, r.ends_at) <= now() - INTERVAL '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION purge_unclaimed_run_invites() FROM PUBLIC, anon, authenticated;

-- Daily. A label can therefore outlive its 30 days by up to a day.
SELECT cron.schedule(
  'purge-unclaimed-run-invites',
  '23 3 * * *',
  $$ select public.purge_unclaimed_run_invites(); $$
);


-- ── 7. delete_my_account (re-emitted from 058) ──────────────────────────
-- Re-emitted from 058 verbatim with one added DELETE: the invites the
-- caller claimed, which carry their contact label (privacy-policy.md §9).
CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       UUID := auth.uid();
  v_blocking JSONB;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name))
    INTO v_blocking
  FROM groups g
  WHERE g.owner_id = v_me
    AND EXISTS (
      SELECT 1 FROM group_members m
      WHERE m.group_id = g.id AND m.user_id <> v_me
    );

  IF v_blocking IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'owns_groups', 'groups', v_blocking);
  END IF;

  DELETE FROM groups g
  WHERE g.owner_id = v_me
    AND NOT EXISTS (
      SELECT 1 FROM group_members m
      WHERE m.group_id = g.id AND m.user_id <> v_me
    );

  DELETE FROM group_members WHERE user_id = v_me;

  DELETE FROM notifications            WHERE user_id = v_me;
  DELETE FROM notification_preferences WHERE user_id = v_me;
  DELETE FROM quiz_sessions            WHERE user_id = v_me;
  DELETE FROM lesson_attempts          WHERE user_id = v_me;
  DELETE FROM signup_acquisitions      WHERE user_id = v_me;
  DELETE FROM lesson_opens             WHERE user_id = v_me;
  DELETE FROM run_invites              WHERE claimed_by = v_me;
  DELETE FROM run_enrolments           WHERE user_id = v_me;
  DELETE FROM course_entitlements      WHERE user_id = v_me;

  UPDATE profiles
     SET full_name           = NULL,
         city                = NULL,
         display_name        = 'Deleted user',
         avatar_url          = NULL,
         leaderboard_opt_out = TRUE,
         deleted_at          = now()
   WHERE id = v_me;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION delete_my_account() FROM public, anon;
GRANT EXECUTE ON FUNCTION delete_my_account() TO authenticated;

COMMIT;
