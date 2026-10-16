-- ============================================================
-- 079_teacher_messages.sql
--
-- TCH-004 (#214): one conversation per linked (teacher, student) pair
-- (docs/decisions/0141 Decisions 8, 9 and 17; choices made while writing
-- this file are in docs/decisions/0151). In-app only, no realtime: a page
-- load shows new messages. Telegram pings are TCH-012.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 078_linked_student_answers.sql
--   latest body of the account-delete RPC   -> 077_teacher_groups.sql
-- Re-emitted: delete_my_account (077, one added DELETE, section 7). Nothing
-- else is re-emitted. REQUIRES 060 (_feedback_content_valid), 073
-- (learner_contact_label) and 076 (_teacher_linked, _is_teacher).
--
-- ── 1. teacher_conversations ────────────────────────────────────────────
-- One row per (teacher, student) pair, ever: relinking after a link ended
-- reopens the same conversation (0151 Decision 2). It is created by the
-- first message, never on its own, so a conversation always has a message.
-- "Closed" is not stored: it is "no active link" and is derived at read time
-- from _teacher_linked(), the one gate (0148 Decision 6). No grants, no
-- policy: every read and write is a SECURITY DEFINER function below.
--
-- ── 2. teacher_messages ─────────────────────────────────────────────────
-- body is the FeedbackContent shape (0096): paragraphs of runs, a run
-- optionally bold, validated by _message_body_valid (060's validator plus a
-- 2,000-character cap, 0151 Decision 4). read_at is set when the OTHER party
-- reads the message. ON DELETE CASCADE from the conversation, so anything a
-- later card hangs off a message (TCH-006's snapshots) is deleted with it.
--
-- ── 3. Rate limit ───────────────────────────────────────────────────────
-- 30 messages per author per rolling hour, counted by a BEFORE INSERT
-- trigger on teacher_messages itself (the 026 / 038 shape): the cap holds on
-- every insert path. PT429, matched on the code by the route, never the
-- message.
--
-- ── 4. send_teacher_message ─────────────────────────────────────────────
-- (teacher, student, body). The caller must be one of the two, the link must
-- be active and the teacher must still be a teacher (_is_teacher). A third
-- user gets 'forbidden'; an unlinked pair with no conversation gets
-- 'not_linked'; an ended link with a conversation gets 'closed'. The teacher
-- may write first (0141 Decision 8).
--
-- ── 5. Reads ────────────────────────────────────────────────────────────
-- message_threads(p_as)             the caller's threads as 'student' or
--                                   'teacher': conversations, plus linked
--                                   peers with no conversation yet.
-- conversation_messages(t, s)       the messages, oldest first (latest 200),
--                                   participants only.
--                                   read_at is returned only on the OTHER
--                                   party's messages: a sender never learns
--                                   when the reader read theirs (0151
--                                   Decision 5).
-- mark_conversation_read(t, s)      marks the OTHER party's messages read.
-- my_unread_message_count()         unread teacher replies, as a student.
-- my_conversations_export()         the caller as STUDENT, for the export.
-- "Unanswered" is decided here, in message_threads: the last message is
-- from the student and the link is active (0141 Decision 8).
--
-- ── 6. Participants only ────────────────────────────────────────────────
-- Every read scopes by auth.uid() being the conversation's teacher or
-- student. A third user, or anon, gets zero rows / zero.
--
-- ── 7. Deletion ─────────────────────────────────────────────────────────
-- delete_my_account re-emitted from 077 with one added DELETE: every
-- conversation the caller is a party to, both sides (0144 Q4; privacy-policy
-- §9 "Messages ... deleted outright"). Messages cascade.
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the owner, never by a session.
--
-- Safe to re-apply: CREATE ... IF NOT EXISTS, every function CREATE OR
-- REPLACE, DROP TRIGGER IF EXISTS.
-- ============================================================

BEGIN;

-- ── 1. teacher_conversations ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_conversations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT teacher_conversations_not_self CHECK (teacher_id <> student_id),
  CONSTRAINT teacher_conversations_pair_key UNIQUE (teacher_id, student_id)
);
CREATE INDEX IF NOT EXISTS teacher_conversations_student_idx
  ON teacher_conversations (student_id);

ALTER TABLE teacher_conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE teacher_conversations FROM PUBLIC, anon, authenticated;


-- ── 2. teacher_messages ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES teacher_conversations(id) ON DELETE CASCADE,
  author_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body            JSONB       NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS teacher_messages_conversation_idx
  ON teacher_messages (conversation_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS teacher_messages_author_recent_idx
  ON teacher_messages (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS teacher_messages_unread_idx
  ON teacher_messages (conversation_id) WHERE read_at IS NULL;

ALTER TABLE teacher_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE teacher_messages FROM PUBLIC, anon, authenticated;


-- The body's shape and size. _feedback_content_valid (060) is the shape and
-- its own 5,000 cap; this adds the messages cap. IF, not AND: SQL does not
-- promise to skip the second operand, and the array walk raises on a body
-- that is not the shape.
CREATE OR REPLACE FUNCTION _message_body_valid(p_body JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_total INTEGER;
BEGIN
  IF NOT _feedback_content_valid(p_body) THEN
    RETURN FALSE;
  END IF;
  SELECT COALESCE(sum(char_length(r.run->>'text')), 0)::INTEGER INTO v_total
  FROM jsonb_array_elements(p_body->'paragraphs') AS pa(para),
       jsonb_array_elements(pa.para->'runs') AS r(run);
  RETURN v_total <= 2000;
END;
$$;

REVOKE ALL ON FUNCTION _message_body_valid(JSONB) FROM PUBLIC, anon, authenticated;


-- ── 3. Rate limit ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION teacher_messages_hourly_limit()
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 30 $$;

REVOKE ALL ON FUNCTION teacher_messages_hourly_limit() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION teacher_messages_enforce_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent INTEGER;
  v_limit  INTEGER := teacher_messages_hourly_limit();
BEGIN
  SELECT count(*) INTO v_recent
  FROM teacher_messages
  WHERE author_id = NEW.author_id
    AND created_at > NOW() - INTERVAL '1 hour';

  IF v_recent >= v_limit THEN
    RAISE EXCEPTION 'message rate limit reached (% per hour)', v_limit
      USING ERRCODE = 'PT429';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION teacher_messages_enforce_rate_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS teacher_messages_rate_limit ON teacher_messages;
CREATE TRIGGER teacher_messages_rate_limit
  BEFORE INSERT ON teacher_messages
  FOR EACH ROW
  EXECUTE FUNCTION teacher_messages_enforce_rate_limit();


-- ── 4. send_teacher_message ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION send_teacher_message(p_teacher UUID, p_student UUID, p_body JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   UUID := (SELECT auth.uid());
  v_conv UUID;
  v_msg  UUID;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF p_teacher IS NULL OR p_student IS NULL OR p_teacher = p_student
     OR (v_me <> p_teacher AND v_me <> p_student) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT _message_body_valid(p_body) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_body');
  END IF;

  SELECT c.id INTO v_conv
  FROM teacher_conversations c
  WHERE c.teacher_id = p_teacher AND c.student_id = p_student;

  IF NOT (_teacher_linked(p_teacher, p_student) AND _is_teacher(p_teacher)) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', CASE WHEN v_conv IS NULL THEN 'not_linked' ELSE 'closed' END
    );
  END IF;

  IF v_conv IS NULL THEN
    INSERT INTO teacher_conversations (teacher_id, student_id)
    VALUES (p_teacher, p_student)
    ON CONFLICT (teacher_id, student_id) DO NOTHING
    RETURNING id INTO v_conv;
    IF v_conv IS NULL THEN
      SELECT c.id INTO v_conv
      FROM teacher_conversations c
      WHERE c.teacher_id = p_teacher AND c.student_id = p_student;
    END IF;
  END IF;

  INSERT INTO teacher_messages (conversation_id, author_id, body)
  VALUES (v_conv, v_me, p_body)
  RETURNING id INTO v_msg;

  RETURN jsonb_build_object('ok', true, 'conversation_id', v_conv, 'message_id', v_msg);
END;
$$;

REVOKE ALL ON FUNCTION send_teacher_message(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION send_teacher_message(UUID, UUID, JSONB) TO authenticated;


-- ── 5. Reads ────────────────────────────────────────────────────────────
-- message_threads: the caller's threads in one role. A conversation row, or
-- (for a linked peer with no conversation yet) a row with a NULL
-- conversation_id, so the page can offer to start one. Newest first, the
-- empty ones after. Every column reference is qualified: the output column
-- names (conversation_id, ...) are also column names of teacher_messages.
CREATE OR REPLACE FUNCTION message_threads(p_as TEXT)
RETURNS TABLE (
  conversation_id UUID,
  peer_id         UUID,
  peer_label      TEXT,
  is_open         BOOLEAN,
  last_at         TIMESTAMPTZ,
  last_is_mine    BOOLEAN,
  unanswered      BOOLEAN,
  unread_count    INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := (SELECT auth.uid());
BEGIN
  IF v_me IS NULL OR p_as IS NULL OR p_as NOT IN ('student', 'teacher') THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH conv AS (
    SELECT c.id AS cid, c.teacher_id AS tid, c.student_id AS sid,
           (_teacher_linked(c.teacher_id, c.student_id) AND _is_teacher(c.teacher_id)) AS open_now
    FROM teacher_conversations c
    WHERE (p_as = 'student' AND c.student_id = v_me)
       OR (p_as = 'teacher' AND c.teacher_id = v_me)
  ),
  existing AS (
    SELECT cv.cid AS e_cid,
           CASE WHEN p_as = 'student' THEN cv.tid ELSE cv.sid END AS e_peer,
           cv.open_now AS e_open,
           lm.created_at AS e_last_at,
           (lm.author_id = v_me) AS e_last_mine,
           (cv.open_now AND lm.author_id = cv.sid) AS e_unanswered,
           (SELECT count(*)::INTEGER
              FROM teacher_messages m
             WHERE m.conversation_id = cv.cid
               AND m.author_id <> v_me
               AND m.read_at IS NULL) AS e_unread
    FROM conv cv
    LEFT JOIN LATERAL (
      SELECT m2.created_at, m2.author_id
      FROM teacher_messages m2
      WHERE m2.conversation_id = cv.cid
      ORDER BY m2.created_at DESC, m2.id DESC
      LIMIT 1
    ) lm ON TRUE
  ),
  empty AS (
    SELECT NULL::UUID AS e_cid,
           CASE WHEN p_as = 'student' THEN l.teacher_id ELSE l.student_id END AS e_peer,
           TRUE AS e_open,
           NULL::TIMESTAMPTZ AS e_last_at,
           NULL::BOOLEAN AS e_last_mine,
           FALSE AS e_unanswered,
           0 AS e_unread
    FROM teacher_student_links l
    WHERE l.ended_at IS NULL
      AND _is_teacher(l.teacher_id)
      AND ((p_as = 'student' AND l.student_id = v_me)
        OR (p_as = 'teacher' AND l.teacher_id = v_me))
      AND NOT EXISTS (
        SELECT 1 FROM teacher_conversations c2
        WHERE c2.teacher_id = l.teacher_id AND c2.student_id = l.student_id
      )
  ),
  allrows AS (
    SELECT * FROM existing
    UNION ALL
    SELECT * FROM empty
  )
  SELECT a.e_cid,
         a.e_peer,
         CASE
           WHEN p_as = 'student'
             THEN COALESCE(NULLIF(btrim(pr.display_name), ''), 'Your teacher')
           ELSE COALESCE(NULLIF(learner_contact_label(a.e_peer), ''),
                         NULLIF(btrim(pr.display_name), ''), 'Student')
         END,
         a.e_open,
         a.e_last_at,
         a.e_last_mine,
         a.e_unanswered,
         a.e_unread
  FROM allrows a
  JOIN profiles pr ON pr.id = a.e_peer
  ORDER BY a.e_last_at DESC NULLS LAST, 3;
END;
$$;

REVOKE ALL ON FUNCTION message_threads(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION message_threads(TEXT) TO authenticated;


CREATE OR REPLACE FUNCTION conversation_messages(p_teacher UUID, p_student UUID)
RETURNS TABLE (
  message_id UUID,
  author_id  UUID,
  mine       BOOLEAN,
  body       JSONB,
  created_at TIMESTAMPTZ,
  read_at    TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := (SELECT auth.uid());
BEGIN
  IF v_me IS NULL OR (v_me <> p_teacher AND v_me <> p_student) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT t.id, t.author_id, (t.author_id = v_me), t.body, t.created_at,
         CASE WHEN t.author_id = v_me THEN NULL ELSE t.read_at END
  FROM (
    SELECT m.id, m.author_id, m.body, m.created_at, m.read_at
    FROM teacher_messages m
    JOIN teacher_conversations c ON c.id = m.conversation_id
    WHERE c.teacher_id = p_teacher AND c.student_id = p_student
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 200
  ) t
  ORDER BY t.created_at, t.id;
END;
$$;

REVOKE ALL ON FUNCTION conversation_messages(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION conversation_messages(UUID, UUID) TO authenticated;


-- Marks the OTHER party's messages read; the caller's own are untouched.
-- Returns how many it marked.
CREATE OR REPLACE FUNCTION mark_conversation_read(p_teacher UUID, p_student UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := (SELECT auth.uid());
  v_n  INTEGER;
BEGIN
  IF v_me IS NULL OR (v_me <> p_teacher AND v_me <> p_student) THEN
    RETURN 0;
  END IF;

  UPDATE teacher_messages m
     SET read_at = now()
    FROM teacher_conversations c
   WHERE c.id = m.conversation_id
     AND c.teacher_id = p_teacher
     AND c.student_id = p_student
     AND m.author_id <> v_me
     AND m.read_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION mark_conversation_read(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mark_conversation_read(UUID, UUID) TO authenticated;


-- Unread teacher replies, for the account chip's dot and /my. Counts across
-- every conversation the caller is the STUDENT in, closed ones included.
CREATE OR REPLACE FUNCTION my_unread_message_count()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::INTEGER
  FROM teacher_messages m
  JOIN teacher_conversations c ON c.id = m.conversation_id
  WHERE c.student_id = (SELECT auth.uid())
    AND m.author_id <> (SELECT auth.uid())
    AND m.read_at IS NULL;
$$;

REVOKE ALL ON FUNCTION my_unread_message_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_unread_message_count() TO authenticated;


-- The caller as STUDENT, one row per message, for the data export
-- (privacy-policy.md §8). The teacher's side is not exported: those rows
-- describe other people (the my_teacher_links precedent, 0148).
CREATE OR REPLACE FUNCTION my_conversations_export()
RETURNS TABLE (
  conversation_id UUID,
  teacher_name    TEXT,
  is_open         BOOLEAN,
  message_id      UUID,
  author          TEXT,
  body            JSONB,
  created_at      TIMESTAMPTZ,
  read_at         TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id,
         COALESCE(NULLIF(btrim(p.display_name), ''), 'Your teacher'),
         (_teacher_linked(c.teacher_id, c.student_id) AND _is_teacher(c.teacher_id)),
         m.id,
         CASE WHEN m.author_id = c.student_id THEN 'you' ELSE 'teacher' END,
         m.body, m.created_at,
         CASE WHEN m.author_id = c.student_id THEN NULL ELSE m.read_at END
  FROM teacher_conversations c
  JOIN teacher_messages m ON m.conversation_id = c.id
  JOIN profiles p ON p.id = c.teacher_id
  WHERE c.student_id = (SELECT auth.uid())
  ORDER BY c.id, m.created_at, m.id;
$$;

REVOKE ALL ON FUNCTION my_conversations_export() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_conversations_export() TO authenticated;


-- ── 7. delete_my_account (re-emitted from 077) ──────────────────────────
-- Verbatim from 077 with one added DELETE, marked TCH-004.
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
