-- ============================================================
-- 092_message_no_reply_needed.sql
--
-- Ad-hoc (owner, 2026-10-19, docs/decisions/0178): "No reply needed" on a
-- Studio thread. A teacher who read a student's message and has nothing to
-- add could not take the thread off the Messages badge or the inbox's
-- "Unanswered questions": unanswered (079, message_threads) is "the last
-- message is the student's and the link is live", and only a reply changed it.
-- Reading does not, by design (0151 Decision 7: read and answered are two
-- different things).
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 091_telegram_message_pings.sql
--   latest body of the account-delete RPC   -> 090_telegram_reminders.sql, NOT
--     re-emitted: the new column lives on teacher_conversations, which
--     delete_my_account (079) already deletes for both parties.
-- Re-emitted: message_threads (079; no later file re-emits it), one changed
-- expression, marked 092. REQUIRES 079.
--
-- ── 1. teacher_conversations.teacher_dismissed_message_id ───────────────
-- The id of the student message the teacher said needs no reply. A message id,
-- not a timestamp: "the thread's last message is still the one dismissed" is
-- exact, where comparing created_at with a dismiss time misorders a message
-- whose transaction began before the dismiss and committed after it (0178
-- Decision 2). The table has no grants and no policy (079), and this column is
-- written only by the SECURITY DEFINER function below, so it gets no GRANT.
-- ON DELETE SET NULL for form's sake: messages are only ever deleted with
-- their conversation (079's cascade).
--
-- ── 2. dismiss_conversation(p_student) ──────────────────────────────────
-- The caller is the teacher (auth.uid()); the student is the argument, so a
-- student or a third user can only ever name a conversation they are not the
-- teacher of, and gets 'not_found'. It records the thread's last message only
-- when that message is the student's; otherwise it changes nothing and says
-- so ({ ok: true, dismissed: false }). It does not touch read_at: the thread
-- page has already marked the messages read, and reading stays the page's job.
-- A closed thread may be dismissed (harmless: it is never unanswered).
--
-- ── 3. message_threads (re-emitted) ─────────────────────────────────────
-- unanswered gains one condition: the last message is not the dismissed one.
-- The student's next message is a new id, so the thread comes back on its own.
-- unread_count is unchanged. The badge and the inbox read this one call (0151
-- Decision 7), so they still cannot disagree.
--
-- Not destructive: one nullable column added, one function added, one
-- re-emitted; no DROP, no TRUNCATE, no UPDATE or DELETE of an existing row.
-- Safe to re-apply: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE.
-- ============================================================

BEGIN;

-- ── 1. teacher_conversations.teacher_dismissed_message_id ───────────────
ALTER TABLE teacher_conversations
  ADD COLUMN IF NOT EXISTS teacher_dismissed_message_id UUID
    REFERENCES teacher_messages(id) ON DELETE SET NULL;


-- ── 2. dismiss_conversation ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION dismiss_conversation(p_student UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_conv   UUID;
  v_last   UUID;
  v_author UUID;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT c.id INTO v_conv
  FROM teacher_conversations c
  WHERE c.teacher_id = v_me AND c.student_id = p_student
  FOR UPDATE;

  IF v_conv IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT m.id, m.author_id INTO v_last, v_author
  FROM teacher_messages m
  WHERE m.conversation_id = v_conv
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT 1;

  IF v_last IS NULL OR v_author <> p_student THEN
    RETURN jsonb_build_object('ok', true, 'dismissed', false);
  END IF;

  UPDATE teacher_conversations
     SET teacher_dismissed_message_id = v_last
   WHERE id = v_conv;

  RETURN jsonb_build_object('ok', true, 'dismissed', true);
END;
$$;

REVOKE ALL ON FUNCTION dismiss_conversation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION dismiss_conversation(UUID) TO authenticated;


-- ── 3. message_threads (re-emitted from 079) ────────────────────────────
-- Verbatim from 079 except the dismissed id carried through conv and the
-- e_unanswered expression, both marked 092.
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
           c.teacher_dismissed_message_id AS dismissed,  -- 092
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
           -- 092: a last message the teacher marked "No reply needed" is not unanswered.
           (cv.open_now AND lm.author_id = cv.sid
              AND lm.id IS DISTINCT FROM cv.dismissed) AS e_unanswered,
           (SELECT count(*)::INTEGER
              FROM teacher_messages m
             WHERE m.conversation_id = cv.cid
               AND m.author_id <> v_me
               AND m.read_at IS NULL) AS e_unread
    FROM conv cv
    LEFT JOIN LATERAL (
      SELECT m2.id, m2.created_at, m2.author_id  -- 092: id added
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

COMMIT;
