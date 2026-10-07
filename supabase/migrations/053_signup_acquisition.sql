-- ============================================================
-- 053_signup_acquisition.sql
--
-- ANON-009: which free course and which arrival channel a learner signed up
-- from, recorded once per account at the signup moment. Design in
-- docs/decisions/0081-anon009-signup-acquisition.md.
--
-- Why a table and not columns on profiles: profiles rows are readable by
-- people other than their owner — tutors ("profiles: linked read", 006),
-- group co-members ("profiles: group co-member read", 014) and admins (027).
-- A column there would show a learner's acquisition channel to their group.
-- funnel_events (051) can't carry it either: it has no user id by design.
--
-- Adds:
--   • signup_acquisitions — one row per account, user_id is the primary key.
--     Owner-read RLS; no write grant to anyone. source is NOT NULL: a signup
--     with no source (GPC/DNT opt-out, or a path that doesn't thread one)
--     writes no row at all (0069: an opted-out visitor leaves no trace).
--   • record_signup_acquisition(p_source, p_course_slug) — the ONLY writer.
--     SECURITY DEFINER, uses auth.uid(), write-once (ON CONFLICT DO NOTHING).
--     The course comes from a slug the server parsed out of the signup's
--     `next` path (lib/acquisition.ts), resolved here against PUBLISHED
--     courses only; never a client-supplied id. Refuses accounts older than
--     24 hours (0081 Decision 3), so an existing account calling it directly
--     through PostgREST can't attribute itself after the fact.
--   • delete_my_account() re-emitted from 048 with one added DELETE.
--
-- No backfill: accounts created before this migration have no row.
--
-- Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================

BEGIN;

-- ── signup_acquisitions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS signup_acquisitions (
  user_id    UUID        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  course_id  UUID        REFERENCES courses(id) ON DELETE SET NULL,
  source     TEXT        NOT NULL CHECK (source IN ('instagram', 'telegram', 'direct')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS signup_acquisitions_course_idx
  ON signup_acquisitions (course_id);

ALTER TABLE signup_acquisitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE signup_acquisitions FROM anon, authenticated;
GRANT SELECT ON TABLE signup_acquisitions TO authenticated;

DROP POLICY IF EXISTS "signup_acquisitions: owner read" ON signup_acquisitions;
CREATE POLICY "signup_acquisitions: owner read"
  ON signup_acquisitions FOR SELECT
  USING (user_id = (SELECT auth.uid()));


-- ── record_signup_acquisition: the only writer ──────────────────────────
-- Returns { ok, recorded } rather than raising, so the auth routes can log
-- a refusal without it ever reaching the learner (they swallow errors and
-- never change the redirect).
CREATE OR REPLACE FUNCTION record_signup_acquisition(p_source TEXT, p_course_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me         UUID := auth.uid();
  v_created_at TIMESTAMPTZ;
  v_course_id  UUID;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  IF p_source IS NULL OR p_source NOT IN ('instagram', 'telegram', 'direct') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_source');
  END IF;

  SELECT created_at INTO v_created_at FROM auth.users WHERE id = v_me;
  IF v_created_at IS NULL OR v_created_at < NOW() - INTERVAL '24 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_new_account');
  END IF;

  IF p_course_slug IS NOT NULL THEN
    SELECT id INTO v_course_id
    FROM courses
    WHERE slug = p_course_slug AND status = 'published';
  END IF;

  INSERT INTO signup_acquisitions (user_id, course_id, source)
  VALUES (v_me, v_course_id, p_source)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'recorded', FOUND);
END;
$$;

REVOKE ALL ON FUNCTION record_signup_acquisition(TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION record_signup_acquisition(TEXT, TEXT) TO authenticated;


-- ── delete_my_account: purge signup_acquisitions too ────────────────────
-- Re-emitted from 048 verbatim with one added DELETE. The FK cascades on a
-- real profile delete, but delete_my_account() anonymises the profile row
-- instead of deleting it (docs/adr/0002), so the row needs an explicit
-- purge — the lesson_attempts precedent (048, 0064 Decision 3).
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
