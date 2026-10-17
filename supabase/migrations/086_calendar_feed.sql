-- ============================================================
-- 086_calendar_feed.sql
--
-- COH-016 (#219): a private .ics subscription feed, so a learner's or a
-- teacher's dates (COH-015's my_calendar) show in Google or Apple Calendar
-- (docs/decisions/0141 Decision 16; choices made while writing this file are
-- in docs/decisions/0160).
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 085_calendar_reader.sql
--   latest body of the account-delete RPC   -> 082_author_seats.sql, RE-EMITTED
--     here verbatim with one added DELETE (section 4)
-- REQUIRES 085 (my_calendar) and 082 (the delete_my_account body it extends).
--
-- ── 1. calendar_feed_tokens ─────────────────────────────────────────────
-- One row per user: the sha256 (hex) of the token, never the token. A user has
-- at most one token (PRIMARY KEY), so replacing it is an UPSERT and the old
-- address stops working in the same statement. RLS on, no policy, no grant:
-- every read and write is a SECURITY DEFINER function below. ON DELETE CASCADE
-- is belt and braces: an account is anonymised, not deleted (ADR 0002), so the
-- real removal is the DELETE in delete_my_account (section 4).
--
-- ── 2. The user's own functions ─────────────────────────────────────────
-- rotate_calendar_feed_token() creates or replaces the token and returns it
-- ONCE (it cannot be read back: only the hash is stored). The token is 64 hex
-- characters from two random UUIDs (about 244 bits).
-- revoke_calendar_feed_token() turns the feed off (privacy-policy.md: "turning
-- it off, or replacing the address, stops it"). calendar_feed_status() says
-- whether a token exists and when it was made, for the page and the export.
--
-- ── 3. calendar_feed(token) — the unauthenticated read ──────────────────
-- Granted to anon: the token IS the credential. It hashes the argument,
-- finds the user, and returns that user's rows from the SAME reader the pages
-- use (my_calendar, as a learner and as a teacher), by setting the transaction's
-- request.jwt.claims to that user for the duration of the call and restoring it.
-- Nothing about who sees what is restated. NULL for an unknown, replaced or
-- revoked token. It is VOLATILE (it sets a configuration value) and SECURITY
-- DEFINER. One user's token can only ever resolve to that user's own id.
--
-- ── 4. delete_my_account (re-emitted from 082) ──────────────────────────
-- One added DELETE of the caller's token.
--
-- Not destructive: one new table and functions, one function re-emitted; no
-- DROP, no TRUNCATE, no UPDATE or DELETE of an existing row.
-- Safe to re-apply: CREATE ... IF NOT EXISTS, CREATE OR REPLACE.
-- ============================================================

BEGIN;

-- ── 1. calendar_feed_tokens ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_feed_tokens (
  user_id    UUID        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE calendar_feed_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE calendar_feed_tokens FROM PUBLIC, anon, authenticated;


-- ── 2. The user's own functions ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION rotate_calendar_feed_token()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    UUID := (SELECT auth.uid());
  v_token TEXT;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO calendar_feed_tokens (user_id, token_hash, created_at)
  VALUES (v_me, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), now())
  ON CONFLICT (user_id) DO UPDATE
    SET token_hash = EXCLUDED.token_hash, created_at = EXCLUDED.created_at;
  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION rotate_calendar_feed_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rotate_calendar_feed_token() TO authenticated;


CREATE OR REPLACE FUNCTION revoke_calendar_feed_token()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := (SELECT auth.uid());
  v_n  INTEGER;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  DELETE FROM calendar_feed_tokens WHERE user_id = v_me;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;

REVOKE ALL ON FUNCTION revoke_calendar_feed_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION revoke_calendar_feed_token() TO authenticated;


CREATE OR REPLACE FUNCTION calendar_feed_status()
RETURNS TABLE (has_token BOOLEAN, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT TRUE, t.created_at FROM calendar_feed_tokens t WHERE t.user_id = (SELECT auth.uid());
$$;

REVOKE ALL ON FUNCTION calendar_feed_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION calendar_feed_status() TO authenticated;


-- ── 3. calendar_feed(token) ─────────────────────────────────────────────
-- Each row is my_calendar's, tagged with the role it was read as, so the two
-- audiences stay apart in the feed (an admin who is also enrolled would
-- otherwise get one UID twice).
CREATE OR REPLACE FUNCTION calendar_feed(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   UUID;
  v_prev   TEXT := current_setting('request.jwt.claims', true);
  v_result JSONB;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  SELECT t.user_id INTO v_user
  FROM calendar_feed_tokens t
  WHERE t.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  IF v_user IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  SELECT COALESCE(jsonb_agg(q.row_json ORDER BY q.ord), '[]'::jsonb) INTO v_result
  FROM (
    SELECT to_jsonb(c) || jsonb_build_object('role', 'learner') AS row_json, 1 AS ord
    FROM my_calendar('learner') c
    UNION ALL
    SELECT to_jsonb(c) || jsonb_build_object('role', 'teacher'), 2
    FROM my_calendar('teacher') c
  ) q;

  PERFORM set_config('request.jwt.claims', COALESCE(v_prev, ''), true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claims', COALESCE(v_prev, ''), true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION calendar_feed(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION calendar_feed(TEXT) TO anon, authenticated;


-- ── 4. delete_my_account, re-emitted from 082 with one added DELETE ─────
CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       UUID := auth.uid();
  v_blocking JSONB;
  v_voice    TEXT[];
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

  -- Every object under the caller's segment, sent or not.
  SELECT COALESCE(array_agg(o.name ORDER BY o.name), ARRAY[]::TEXT[])
    INTO v_voice
  FROM storage.objects o
  WHERE o.bucket_id = 'voice-recordings'
    AND (storage.foldername(o.name))[2] = v_me::text;
  INSERT INTO voice_object_deletions (object_name, reason)
  SELECT unnest(v_voice), 'account_deleted'
  ON CONFLICT (object_name) DO NOTHING;

  DELETE FROM voice_feedback f
  USING voice_submissions s
  WHERE s.id = f.submission_id AND s.user_id = v_me;
  DELETE FROM voice_submissions        WHERE user_id = v_me;
  DELETE FROM run_final_comments       WHERE user_id = v_me;

  DELETE FROM notifications            WHERE user_id = v_me;
  DELETE FROM notification_preferences WHERE user_id = v_me;
  DELETE FROM quiz_sessions            WHERE user_id = v_me;
  DELETE FROM lesson_attempts          WHERE user_id = v_me;
  DELETE FROM signup_acquisitions      WHERE user_id = v_me;
  DELETE FROM lesson_opens             WHERE user_id = v_me;
  DELETE FROM run_invites              WHERE claimed_by = v_me;
  DELETE FROM run_enrolments           WHERE user_id = v_me;
  DELETE FROM course_entitlements      WHERE user_id = v_me;
  -- TCH-001 (privacy-policy.md §9: "then deleted outright").
  DELETE FROM teacher_student_links    WHERE student_id = v_me OR teacher_id = v_me;
  DELETE FROM teacher_join_tokens      WHERE teacher_id = v_me;
  -- TCH-002: the caller's own groups (memberships cascade). Memberships of the
  -- caller as a student go with the link deletes above (trigger, section 3).
  DELETE FROM teacher_groups           WHERE teacher_id = v_me;
  -- TCH-004 (0144 Q4; privacy-policy.md §9): every conversation the caller is a
  -- party to, both sides. Messages (and anything a later card hangs off them)
  -- go with the conversation by ON DELETE CASCADE.
  DELETE FROM teacher_conversations    WHERE student_id = v_me OR teacher_id = v_me;
  -- TCH-005 (privacy-policy.md §9: "removed from the teacher's groups and homework"):
  -- the caller's own assignments (targets cascade) and, as a student, their direct
  -- targets. Group-derived homework ended with the 077 membership trigger.
  DELETE FROM homework_assignments     WHERE teacher_id = v_me;
  DELETE FROM homework_targets         WHERE student_id = v_me;
  -- TCH-007 (0154 Decision 8): the caller's seat, with its public name and the
  -- admin's notes. The profile row stays, so the cascade would not remove it.
  DELETE FROM author_seats             WHERE user_id = v_me;
  -- COH-016 (privacy-policy.md section 9: "delete your calendar feed token"). The profile
  -- row stays, so the ON DELETE CASCADE on the token table would never fire.
  DELETE FROM calendar_feed_tokens     WHERE user_id = v_me;

  UPDATE profiles
     SET full_name           = NULL,
         city                = NULL,
         display_name        = 'Deleted user',
         avatar_url          = NULL,
         leaderboard_opt_out = TRUE,
         deleted_at          = now()
   WHERE id = v_me;

  RETURN jsonb_build_object('ok', true, 'voice_objects', to_jsonb(v_voice));
END;
$$;

REVOKE ALL ON FUNCTION delete_my_account() FROM public, anon;
GRANT EXECUTE ON FUNCTION delete_my_account() TO authenticated;

COMMIT;
