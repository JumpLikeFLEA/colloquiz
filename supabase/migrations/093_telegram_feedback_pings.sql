-- ============================================================
-- 093_telegram_feedback_pings.sql
--
-- COH-011 (#202): publishing voice feedback (060) or a final comment (061) tells a
-- learner who linked the Telegram bot (090) that it is ready (docs/decisions/0140
-- events 2 and 3; choices made while writing this file are in docs/decisions/0180).
-- This file is the one decision SQL owns: whether THIS publication earns a message,
-- and the log that keeps a republish or an edit from sending a second one. Wording
-- and sending are lib/telegram/feedbackPings.ts.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time and again
-- before commit:
--   latest migration before this one        -> 092_message_no_reply_needed.sql
--   latest body of the account-delete RPC   -> 090_telegram_reminders.sql, NOT re-emitted:
--     both logs below hold no user id, only the feedback row or the comment they are
--     about, with ON DELETE CASCADE; delete_my_account (090) already deletes the
--     learner's voice_submissions (voice_feedback cascades) and run_final_comments, so the
--     logs go with them.
-- save_voice_feedback (060) and save_final_comment (061) are NOT re-emitted: the route
-- calls the claim below after they return ok, so their bodies, their authorisation and the
-- Studio freeze (083, which leaves feedback open) are untouched.
-- REQUIRES 060 (voice_feedback), 061 (run_final_comments) and 090 (telegram_links).
--
-- ── 1. The logs ─────────────────────────────────────────────────────────
-- telegram_voice_feedback_pings (key: the submission) and telegram_final_comment_pings
-- (key: the enrolment). A row means "this publication was handled": a message was
-- claimed for sending (sent = true), or the learner had no ACTIVE link when it was
-- published (sent = false). Logging the second case too is deliberate: an edit of old
-- feedback must never message a learner who linked the bot afterwards. No user id, no
-- text, no chat id. RLS on, no policy, no grant: every access is the function below.
--
-- ── 2. telegram_feedback_ping_claim(kind, id) ───────────────────────────
-- service_role only. kind 'voice' (id = voice_feedback.submission_id) or 'final' (id =
-- run_final_comments.enrolment_id). Answers { claimed: false, reason } or
-- { claimed: true, recipient_id, lang, ... } with the titles and slugs the text needs:
--   no_target       unknown kind, or no such feedback / comment
--   not_published   a draft: nothing to announce
--   already_handled a log row exists (a republish, an edit, or a second concurrent call;
--                   the primary key lets exactly one insert win)
--   not_linked      the learner has no ACTIVE telegram_links row; handled, and logged
--                   with sent = false
-- The row is claimed BEFORE it is sent, so a send that fails is not retried (the same
-- trade as docs/decisions/0177 Decision 4); the page shows the feedback regardless.
--
-- Not destructive: two new tables and one new function; no DROP, no TRUNCATE, no UPDATE
-- or DELETE of an existing row. Safe to re-apply: CREATE ... IF NOT EXISTS, CREATE OR
-- REPLACE.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS telegram_voice_feedback_pings (
  submission_id UUID        PRIMARY KEY REFERENCES voice_feedback(submission_id) ON DELETE CASCADE,
  handled_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  sent          BOOLEAN     NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_final_comment_pings (
  enrolment_id UUID        PRIMARY KEY REFERENCES run_final_comments(enrolment_id) ON DELETE CASCADE,
  handled_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  sent         BOOLEAN     NOT NULL
);

ALTER TABLE telegram_voice_feedback_pings ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_final_comment_pings  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE telegram_voice_feedback_pings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE telegram_final_comment_pings  FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION telegram_feedback_ping_claim(p_kind TEXT, p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user         UUID;
  v_published    TIMESTAMPTZ;
  v_course_slug  TEXT;
  v_course_title TEXT;
  v_lesson_slug  TEXT;
  v_lesson_title TEXT;
  v_run          UUID;
  v_lang         TEXT;
  v_n            INTEGER;
BEGIN
  IF p_kind = 'voice' THEN
    SELECT s.user_id, f.published_at, c.slug, c.title, l.slug, l.title
      INTO v_user, v_published, v_course_slug, v_course_title, v_lesson_slug, v_lesson_title
    FROM voice_feedback f
    JOIN voice_submissions s ON s.id = f.submission_id
    JOIN courses c ON c.id = s.course_id
    JOIN lessons l ON l.id = s.lesson_id
    WHERE f.submission_id = p_id;
  ELSIF p_kind = 'final' THEN
    SELECT fc.user_id, fc.published_at, c.title, fc.run_id
      INTO v_user, v_published, v_course_title, v_run
    FROM run_final_comments fc
    JOIN courses c ON c.id = fc.course_id
    WHERE fc.enrolment_id = p_id;
  ELSE
    RETURN jsonb_build_object('claimed', false, 'reason', 'no_target');
  END IF;

  IF v_user IS NULL THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'no_target');
  END IF;
  IF v_published IS NULL THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'not_published');
  END IF;

  SELECT l.lang INTO v_lang
  FROM telegram_links l
  WHERE l.user_id = v_user AND l.stopped_at IS NULL;

  -- The insert is the decision: the first call for this feedback wins, every later one
  -- (a republish, an edit, a concurrent call) finds the row and sends nothing.
  IF p_kind = 'voice' THEN
    INSERT INTO telegram_voice_feedback_pings (submission_id, sent)
    VALUES (p_id, v_lang IS NOT NULL)
    ON CONFLICT (submission_id) DO NOTHING;
  ELSE
    INSERT INTO telegram_final_comment_pings (enrolment_id, sent)
    VALUES (p_id, v_lang IS NOT NULL)
    ON CONFLICT (enrolment_id) DO NOTHING;
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'already_handled');
  END IF;

  IF v_lang IS NULL THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'not_linked');
  END IF;

  RETURN jsonb_build_object(
    'claimed', true,
    'kind', p_kind,
    'recipient_id', v_user,
    'lang', v_lang,
    'course_slug', v_course_slug,
    'course_title', v_course_title,
    'lesson_slug', v_lesson_slug,
    'lesson_title', v_lesson_title,
    'run_id', v_run
  );
END;
$$;

REVOKE ALL ON FUNCTION telegram_feedback_ping_claim(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION telegram_feedback_ping_claim(TEXT, UUID) TO service_role;

COMMIT;
