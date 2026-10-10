-- ============================================================
-- 056_lesson_opens.sql
--
-- PROG-001: which lessons a signed-in learner has opened, and when — the
-- per-learner input the learners page (AUTH-011) reads. Choices made while
-- writing it are recorded in docs/decisions/0101.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 055_lesson_access_levels.sql
--   latest body of the account-delete RPC   -> 053_signup_acquisition.sql
-- (the exact commands are in the section header; they are not quoted here
-- because quoting the second one's pattern would make this file match it).
--
-- Adds:
--   • lesson_opens — one row per (user, lesson): first_opened_at is set once,
--     last_opened_at moves on every open. Owner-read RLS + GRANT SELECT to
--     authenticated (the export route reads it with the caller's session,
--     the lesson_attempts precedent, 048); no write grant to anyone. Who
--     else may read it (the course author, AUTH-011) is AUTH-011's call, not
--     this migration's.
--   • record_lesson_open(p_lesson_version_id) — the ONLY writer. SECURITY
--     DEFINER, uses auth.uid(), so an anonymous caller records nothing (and
--     anon has no EXECUTE either). The version is resolved to its lesson
--     here and gated on can_read_lesson(), so a direct PostgREST caller can
--     only record lessons they could actually open.
--   • delete_my_account() re-emitted from 053 with one added DELETE.
--
-- Kept apart from funnel_events (051), which stay anonymous by design
-- (docs/decisions/0069): this table is per-user, that one never is.
--
-- No backfill: nothing recorded lesson opens before this migration.
--
-- Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================

BEGIN;

-- ── lesson_opens ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lesson_opens (
  user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lesson_id       UUID        NOT NULL REFERENCES lessons(id)  ON DELETE CASCADE,
  first_opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_opened_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, lesson_id),
  CHECK (last_opened_at >= first_opened_at)
);

-- The PK leads with user_id (the owner read and the export); AUTH-011 reads
-- by lesson, across learners.
CREATE INDEX IF NOT EXISTS lesson_opens_lesson_idx
  ON lesson_opens (lesson_id);

ALTER TABLE lesson_opens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE lesson_opens FROM anon, authenticated;
GRANT SELECT ON TABLE lesson_opens TO authenticated;

DROP POLICY IF EXISTS "lesson_opens: owner read" ON lesson_opens;
CREATE POLICY "lesson_opens: owner read"
  ON lesson_opens FOR SELECT
  USING (user_id = (SELECT auth.uid()));


-- ── record_lesson_open: the only writer ─────────────────────────────────
-- Returns { ok, ... } rather than raising: the player fires this and
-- forgets it (LessonPlayer's lesson_start effect), so a refusal is logged
-- at most, never shown to the learner.
CREATE OR REPLACE FUNCTION record_lesson_open(p_lesson_version_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        UUID := auth.uid();
  v_lesson_id UUID;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT lesson_id INTO v_lesson_id
  FROM lesson_versions WHERE id = p_lesson_version_id;

  IF v_lesson_id IS NULL OR NOT can_read_lesson(v_lesson_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_readable');
  END IF;

  INSERT INTO lesson_opens (user_id, lesson_id)
  VALUES (v_me, v_lesson_id)
  ON CONFLICT (user_id, lesson_id)
    DO UPDATE SET last_opened_at = NOW();

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION record_lesson_open(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION record_lesson_open(UUID) TO authenticated;


-- ── delete_my_account: purge lesson_opens too ───────────────────────────
-- Re-emitted from 053 verbatim with one added DELETE. The FK cascades on a
-- real profile delete, but delete_my_account() anonymises the profile row
-- instead of deleting it (docs/adr/0002), so the row needs an explicit
-- purge — the lesson_attempts precedent (048, 0064 Decision 3). The privacy
-- policy (§9, 1.2) already says lesson opens are erased outright.
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
