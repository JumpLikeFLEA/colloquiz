-- ============================================================
-- 048_lesson_attempts.sql
--
-- ANON-003: the server-side attempt record ANON-002's local store (0063) and
-- the claim mechanism (0048) both upload into. Full design in
-- docs/decisions/0048-anon001-claim-token.md; this migration only implements
-- what that decision left to ANON-003 (the table + the record RPC).
--
-- Adds:
--   • lesson_attempts — one row per (attempt_id, user, lesson_version, block).
--     attempt_id (a client-generated UUID, 0048 Decision 3) IS the primary
--     key, not a separate uniqueness constraint, so ON CONFLICT (id) DO
--     NOTHING is the idempotency mechanism: a retried upload of an
--     already-recorded attempt is a no-op, never a second row or an error.
--   • record_lesson_attempts(p_attempts JSONB) — the ONLY writer. SECURITY
--     DEFINER, batched (0063 Decision 2's exact name/shape — ANON-002 is
--     already committed to this contract in lib/lessonPlayer/attemptStore.ts).
--     Checks can_read_lesson() per element and caps earned at possible.
--     Called both from ANON-002's default (already-authenticated) path and,
--     later, from ANON-006's claim callback — 0048 designs that callback to
--     run with a real authenticated session by the time it calls this RPC,
--     so no anon-specific branch exists here; pending_claims (ANON-006) never
--     writes this table directly (0048 Decision 2).
--
-- Account export/deletion (ANON-003 acceptance line 4):
--   • lesson_attempts gets an owner-read RLS policy + GRANT SELECT to
--     authenticated, same shape as `results`, so the export route's own
--     session can read it directly — no RPC needed for reads.
--   • delete_my_account() (037) gains an explicit DELETE FROM lesson_attempts.
--     Hard delete, not anonymisation: unlike `results`, nothing else in the
--     app reads another user's lesson_attempts (no leaderboard, no shared
--     group history), so there is no reason to keep the row unattributable
--     the way results are kept.
--
-- Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================

BEGIN;

-- ── lesson_attempts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lesson_attempts (
  id                UUID        PRIMARY KEY,
  user_id           UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lesson_version_id UUID        NOT NULL REFERENCES lesson_versions(id) ON DELETE CASCADE,
  block_id          TEXT        NOT NULL,
  earned            NUMERIC     NOT NULL CHECK (earned >= 0),
  possible          NUMERIC     NOT NULL CHECK (possible > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (earned <= possible)
);

CREATE INDEX IF NOT EXISTS lesson_attempts_user_block_idx
  ON lesson_attempts (user_id, lesson_version_id, block_id);

ALTER TABLE lesson_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE lesson_attempts FROM anon, authenticated;
GRANT SELECT ON TABLE lesson_attempts TO authenticated;

DROP POLICY IF EXISTS "lesson_attempts: owner read" ON lesson_attempts;
CREATE POLICY "lesson_attempts: owner read"
  ON lesson_attempts FOR SELECT
  USING (user_id = (SELECT auth.uid()));


-- ── record_lesson_attempts: the only writer ─────────────────────────────
-- Malformed or not-yet-entitled elements are silently dropped rather than
-- failing the whole batch: a batch is "empty the local store in one round
-- trip" (0063), and one bad element (a lesson the account isn't entitled to,
-- a payload shape a future client version changed) should not block every
-- other attempt in the same upload from landing.
CREATE OR REPLACE FUNCTION record_lesson_attempts(p_attempts JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me                 UUID := auth.uid();
  v_item                JSONB;
  v_attempt_id           UUID;
  v_lesson_version_id    UUID;
  v_block_id             TEXT;
  v_earned               NUMERIC;
  v_possible             NUMERIC;
  v_lesson_id            UUID;
  v_inserted             INT := 0;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  IF p_attempts IS NULL OR jsonb_typeof(p_attempts) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_attempts)
  LOOP
    BEGIN
      v_attempt_id        := NULLIF(v_item->>'attempt_id', '')::UUID;
      v_lesson_version_id := NULLIF(v_item->>'lesson_version_id', '')::UUID;
      v_block_id          := v_item->>'block_id';
      v_earned            := (v_item->>'earned')::NUMERIC;
      v_possible          := (v_item->>'possible')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      -- A UUID or numeric that fails to parse is a malformed element, not a
      -- reason to abort the whole batch.
      CONTINUE;
    END;

    IF v_attempt_id IS NULL OR v_lesson_version_id IS NULL OR v_block_id IS NULL
       OR v_earned IS NULL OR v_possible IS NULL
       OR v_earned < 0 OR v_possible <= 0 THEN
      CONTINUE;
    END IF;

    SELECT lesson_id INTO v_lesson_id
    FROM lesson_versions WHERE id = v_lesson_version_id;

    IF v_lesson_id IS NULL OR NOT can_read_lesson(v_lesson_id) THEN
      CONTINUE;
    END IF;

    INSERT INTO lesson_attempts (id, user_id, lesson_version_id, block_id, earned, possible)
    VALUES (v_attempt_id, v_me, v_lesson_version_id, v_block_id, LEAST(v_earned, v_possible), v_possible)
    ON CONFLICT (id) DO NOTHING;

    IF FOUND THEN
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted);
END;
$$;

REVOKE ALL ON FUNCTION record_lesson_attempts(JSONB) FROM public, anon;
GRANT EXECUTE ON FUNCTION record_lesson_attempts(JSONB) TO authenticated;


-- ── delete_my_account: purge lesson_attempts too ────────────────────────
-- Re-emitted from 037 verbatim with one added DELETE alongside the other
-- transient-data purges (notifications, notification_preferences,
-- quiz_sessions) — same reasoning: these FKs would cascade on a real profile
-- delete, but delete_my_account() anonymises the profile row instead of
-- deleting it, so transient per-user data needs an explicit purge.
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
