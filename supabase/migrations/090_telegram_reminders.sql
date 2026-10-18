-- ============================================================
-- 090_telegram_reminders.sql
--
-- COH-010 (#201): a learner links @Alliengll_bot once, through a /start deep
-- link, and every reminder card sends through that link (docs/decisions/0140;
-- choices made while writing this file are in docs/decisions/0173).
-- Sign-in gives the bot nothing it can message (docs/decisions/0098), so the
-- chat id comes from the Telegram update a /start <token> sends to the webhook.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 089_course_author_name.sql
--   latest body of the account-delete RPC   -> 086_calendar_feed.sql, RE-EMITTED
--     here verbatim with two added DELETEs (section 4)
-- REQUIRES 086 (the delete_my_account body it extends) and profiles.
--
-- ── 1. telegram_links ───────────────────────────────────────────────────
-- One row per user: the Telegram chat id, the language and time zone saved when
-- the learner linked, linked_at, and stopped_at (NULL while reminders are on).
-- Turning off, /stop and a 403 from sendMessage all set stopped_at; linking again
-- clears it. A chat belongs to at most one ACTIVE link (partial unique index):
-- linking a chat to a second account stops the first account's link (section 3b),
-- so a reminder never reaches a chat through two accounts. RLS on, no policy, no
-- grant: every read and write is a SECURITY DEFINER function below.
--
-- ── 2. telegram_link_tokens ─────────────────────────────────────────────
-- The deep-link token, stored as its sha256 (hex), single-use (used_at) and
-- valid for one hour (expires_at). A user has at most one token at a time:
-- creating one deletes the user's earlier ones. Same closed-table shape.
--
-- ── 3. The functions ────────────────────────────────────────────────────
-- Signed-in user (authenticated): create_telegram_link_token(lang, time_zone)
-- returns the token ONCE; my_telegram_link() reads the caller's own row (page
-- and export); stop_my_telegram_link() is "Turn off".
-- Webhook and sender (service_role only; the webhook route authenticates the
-- request by Telegram's secret header, then calls these with the service-role
-- client): telegram_link_claim(token, chat_id), telegram_link_stop(chat_id) and
-- telegram_link_for(user_id).
-- create_telegram_link_token is NOT gated on an enrolment: the Studio ping
-- cards (TCH-012) reuse this table for teachers. The UI offers it to enrolees.
--
-- ── 4. delete_my_account (re-emitted from 086) ──────────────────────────
-- Two added DELETEs: the caller's link and tokens.
--
-- Not destructive: two new tables and functions, one function re-emitted; no
-- DROP, no TRUNCATE, no UPDATE or DELETE of an existing row.
-- Safe to re-apply: CREATE ... IF NOT EXISTS, CREATE OR REPLACE.
-- ============================================================

BEGIN;

-- ── 1. telegram_links ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_links (
  user_id    UUID        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  chat_id    BIGINT      NOT NULL,
  lang       TEXT        NOT NULL CHECK (lang IN ('ru', 'en')),
  time_zone  TEXT        CHECK (time_zone IS NULL OR char_length(time_zone) <= 64),
  linked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  stopped_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_links_active_chat_idx
  ON telegram_links (chat_id) WHERE stopped_at IS NULL;

ALTER TABLE telegram_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE telegram_links FROM PUBLIC, anon, authenticated;


-- ── 2. telegram_link_tokens ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  token_hash TEXT        PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lang       TEXT        NOT NULL CHECK (lang IN ('ru', 'en')),
  time_zone  TEXT        CHECK (time_zone IS NULL OR char_length(time_zone) <= 64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS telegram_link_tokens_user_idx ON telegram_link_tokens (user_id);

ALTER TABLE telegram_link_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE telegram_link_tokens FROM PUBLIC, anon, authenticated;


-- ── 3a. The signed-in user's functions ──────────────────────────────────
CREATE OR REPLACE FUNCTION create_telegram_link_token(p_lang TEXT, p_time_zone TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    UUID := (SELECT auth.uid());
  v_tz    TEXT;
  v_token TEXT;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_lang IS NULL OR p_lang NOT IN ('ru', 'en') THEN
    RAISE EXCEPTION 'invalid_lang' USING ERRCODE = '22023';
  END IF;

  -- Only a real IANA zone is kept; anything else is stored as unknown (NULL).
  SELECT n.name INTO v_tz FROM pg_catalog.pg_timezone_names n WHERE n.name = p_time_zone;

  -- One outstanding token per user; stale ones from anyone go too.
  DELETE FROM telegram_link_tokens WHERE user_id = v_me OR expires_at < now() - interval '1 day';

  -- 64 hex characters from two random UUIDs; /start allows A-Z a-z 0-9 _ - up to 64.
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO telegram_link_tokens (token_hash, user_id, lang, time_zone, expires_at)
  VALUES (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_me, p_lang, v_tz, now() + interval '1 hour');
  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION create_telegram_link_token(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_telegram_link_token(TEXT, TEXT) TO authenticated;


CREATE OR REPLACE FUNCTION my_telegram_link()
RETURNS TABLE (chat_id BIGINT, lang TEXT, time_zone TEXT, linked_at TIMESTAMPTZ, stopped_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.chat_id, l.lang, l.time_zone, l.linked_at, l.stopped_at
  FROM telegram_links l
  WHERE l.user_id = (SELECT auth.uid());
$$;

REVOKE ALL ON FUNCTION my_telegram_link() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_telegram_link() TO authenticated;


CREATE OR REPLACE FUNCTION stop_my_telegram_link()
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
  UPDATE telegram_links SET stopped_at = now() WHERE user_id = v_me AND stopped_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  -- A link made but not yet used by pressing Start should not work after "Turn off".
  DELETE FROM telegram_link_tokens WHERE user_id = v_me;
  RETURN v_n > 0;
END;
$$;

REVOKE ALL ON FUNCTION stop_my_telegram_link() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION stop_my_telegram_link() TO authenticated;


-- ── 3b. The webhook's and the sender's functions (service_role only) ────
CREATE OR REPLACE FUNCTION telegram_link_claim(p_token TEXT, p_chat_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT;
  v_user UUID;
  v_lang TEXT;
  v_tz   TEXT;
BEGIN
  IF p_chat_id IS NULL OR p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_token');
  END IF;
  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');

  -- Single use and one hour, decided by this one statement.
  UPDATE telegram_link_tokens
     SET used_at = now()
   WHERE token_hash = v_hash AND used_at IS NULL AND expires_at > now()
  RETURNING user_id, lang, time_zone INTO v_user, v_lang, v_tz;
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_token');
  END IF;

  -- A chat has one active link: another account's link to this chat stops.
  UPDATE telegram_links SET stopped_at = now()
   WHERE chat_id = p_chat_id AND stopped_at IS NULL AND user_id <> v_user;

  INSERT INTO telegram_links (user_id, chat_id, lang, time_zone, linked_at, stopped_at)
  VALUES (v_user, p_chat_id, v_lang, v_tz, now(), NULL)
  ON CONFLICT (user_id) DO UPDATE
    SET chat_id = EXCLUDED.chat_id, lang = EXCLUDED.lang, time_zone = EXCLUDED.time_zone,
        linked_at = EXCLUDED.linked_at, stopped_at = NULL;

  RETURN jsonb_build_object('ok', true, 'lang', v_lang);
END;
$$;

REVOKE ALL ON FUNCTION telegram_link_claim(TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION telegram_link_claim(TEXT, BIGINT) TO service_role;


-- /stop and a 403 from sendMessage. Returns the language of the link that was
-- stopped (NULL when this chat had no active link) so the bot can answer in it.
CREATE OR REPLACE FUNCTION telegram_link_stop(p_chat_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lang TEXT;
BEGIN
  UPDATE telegram_links SET stopped_at = now()
   WHERE chat_id = p_chat_id AND stopped_at IS NULL
  RETURNING lang INTO v_lang;
  RETURN v_lang;
END;
$$;

REVOKE ALL ON FUNCTION telegram_link_stop(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION telegram_link_stop(BIGINT) TO service_role;


-- The sender's lookup: the ACTIVE link for a user, or no row.
CREATE OR REPLACE FUNCTION telegram_link_for(p_user_id UUID)
RETURNS TABLE (chat_id BIGINT, lang TEXT, time_zone TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.chat_id, l.lang, l.time_zone
  FROM telegram_links l
  WHERE l.user_id = p_user_id AND l.stopped_at IS NULL;
$$;

REVOKE ALL ON FUNCTION telegram_link_for(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION telegram_link_for(UUID) TO service_role;


-- ── 4. delete_my_account, re-emitted from 086 with two added DELETEs ────
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
  -- COH-010 (privacy-policy.md section 9: "your Telegram chat id"). The profile row
  -- stays, so the ON DELETE CASCADE on these tables would never fire.
  DELETE FROM telegram_link_tokens     WHERE user_id = v_me;
  DELETE FROM telegram_links           WHERE user_id = v_me;

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
