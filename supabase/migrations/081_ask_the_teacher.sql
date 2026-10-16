-- ============================================================
-- 081_ask_the_teacher.sql
--
-- TCH-006 (#216): a linked student sends the exercise (or voice task) they
-- are stuck on into the conversation, with their answer if they choose
-- (docs/decisions/0141 Decision 10; choices made while writing this file are
-- in docs/decisions/0153). The snapshot is stored ON the message, not
-- referenced, so a later lesson edit does not change what the teacher sees.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 080_homework.sql
--   latest body of the account-delete RPC   -> 080_homework.sql
-- delete_my_account is NOT re-emitted: the snapshot is a column of
-- teacher_messages, and 079's DELETE FROM teacher_conversations already takes
-- the messages with it by ON DELETE CASCADE (0151 Decision 11). Re-emitted
-- here: send_teacher_message (079, section 4), conversation_messages and
-- my_conversations_export (079, section 5; each gains a column, which
-- CREATE OR REPLACE cannot do, so each is dropped and created again).
-- REQUIRES 079 (teacher_messages, send_teacher_message) and 080
-- (_homework_recipients, homework_assignments).
--
-- ── 1. teacher_messages.attachment ──────────────────────────────────────
-- Nullable JSONB, at most 40,000 characters of text. Nothing outside
-- send_teacher_message writes it (the table has no grants).
--
-- ── 2. Who may ask, in one place: _ask_teacher_allowed ──────────────────
-- (teacher, student, lesson): the link is live, the teacher is still a
-- teacher, and the teacher EDITS the lesson's course or the student receives
-- an assignment from that teacher that covers it (the whole course, or that
-- very lesson; the _teacher_readable_lessons rule of 080). Both
-- ask_teacher_options (what the lesson page offers) and the send path (what
-- is accepted) call it, so the page cannot offer what the database refuses.
--
-- ── 3. ask_teacher_options ──────────────────────────────────────────────
-- The caller's teachers who qualify for one lesson. Empty for an anonymous
-- caller, an unlinked one and a lesson nobody qualifies for. It is the only
-- thing the lesson page asks; a visitor who is not linked costs one empty
-- read and downloads nothing more.
--
-- ── 4. send_teacher_message, four-argument form ─────────────────────────
-- The 079 function is kept as a thin wrapper (NULL attachment) so a deploy
-- that runs before this migration is applied still sends plain messages (the
-- route calls the three-argument form when there is no attachment).
-- With an attachment: only the STUDENT may attach (a teacher gets
-- 'attachment_not_allowed'); the link must be live (the existing
-- 'not_linked' / 'closed' answers come first); _ask_teacher_allowed must
-- hold for the snapshot's lesson ('attachment_not_allowed'); and
-- _attachment_normalise must accept it ('attachment_invalid'). The attachment
-- is checked BEFORE the conversation row is created, so a refused snapshot
-- never leaves an empty conversation behind.
--
-- ── 5. What the database does not take from the client ──────────────────
-- _attachment_normalise rebuilds the snapshot. From the client it keeps only
-- the version id, the block id, the block and (for an exercise, if the
-- student ticked it) the response. The block must EQUAL the one in that
-- version's own document (so a snapshot can neither be forged nor used to
-- read a lesson the student could not open: equality reveals nothing the
-- caller did not already hold), and the version's lesson must be one the
-- teacher qualifies for. The course and lesson titles and slugs, the lesson
-- id and "Exercise N" are written from the database, never from the request.
-- An answer is the response as sent, at most 8,000 characters of JSON; a
-- voice task takes none (the recording is not attached).
--
-- ── 6. Reads ────────────────────────────────────────────────────────────
-- conversation_messages and my_conversations_export gain an `attachment`
-- column, last. Participants only, as before.
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the owner (or through CLAUDE.md's hosted-apply gate), never
-- ad hoc.
--
-- Safe to re-apply: ADD COLUMN IF NOT EXISTS, the constraint is added only if
-- absent, every function CREATE OR REPLACE, DROP FUNCTION IF EXISTS before a
-- changed signature.
-- ============================================================

BEGIN;

-- ── 1. teacher_messages.attachment ──────────────────────────────────────
ALTER TABLE teacher_messages ADD COLUMN IF NOT EXISTS attachment JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'teacher_messages_attachment_shape'
      AND conrelid = 'public.teacher_messages'::regclass
  ) THEN
    ALTER TABLE teacher_messages
      ADD CONSTRAINT teacher_messages_attachment_shape
      CHECK (attachment IS NULL
             OR (jsonb_typeof(attachment) = 'object' AND char_length(attachment::text) <= 40000));
  END IF;
END;
$$;


-- ── 2. _ask_teacher_allowed ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _ask_teacher_allowed(p_teacher UUID, p_student UUID, p_lesson UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_teacher IS NOT NULL AND p_student IS NOT NULL AND p_lesson IS NOT NULL
    AND p_teacher <> p_student
    AND _teacher_linked(p_teacher, p_student)
    AND _is_teacher(p_teacher)
    AND EXISTS (
      SELECT 1
      FROM lessons l
      WHERE l.id = p_lesson
        AND (
          can_edit_course(l.course_id, p_teacher)
          OR EXISTS (
            SELECT 1
            FROM _homework_recipients(p_teacher, p_student) r
            JOIN homework_assignments a ON a.id = r.assignment_id
            WHERE a.teacher_id = p_teacher
              AND a.course_id = l.course_id
              AND (a.lesson_id IS NULL OR a.lesson_id = l.id)
          )
        )
    );
$$;

REVOKE ALL ON FUNCTION _ask_teacher_allowed(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;


-- ── 3. ask_teacher_options ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ask_teacher_options(p_lesson UUID)
RETURNS TABLE (
  teacher_id    UUID,
  teacher_label TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := (SELECT auth.uid());
BEGIN
  IF v_me IS NULL OR p_lesson IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT l.teacher_id,
         COALESCE(NULLIF(btrim(pr.display_name), ''), 'Your teacher')
  FROM teacher_student_links l
  JOIN profiles pr ON pr.id = l.teacher_id
  WHERE l.student_id = v_me
    AND l.ended_at IS NULL
    AND _ask_teacher_allowed(l.teacher_id, v_me, p_lesson)
  ORDER BY 2, 1;
END;
$$;

REVOKE ALL ON FUNCTION ask_teacher_options(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ask_teacher_options(UUID) TO authenticated;


-- ── 5. _attachment_normalise ────────────────────────────────────────────
-- Returns {ok: true, attachment: {...}} or {ok: false, error: <code>}.
CREATE OR REPLACE FUNCTION _attachment_normalise(p_teacher UUID, p_student UUID, p_att JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind     TEXT;
  v_ver_txt  TEXT;
  v_ver      UUID;
  v_block_id TEXT;
  v_document JSONB;
  v_lesson   UUID;
  v_lesson_slug  TEXT;
  v_lesson_title TEXT;
  v_course_slug  TEXT;
  v_course_title TEXT;
  v_block    JSONB;
  v_idx      BIGINT;
  v_number   BIGINT;
  v_has_resp BOOLEAN;
  v_out      JSONB;
BEGIN
  IF p_att IS NULL OR jsonb_typeof(p_att) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'attachment_invalid');
  END IF;

  v_kind     := p_att->>'kind';
  v_ver_txt  := p_att->>'versionId';
  v_block_id := p_att->>'blockId';
  IF p_att->>'v' IS DISTINCT FROM '1'
     OR v_kind IS NULL OR v_kind NOT IN ('exercise', 'voice_task')
     OR v_ver_txt IS NULL
     OR v_ver_txt !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR v_block_id IS NULL OR char_length(v_block_id) NOT BETWEEN 1 AND 200
     OR jsonb_typeof(p_att->'block') IS DISTINCT FROM 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'attachment_invalid');
  END IF;
  v_ver := v_ver_txt::uuid;

  SELECT v.document, l.id, l.slug, l.title, c.slug, c.title
    INTO v_document, v_lesson, v_lesson_slug, v_lesson_title, v_course_slug, v_course_title
  FROM lesson_versions v
  JOIN lessons l ON l.id = v.lesson_id
  JOIN courses c ON c.id = l.course_id
  WHERE v.id = v_ver;

  IF v_lesson IS NULL OR jsonb_typeof(v_document) IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'attachment_invalid');
  END IF;

  IF NOT _ask_teacher_allowed(p_teacher, p_student, v_lesson) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'attachment_not_allowed');
  END IF;

  SELECT t.b, t.ord
    INTO v_block, v_idx
  FROM jsonb_array_elements(v_document) WITH ORDINALITY AS t(b, ord)
  WHERE t.b->>'id' = v_block_id
  ORDER BY t.ord
  LIMIT 1;

  IF v_block IS NULL
     OR v_block IS DISTINCT FROM (p_att->'block')
     OR NOT (
       (v_kind = 'exercise'    AND v_block->>'kind' = 'practice')
       OR (v_kind = 'voice_task' AND v_block->>'kind' = 'task' AND v_block->>'type' = 'voice')
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'attachment_invalid');
  END IF;

  v_has_resp := p_att ? 'response';
  IF v_has_resp THEN
    IF v_kind <> 'exercise'
       OR jsonb_typeof(p_att->'response') IS NOT DISTINCT FROM 'null'
       OR char_length((p_att->'response')::text) > 8000 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'attachment_invalid');
    END IF;
  END IF;

  -- "Exercise N": practice blocks only, in document order, as the player
  -- numbers them (LessonPlayer's practiceNumber).
  IF v_kind = 'exercise' THEN
    SELECT count(*) INTO v_number
    FROM jsonb_array_elements(v_document) WITH ORDINALITY AS t(b, ord)
    WHERE t.ord <= v_idx AND t.b->>'kind' = 'practice';
  END IF;

  v_out := jsonb_build_object(
    'v', 1,
    'kind', v_kind,
    'courseSlug', v_course_slug,
    'courseTitle', v_course_title,
    'lessonSlug', v_lesson_slug,
    'lessonTitle', v_lesson_title,
    'lessonId', v_lesson,
    'versionId', v_ver,
    'blockId', v_block_id,
    'number', v_number,
    'block', v_block
  );
  IF v_has_resp THEN
    v_out := v_out || jsonb_build_object('response', p_att->'response');
  END IF;

  RETURN jsonb_build_object('ok', true, 'attachment', v_out);
END;
$$;

REVOKE ALL ON FUNCTION _attachment_normalise(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;


-- ── 4. send_teacher_message ─────────────────────────────────────────────
-- The four-argument form is the implementation: 079's body plus the
-- attachment steps. No default on p_attachment, so a three-argument call can
-- only mean the wrapper below.
CREATE OR REPLACE FUNCTION send_teacher_message(
  p_teacher    UUID,
  p_student    UUID,
  p_body       JSONB,
  p_attachment JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   UUID := (SELECT auth.uid());
  v_conv UUID;
  v_msg  UUID;
  v_norm JSONB;
  v_att  JSONB;
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

  -- Only the student asks about an exercise, and the snapshot is rebuilt from
  -- the database before anything is written (section 5 of the header).
  IF p_attachment IS NOT NULL THEN
    IF v_me <> p_student THEN
      RETURN jsonb_build_object('ok', false, 'error', 'attachment_not_allowed');
    END IF;
    v_norm := _attachment_normalise(p_teacher, p_student, p_attachment);
    IF NOT COALESCE((v_norm->>'ok')::boolean, false) THEN
      RETURN jsonb_build_object('ok', false, 'error', COALESCE(v_norm->>'error', 'attachment_invalid'));
    END IF;
    v_att := v_norm->'attachment';
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

  INSERT INTO teacher_messages (conversation_id, author_id, body, attachment)
  VALUES (v_conv, v_me, p_body, v_att)
  RETURNING id INTO v_msg;

  RETURN jsonb_build_object('ok', true, 'conversation_id', v_conv, 'message_id', v_msg);
END;
$$;

REVOKE ALL ON FUNCTION send_teacher_message(UUID, UUID, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION send_teacher_message(UUID, UUID, JSONB, JSONB) TO authenticated;


-- The 079 signature, kept for a plain message.
CREATE OR REPLACE FUNCTION send_teacher_message(p_teacher UUID, p_student UUID, p_body JSONB)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.send_teacher_message(p_teacher, p_student, p_body, NULL::jsonb);
$$;

REVOKE ALL ON FUNCTION send_teacher_message(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION send_teacher_message(UUID, UUID, JSONB) TO authenticated;


-- ── 6. Reads ────────────────────────────────────────────────────────────
-- Re-created from 079 with `attachment` added last. A changed return type
-- cannot be CREATE OR REPLACEd.
DROP FUNCTION IF EXISTS conversation_messages(UUID, UUID);
CREATE FUNCTION conversation_messages(p_teacher UUID, p_student UUID)
RETURNS TABLE (
  message_id UUID,
  author_id  UUID,
  mine       BOOLEAN,
  body       JSONB,
  created_at TIMESTAMPTZ,
  read_at    TIMESTAMPTZ,
  attachment JSONB
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
         CASE WHEN t.author_id = v_me THEN NULL ELSE t.read_at END,
         t.attachment
  FROM (
    SELECT m.id, m.author_id, m.body, m.created_at, m.read_at, m.attachment
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


DROP FUNCTION IF EXISTS my_conversations_export();
CREATE FUNCTION my_conversations_export()
RETURNS TABLE (
  conversation_id UUID,
  teacher_name    TEXT,
  is_open         BOOLEAN,
  message_id      UUID,
  author          TEXT,
  body            JSONB,
  created_at      TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  attachment      JSONB
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
         CASE WHEN m.author_id = c.student_id THEN NULL ELSE m.read_at END,
         m.attachment
  FROM teacher_conversations c
  JOIN teacher_messages m ON m.conversation_id = c.id
  JOIN profiles p ON p.id = c.teacher_id
  WHERE c.student_id = (SELECT auth.uid())
  ORDER BY c.id, m.created_at, m.id;
$$;

REVOKE ALL ON FUNCTION my_conversations_export() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_conversations_export() TO authenticated;

COMMIT;
