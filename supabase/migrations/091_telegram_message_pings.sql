-- ============================================================
-- 091_telegram_message_pings.sql
--
-- TCH-012 (#226): a new message between a linked student and their teacher reaches
-- the other side through the Telegram bot, for anyone who linked it (090). This file
-- is the one decision SQL owns: whether THIS message earns a ping, and the sent log
-- that limits it (docs/decisions/0177; wording and sending are lib/telegram/pings.ts).
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time and again
-- before commit:
--   latest migration before this one        -> 090_telegram_reminders.sql
--   latest body of the account-delete RPC   -> 090_telegram_reminders.sql, NOT re-emitted:
--     the log below holds no user id, only the conversation, and delete_my_account (079)
--     already deletes every conversation the caller is a party to, so ON DELETE CASCADE
--     removes the log with it.
-- REQUIRES 079 (teacher_conversations, teacher_messages) and 090 (telegram_links).
--
-- ── 1. telegram_message_pings ───────────────────────────────────────────
-- One row per ping sent: the conversation, which side was pinged ('teacher' or
-- 'student') and when. No user id, no text, no chat id: the log is the throttle and
-- nothing else. RLS on, no policy, no grant (every access is the function below).
--
-- ── 2. telegram_message_ping_claim(message_id) ──────────────────────────
-- Called by the messages route AFTER send_teacher_message succeeded (service_role
-- only). From the message it finds the conversation and the OTHER party (the
-- recipient), then answers { claimed: false, reason } or { claimed: true, ... }:
--   not_linked  the recipient has no ACTIVE telegram_links row (090); nothing is
--               logged, so linking later does not count a ping that never went out
--   throttled   a ping to this side of this conversation was logged in the last hour
--               AND a message to them from before that ping is still unread, i.e.
--               they have not looked since. Reading the thread (read_at) ends the
--               throttle early: the next message pings again.
-- Otherwise it logs the ping and returns the recipient, the saved language and the
-- pair, so the caller can word the text and build the link. The check and the insert
-- are serialised per (conversation, side) by a transaction advisory lock, so two
-- messages posted together cannot both pass.
-- The ping is claimed BEFORE it is sent, so a send that fails still counts for the
-- hour (docs/decisions/0177 Decision 4).
--
-- Not destructive: one new table and one new function; no DROP, no TRUNCATE, no
-- UPDATE or DELETE of an existing row. Safe to re-apply: CREATE ... IF NOT EXISTS,
-- CREATE OR REPLACE.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS telegram_message_pings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES teacher_conversations(id) ON DELETE CASCADE,
  to_role         TEXT        NOT NULL CHECK (to_role IN ('teacher', 'student')),
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS telegram_message_pings_recent_idx
  ON telegram_message_pings (conversation_id, to_role, sent_at DESC);

ALTER TABLE telegram_message_pings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE telegram_message_pings FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION telegram_message_ping_claim(p_message_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv      UUID;
  v_author    UUID;
  v_teacher   UUID;
  v_student   UUID;
  v_to_role   TEXT;
  v_recipient UUID;
  v_lang      TEXT;
BEGIN
  SELECT m.conversation_id, m.author_id, c.teacher_id, c.student_id
    INTO v_conv, v_author, v_teacher, v_student
  FROM teacher_messages m
  JOIN teacher_conversations c ON c.id = m.conversation_id
  WHERE m.id = p_message_id;
  IF v_conv IS NULL THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'no_message');
  END IF;

  IF v_author = v_teacher THEN
    v_to_role := 'student';
    v_recipient := v_student;
  ELSE
    v_to_role := 'teacher';
    v_recipient := v_teacher;
  END IF;

  SELECT l.lang INTO v_lang
  FROM telegram_links l
  WHERE l.user_id = v_recipient AND l.stopped_at IS NULL;
  IF v_lang IS NULL THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'not_linked');
  END IF;

  -- Two messages posted together must not both pass the check below.
  PERFORM pg_advisory_xact_lock(hashtextextended('telegram_message_ping:' || v_conv::text || ':' || v_to_role, 0));

  IF EXISTS (
    SELECT 1
    FROM telegram_message_pings p
    WHERE p.conversation_id = v_conv
      AND p.to_role = v_to_role
      AND p.sent_at > clock_timestamp() - interval '1 hour'
      -- "while unread": something to the recipient from before that ping is still unread.
      AND EXISTS (
        SELECT 1 FROM teacher_messages u
        WHERE u.conversation_id = v_conv
          AND u.author_id <> v_recipient
          AND u.read_at IS NULL
          AND u.created_at <= p.sent_at
      )
  ) THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'throttled');
  END IF;

  INSERT INTO telegram_message_pings (conversation_id, to_role) VALUES (v_conv, v_to_role);

  RETURN jsonb_build_object(
    'claimed', true,
    'recipient_id', v_recipient,
    'to_role', v_to_role,
    'lang', v_lang,
    'teacher_id', v_teacher,
    'student_id', v_student
  );
END;
$$;

REVOKE ALL ON FUNCTION telegram_message_ping_claim(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION telegram_message_ping_claim(UUID) TO service_role;

COMMIT;
