-- ============================================================
-- supabase/verify/079_teacher_messages.sql
--
-- TCH-004 full protocol for migration 079 (needs 060, 073, 076 applied).
-- NOT a migration: run after 079 is applied, as postgres. Seeds its own data
-- and ROLLS BACK. A failed assertion aborts with "TCH-004 FAIL: ...". Every
-- denial is paired with a positive control proving the rows it would have
-- hidden exist.
-- ============================================================
BEGIN;

CREATE FUNCTION pg_temp.as_user(p_user UUID, p_sql TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  EXECUTE p_sql INTO v;
  PERFORM set_config('role', 'postgres', true);
  RETURN v;
END;
$$;

CREATE FUNCTION pg_temp.check_eq(p_label TEXT, p_got TEXT, p_want TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE '% -> got % (want %)', p_label, p_got, p_want;
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'TCH-004 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

-- A one-paragraph body. The role switch in as_user takes away USAGE on this
-- session's pg_temp schema, so the SQL handed to as_user may call only public
-- and built-in functions: the helpers below BUILD that SQL text while still
-- running as postgres.
CREATE FUNCTION pg_temp.body(p_text TEXT)
RETURNS JSONB LANGUAGE sql AS $$
  SELECT jsonb_build_object('paragraphs',
    jsonb_build_array(jsonb_build_object('runs', jsonb_build_array(jsonb_build_object('text', p_text)))))
$$;

-- SQL that sends a one-paragraph message and returns the result's p_key.
CREATE FUNCTION pg_temp.send_sql(p_teacher UUID, p_student UUID, p_text TEXT, p_key TEXT)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT format('SELECT (public.send_teacher_message(%L, %L, %L::jsonb))->>%L',
                p_teacher, p_student, pg_temp.body(p_text)::text, p_key)
$$;

-- The same for a body given as JSON text (malformed shapes).
CREATE FUNCTION pg_temp.send_raw_sql(p_teacher UUID, p_student UUID, p_json TEXT, p_key TEXT)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT format('SELECT (public.send_teacher_message(%L, %L, %L::jsonb))->>%L',
                p_teacher, p_student, p_json, p_key)
$$;

-- A script run in ONE transaction (the Supabase SQL editor does this) gives
-- every message the same NOW(), so "the last message" would be decided by a
-- random uuid tie-break. In the app each message is its own transaction and
-- ties cannot occur. This trigger gives each seeded message its own
-- timestamp; it is DDL inside the transaction and rolls back with the rest.
CREATE FUNCTION public._verify079_clock() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER aa_verify079_clock BEFORE INSERT ON teacher_messages
  FOR EACH ROW EXECUTE FUNCTION public._verify079_clock();

DO $$
DECLARE
  t  UUID := gen_random_uuid();   -- teacher, linked to s
  t2 UUID := gen_random_uuid();   -- teacher, linked to s2 (link will end)
  t3 UUID := gen_random_uuid();   -- teacher, no link to anyone
  s  UUID := gen_random_uuid();   -- student linked to t
  s2 UUID := gen_random_uuid();   -- student whose link to t2 ends
  s3 UUID := gen_random_uuid();   -- student linked to t, no conversation yet
  n  UUID := gen_random_uuid();   -- third party: neither
  t5 UUID := gen_random_uuid();   -- rate-limit pair
  s5 UUID := gen_random_uuid();
  v_a UUID;
  v_conv UUID; v_res TEXT; v_hit BOOLEAN;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (t,  'authenticated', 'authenticated', 't-'  || t  || '@verify.test'),
    (t2, 'authenticated', 'authenticated', 't2-' || t2 || '@verify.test'),
    (t3, 'authenticated', 'authenticated', 't3-' || t3 || '@verify.test'),
    (s,  'authenticated', 'authenticated', 's-'  || s  || '@verify.test'),
    (s2, 'authenticated', 'authenticated', 's2-' || s2 || '@verify.test'),
    (s3, 'authenticated', 'authenticated', 's3-' || s3 || '@verify.test'),
    (n,  'authenticated', 'authenticated', 'n-'  || n  || '@verify.test'),
    (t5, 'authenticated', 'authenticated', 't5-' || t5 || '@verify.test'),
    (s5, 'authenticated', 'authenticated', 's5-' || s5 || '@verify.test');

  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v79-a', 'A', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO v_a;
  INSERT INTO course_editors (course_id, user_id, granted_by)
  VALUES (v_a, t, t), (v_a, t2, t2), (v_a, t3, t3), (v_a, t5, t5);
  -- TCH-008: 083 freezes a writer with no active seat, so every seeded editor
  -- gets the open-ended seat 082's backfill gave the real ones.
  INSERT INTO author_seats (user_id, kind, public_name)
  SELECT DISTINCT ce.user_id, 'teacher', 'Verify seat' FROM course_editors ce
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO teacher_student_links (teacher_id, student_id, source) VALUES
    (t, s, 'join_link'), (t, s3, 'join_link'), (t2, s2, 'join_link'), (t5, s5, 'join_link');

  -- 1. the student starts a conversation; the teacher answers ------------------
  PERFORM pg_temp.check_eq('seed: 4 active links (table is not empty)',
    (SELECT count(*)::text FROM teacher_student_links WHERE ended_at IS NULL AND teacher_id IN (t, t2, t5)), '4');
  PERFORM pg_temp.check_eq('s -> t first message ok',
    pg_temp.as_user(s, pg_temp.send_sql(t, s, 'Hello teacher', 'ok')), 'true');
  PERFORM pg_temp.check_eq('exactly one conversation row for the pair',
    (SELECT count(*)::text FROM teacher_conversations WHERE teacher_id = t AND student_id = s), '1');
  PERFORM pg_temp.check_eq('t sees the thread as unanswered (last message is the student''s)',
    pg_temp.as_user(t, $q$ SELECT unanswered::text FROM public.message_threads('teacher') WHERE conversation_id IS NOT NULL $q$), 'true');
  PERFORM pg_temp.check_eq('t sees 1 unread',
    pg_temp.as_user(t, $q$ SELECT unread_count::text FROM public.message_threads('teacher') WHERE conversation_id IS NOT NULL $q$), '1');
  PERFORM pg_temp.check_eq('s has no unread yet (own message does not count)',
    pg_temp.as_user(s, $q$ SELECT public.my_unread_message_count()::text $q$), '0');
  PERFORM pg_temp.check_eq('t -> s reply ok',
    pg_temp.as_user(t, pg_temp.send_sql(t, s, 'Hi, how can I help?', 'ok')), 'true');
  PERFORM pg_temp.check_eq('still one conversation row after the reply',
    (SELECT count(*)::text FROM teacher_conversations WHERE teacher_id = t AND student_id = s), '1');
  PERFORM pg_temp.check_eq('t thread is no longer unanswered',
    pg_temp.as_user(t, $q$ SELECT unanswered::text FROM public.message_threads('teacher') WHERE conversation_id IS NOT NULL $q$), 'false');
  PERFORM pg_temp.check_eq('s now has 1 unread teacher reply',
    pg_temp.as_user(s, $q$ SELECT public.my_unread_message_count()::text $q$), '1');
  PERFORM pg_temp.check_eq('s reads the thread: 2 messages, oldest first',
    pg_temp.as_user(s, format($q$ SELECT string_agg(mine::text, ',' ORDER BY created_at, message_id) FROM public.conversation_messages(%L, %L) $q$, t, s)), 'true,false');
  PERFORM pg_temp.check_eq('mark read by s: marks the 1 teacher message',
    pg_temp.as_user(s, format($q$ SELECT public.mark_conversation_read(%L, %L)::text $q$, t, s)), '1');
  PERFORM pg_temp.check_eq('s unread is 0 after reading',
    pg_temp.as_user(s, $q$ SELECT public.my_unread_message_count()::text $q$), '0');
  PERFORM pg_temp.check_eq('reading did not mark s''s own message (still unread for t)',
    pg_temp.as_user(t, $q$ SELECT unread_count::text FROM public.message_threads('teacher') WHERE conversation_id IS NOT NULL $q$), '1');

  -- A sender never learns when the reader read their message (0151 Decision 5).
  PERFORM pg_temp.check_eq('stored: t''s reply has a read_at after s read it (positive control)',
    (SELECT count(*)::text FROM teacher_messages WHERE author_id = t AND read_at IS NOT NULL), '1');
  PERFORM pg_temp.check_eq('s sees read_at on the teacher''s message (their own reading)',
    pg_temp.as_user(s, format($q$ SELECT bool_and(read_at IS NOT NULL)::text FROM public.conversation_messages(%L, %L) WHERE NOT mine $q$, t, s)), 'true');
  PERFORM pg_temp.check_eq('t does NOT see read_at on their own message',
    pg_temp.as_user(t, format($q$ SELECT bool_and(read_at IS NULL)::text FROM public.conversation_messages(%L, %L) WHERE mine $q$, t, s)), 'true');
  PERFORM pg_temp.check_eq('t marks s''s message read: 1 marked',
    pg_temp.as_user(t, format($q$ SELECT public.mark_conversation_read(%L, %L)::text $q$, t, s)), '1');
  PERFORM pg_temp.check_eq('stored: s''s message now has a read_at (positive control)',
    (SELECT count(*)::text FROM teacher_messages WHERE author_id = s AND read_at IS NOT NULL), '1');
  PERFORM pg_temp.check_eq('s does NOT see read_at on their own message',
    pg_temp.as_user(s, format($q$ SELECT bool_and(read_at IS NULL)::text FROM public.conversation_messages(%L, %L) WHERE mine $q$, t, s)), 'true');

  -- 2. the teacher writes first -----------------------------------------------
  PERFORM pg_temp.check_eq('t sees s3 as a linked peer with no conversation (positive control)',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.message_threads('teacher') WHERE peer_id = %L AND conversation_id IS NULL $q$, s3)), '1');
  PERFORM pg_temp.check_eq('t -> s3 first message ok (teacher writes first)',
    pg_temp.as_user(t, pg_temp.send_sql(t, s3, 'Welcome', 'ok')), 'true');
  PERFORM pg_temp.check_eq('s3 sees 1 unread',
    pg_temp.as_user(s3, $q$ SELECT public.my_unread_message_count()::text $q$), '1');
  PERFORM pg_temp.check_eq('a teacher-first thread is not "unanswered" for the teacher',
    pg_temp.as_user(t, format($q$ SELECT unanswered::text FROM public.message_threads('teacher') WHERE peer_id = %L $q$, s3)), 'false');

  -- 3. denials, each against a thread that exists (steps 1-2) -------------------
  PERFORM pg_temp.check_eq('third user n cannot post into (t, s)',
    pg_temp.as_user(n, pg_temp.send_sql(t, s, 'x', 'error')), 'forbidden');
  PERFORM pg_temp.check_eq('third user n cannot read (t, s) (zero rows; s reads 2 = positive control above)',
    pg_temp.as_user(n, format($q$ SELECT count(*)::text FROM public.conversation_messages(%L, %L) $q$, t, s)), '0');
  PERFORM pg_temp.check_eq('another teacher t3 cannot read (t, s)',
    pg_temp.as_user(t3, format($q$ SELECT count(*)::text FROM public.conversation_messages(%L, %L) $q$, t, s)), '0');
  PERFORM pg_temp.check_eq('n marking (t, s) read changes nothing',
    pg_temp.as_user(n, format($q$ SELECT public.mark_conversation_read(%L, %L)::text $q$, t, s)), '0');
  PERFORM pg_temp.check_eq('n sees no threads in either role',
    pg_temp.as_user(n, $q$ SELECT (SELECT count(*) FROM public.message_threads('student')) + (SELECT count(*) FROM public.message_threads('teacher')) $q$), '0');
  PERFORM pg_temp.check_eq('s2 (linked to t2, not to t) cannot start a conversation with t',
    pg_temp.as_user(s2, pg_temp.send_sql(t, s2, 'x', 'error')), 'not_linked');
  PERFORM pg_temp.check_eq('an unlinked learner cannot start a conversation with a teacher (t3 <- s2)',
    pg_temp.as_user(s2, pg_temp.send_sql(t3, s2, 'x', 'error')), 'not_linked');
  PERFORM pg_temp.check_eq('an unlinked teacher cannot write first (t3 -> s2)',
    pg_temp.as_user(t3, pg_temp.send_sql(t3, s2, 'x', 'error')), 'not_linked');
  PERFORM pg_temp.check_eq('the failed starts created no conversation',
    (SELECT count(*)::text FROM teacher_conversations WHERE teacher_id = t3), '0');
  PERFORM pg_temp.check_eq('anon has no EXECUTE on send',
    (SELECT has_function_privilege('anon', 'public.send_teacher_message(uuid,uuid,jsonb)', 'EXECUTE'))::text, 'false');
  PERFORM pg_temp.check_eq('anon has no EXECUTE on the thread read',
    (SELECT has_function_privilege('anon', 'public.conversation_messages(uuid,uuid)', 'EXECUTE'))::text, 'false');
  PERFORM pg_temp.check_eq('anon has no EXECUTE on the unread count',
    (SELECT has_function_privilege('anon', 'public.my_unread_message_count()', 'EXECUTE'))::text, 'false');
  PERFORM pg_temp.check_eq('no table privileges on teacher_messages for authenticated (SELECT)',
    (SELECT has_table_privilege('authenticated', 'public.teacher_messages', 'SELECT'))::text, 'false');
  PERFORM pg_temp.check_eq('no table privileges on teacher_messages for authenticated (INSERT)',
    (SELECT has_table_privilege('authenticated', 'public.teacher_messages', 'INSERT'))::text, 'false');
  PERFORM pg_temp.check_eq('no table privileges on teacher_conversations for authenticated (SELECT)',
    (SELECT has_table_privilege('authenticated', 'public.teacher_conversations', 'SELECT'))::text, 'false');
  PERFORM pg_temp.check_eq('no table privileges on teacher_conversations for authenticated (INSERT)',
    (SELECT has_table_privilege('authenticated', 'public.teacher_conversations', 'INSERT'))::text, 'false');

  -- 4. body validation and the 2,000-character cap ------------------------------
  PERFORM pg_temp.check_eq('2,000 characters is accepted (boundary, positive control)',
    pg_temp.as_user(s, pg_temp.send_sql(t, s, repeat('a', 2000), 'ok')), 'true');
  PERFORM pg_temp.check_eq('2,001 characters is refused',
    pg_temp.as_user(s, pg_temp.send_sql(t, s, repeat('a', 2001), 'error')), 'invalid_body');
  PERFORM pg_temp.check_eq('an empty body is refused',
    pg_temp.as_user(s, pg_temp.send_raw_sql(t, s, '{"paragraphs":[]}', 'error')), 'invalid_body');
  PERFORM pg_temp.check_eq('a body of the wrong shape is refused',
    pg_temp.as_user(s, pg_temp.send_raw_sql(t, s, '"just text"', 'error')), 'invalid_body');
  PERFORM pg_temp.check_eq('a bold run is accepted',
    pg_temp.as_user(s, pg_temp.send_raw_sql(t, s, '{"paragraphs":[{"runs":[{"text":"hi ","bold":true},{"text":"there"}]}]}', 'ok')), 'true');

  -- 5. an ended link leaves the conversation readable and closed ------------------
  PERFORM pg_temp.check_eq('t2 -> s2 first message ok while linked',
    pg_temp.as_user(t2, pg_temp.send_sql(t2, s2, 'Welcome', 'ok')), 'true');
  PERFORM pg_temp.check_eq('s2 -> t2 question ok while linked (the last message is now the student''s)',
    pg_temp.as_user(s2, pg_temp.send_sql(t2, s2, 'A question', 'ok')), 'true');
  PERFORM pg_temp.check_eq('while the link is active, that thread is unanswered for t2 (positive control)',
    pg_temp.as_user(t2, $q$ SELECT unanswered::text FROM public.message_threads('teacher') $q$), 'true');
  UPDATE teacher_student_links SET ended_at = now(), ended_by = s2 WHERE teacher_id = t2 AND student_id = s2;
  PERFORM pg_temp.check_eq('after the end, s2 cannot post (closed)',
    pg_temp.as_user(s2, pg_temp.send_sql(t2, s2, 'x', 'error')), 'closed');
  PERFORM pg_temp.check_eq('after the end, t2 cannot post (closed)',
    pg_temp.as_user(t2, pg_temp.send_sql(t2, s2, 'x', 'error')), 'closed');
  PERFORM pg_temp.check_eq('after the end, s2 still reads both messages (readable)',
    pg_temp.as_user(s2, format($q$ SELECT count(*)::text FROM public.conversation_messages(%L, %L) $q$, t2, s2)), '2');
  PERFORM pg_temp.check_eq('after the end, t2 still reads them',
    pg_temp.as_user(t2, format($q$ SELECT count(*)::text FROM public.conversation_messages(%L, %L) $q$, t2, s2)), '2');
  PERFORM pg_temp.check_eq('the thread is listed as closed for s2',
    pg_temp.as_user(s2, $q$ SELECT is_open::text FROM public.message_threads('student') $q$), 'false');
  PERFORM pg_temp.check_eq('s2 still counts the unread teacher reply after the end',
    pg_temp.as_user(s2, $q$ SELECT public.my_unread_message_count()::text $q$), '1');
  PERFORM pg_temp.check_eq('a closed thread is not "unanswered" even though the student wrote last (the teacher cannot answer it)',
    pg_temp.as_user(t2, $q$ SELECT unanswered::text FROM public.message_threads('teacher') $q$), 'false');
  -- Relinking reopens the same conversation (one row per pair, ever).
  INSERT INTO teacher_student_links (teacher_id, student_id, source) VALUES (t2, s2, 'join_link');
  PERFORM pg_temp.check_eq('after relinking s2 can post again (positive control)',
    pg_temp.as_user(s2, pg_temp.send_sql(t2, s2, 'back', 'ok')), 'true');
  PERFORM pg_temp.check_eq('still one conversation row for (t2, s2)',
    (SELECT count(*)::text FROM teacher_conversations WHERE teacher_id = t2 AND student_id = s2), '1');

  -- 6. the rate limit ---------------------------------------------------------------
  INSERT INTO teacher_conversations (teacher_id, student_id) VALUES (t5, s5) RETURNING id INTO v_conv;
  INSERT INTO teacher_messages (conversation_id, author_id, body)
  SELECT v_conv, s5, pg_temp.body('m' || g) FROM generate_series(1, 29) g;
  PERFORM pg_temp.check_eq('seed: s5 has 29 messages in the hour',
    (SELECT count(*)::text FROM teacher_messages WHERE author_id = s5), '29');
  PERFORM pg_temp.check_eq('the 30th message is accepted (limit is 30 per hour)',
    pg_temp.as_user(s5, pg_temp.send_sql(t5, s5, '30th', 'ok')), 'true');
  v_hit := FALSE;
  BEGIN
    PERFORM pg_temp.as_user(s5, pg_temp.send_sql(t5, s5, '31st', 'ok'));
  EXCEPTION WHEN SQLSTATE 'PT429' THEN
    v_hit := TRUE;
  END;
  PERFORM pg_temp.check_eq('the 31st message trips PT429', v_hit::text, 'true');
  PERFORM pg_temp.check_eq('the limit is per author: t5 can still answer (positive control)',
    pg_temp.as_user(t5, pg_temp.send_sql(t5, s5, 'reply', 'ok')), 'true');
  PERFORM pg_temp.check_eq('the rejected 31st left no row (30 in the hour, not 31)',
    (SELECT count(*)::text FROM teacher_messages WHERE author_id = s5 AND created_at > now() - interval '1 hour'), '30');

  -- 7. the export: the caller as STUDENT only ---------------------------------------
  PERFORM pg_temp.check_eq('s exports its conversation with t (positive control: rows exist)',
    pg_temp.as_user(s, $q$ SELECT count(*)::text FROM public.my_conversations_export() $q$), '4');
  PERFORM pg_temp.check_eq('export carries no read_at on the student''s own messages',
    pg_temp.as_user(s, $q$ SELECT bool_and(read_at IS NULL)::text FROM public.my_conversations_export() WHERE author = 'you' $q$), 'true');
  PERFORM pg_temp.check_eq('export labels the authors you / teacher',
    pg_temp.as_user(s, $q$ SELECT string_agg(DISTINCT author, ',' ORDER BY author) FROM public.my_conversations_export() $q$), 'teacher,you');
  PERFORM pg_temp.check_eq('t exports nothing as a student (teacher side is not exported)',
    pg_temp.as_user(t, $q$ SELECT count(*)::text FROM public.my_conversations_export() $q$), '0');
  PERFORM pg_temp.check_eq('n exports nothing',
    pg_temp.as_user(n, $q$ SELECT count(*)::text FROM public.my_conversations_export() $q$), '0');

  -- 8. account deletion removes the whole conversation, both sides -------------------
  PERFORM pg_temp.check_eq('before deletion: (t, s) has 4 messages, (t, s3) has 1',
    (SELECT (SELECT count(*) FROM teacher_messages m JOIN teacher_conversations c ON c.id = m.conversation_id WHERE c.teacher_id = t AND c.student_id = s)::text
         || '/' ||
            (SELECT count(*) FROM teacher_messages m JOIN teacher_conversations c ON c.id = m.conversation_id WHERE c.teacher_id = t AND c.student_id = s3)::text),
    '4/1');
  PERFORM pg_temp.check_eq('s deletes their account',
    pg_temp.as_user(s, $q$ SELECT (public.delete_my_account())->>'ok' $q$), 'true');
  PERFORM pg_temp.check_eq('(t, s) conversation and every message are gone, both sides',
    (SELECT (SELECT count(*) FROM teacher_conversations WHERE student_id = s)::text
         || '/' ||
            (SELECT count(*) FROM teacher_messages WHERE author_id IN (s))::text), '0/0');
  PERFORM pg_temp.check_eq('t''s messages in that conversation went with it too (t still has the one to s3)',
    (SELECT count(*)::text FROM teacher_messages WHERE author_id = t), '1');
  PERFORM pg_temp.check_eq('other conversations are untouched (t, s3) (positive control)',
    (SELECT count(*)::text FROM teacher_conversations WHERE teacher_id = t AND student_id = s3), '1');
  PERFORM pg_temp.check_eq('t deletes their account: their remaining conversation goes too',
    pg_temp.as_user(t, $q$ SELECT (public.delete_my_account())->>'ok' $q$), 'true');
  PERFORM pg_temp.check_eq('no conversation of t remains',
    (SELECT count(*)::text FROM teacher_conversations WHERE teacher_id = t), '0');
  PERFORM pg_temp.check_eq('s3 lost the conversation it was a party to',
    (SELECT count(*)::text FROM teacher_conversations WHERE student_id = s3), '0');
  PERFORM pg_temp.check_eq('unrelated conversations survive (t2, s2) (positive control)',
    (SELECT count(*)::text FROM teacher_conversations WHERE teacher_id = t2 AND student_id = s2), '1');

  RAISE NOTICE 'TCH-004 PASS';
END;
$$;

ROLLBACK;
