-- ============================================================
-- supabase/verify/092_message_no_reply_needed.sql
--
-- Full protocol for migration 092 (needs 079 and 092 applied). NOT a
-- migration: run as postgres. Seeds its own data and ROLLS BACK. A failed
-- assertion aborts with "0178 FAIL: ...". Every denial is paired with a
-- positive control proving the thread it would have changed is unanswered.
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
    RAISE EXCEPTION '0178 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

-- SQL text is built here, as postgres: as_user's role switch loses USAGE on
-- pg_temp (the 079 verify note).
CREATE FUNCTION pg_temp.send_sql(p_teacher UUID, p_student UUID, p_text TEXT)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT format('SELECT (public.send_teacher_message(%L, %L, %L::jsonb))->>''ok''',
                p_teacher, p_student,
                jsonb_build_object('paragraphs', jsonb_build_array(jsonb_build_object(
                  'runs', jsonb_build_array(jsonb_build_object('text', p_text)))))::text)
$$;

CREATE FUNCTION pg_temp.dismiss_sql(p_student UUID, p_key TEXT)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT format('SELECT (public.dismiss_conversation(%L))->>%L', p_student, p_key)
$$;

CREATE FUNCTION pg_temp.unanswered_sql(p_peer UUID)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT format('SELECT unanswered::text FROM public.message_threads(''teacher'') WHERE peer_id = %L', p_peer)
$$;

-- One transaction gives every insert the same NOW(); each seeded message gets
-- its own timestamp so "the last message" is not a uuid tie-break (the 079
-- verify's trigger, rolled back with the rest).
CREATE FUNCTION public._verify092_clock() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER aa_verify092_clock BEFORE INSERT ON teacher_messages
  FOR EACH ROW EXECUTE FUNCTION public._verify092_clock();

DO $$
DECLARE
  t  UUID := gen_random_uuid();   -- teacher of s and s3
  t2 UUID := gen_random_uuid();   -- another teacher of s
  s  UUID := gen_random_uuid();   -- student
  s3 UUID := gen_random_uuid();   -- linked to t, no conversation
  n  UUID := gen_random_uuid();   -- third party
  v_a UUID;
  v_last UUID;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (t,  'authenticated', 'authenticated', 't-'  || t  || '@verify.test'),
    (t2, 'authenticated', 'authenticated', 't2-' || t2 || '@verify.test'),
    (s,  'authenticated', 'authenticated', 's-'  || s  || '@verify.test'),
    (s3, 'authenticated', 'authenticated', 's3-' || s3 || '@verify.test'),
    (n,  'authenticated', 'authenticated', 'n-'  || n  || '@verify.test');

  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v92-a', 'A', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO v_a;
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES (v_a, t, t), (v_a, t2, t2);
  INSERT INTO author_seats (user_id, kind, public_name)
  SELECT DISTINCT ce.user_id, 'teacher', 'Verify seat' FROM course_editors ce
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO teacher_student_links (teacher_id, student_id, source) VALUES
    (t, s, 'join_link'), (t, s3, 'join_link'), (t2, s, 'join_link');

  PERFORM pg_temp.check_eq('anon cannot execute dismiss_conversation',
    has_function_privilege('anon', 'public.dismiss_conversation(uuid)', 'execute')::text, 'false');
  PERFORM pg_temp.check_eq('authenticated can execute dismiss_conversation (positive control)',
    has_function_privilege('authenticated', 'public.dismiss_conversation(uuid)', 'execute')::text, 'true');

  -- 1. a student's message makes the thread unanswered ------------------------
  PERFORM pg_temp.check_eq('s -> t ok', pg_temp.as_user(s, pg_temp.send_sql(t, s, 'Question 1')), 'true');
  PERFORM pg_temp.check_eq('s -> t2 ok', pg_temp.as_user(s, pg_temp.send_sql(t2, s, 'Question for t2')), 'true');
  PERFORM pg_temp.check_eq('seed: 2 conversations of s (not empty)',
    (SELECT count(*)::text FROM teacher_conversations WHERE student_id = s), '2');
  PERFORM pg_temp.check_eq('positive control: t sees (t, s) unanswered',
    pg_temp.as_user(t, pg_temp.unanswered_sql(s)), 'true');

  -- 2. denials: nobody but the conversation's teacher can dismiss it ----------
  PERFORM pg_temp.check_eq('s (the student) dismissing gets not_found',
    pg_temp.as_user(s, pg_temp.dismiss_sql(s, 'error')), 'not_found');
  PERFORM pg_temp.check_eq('n (third party) dismissing gets not_found',
    pg_temp.as_user(n, pg_temp.dismiss_sql(s, 'error')), 'not_found');
  PERFORM pg_temp.check_eq('t on a linked student with no conversation gets not_found',
    pg_temp.as_user(t, pg_temp.dismiss_sql(s3, 'error')), 'not_found');
  PERFORM pg_temp.check_eq('after the denials (t, s) is still unanswered',
    pg_temp.as_user(t, pg_temp.unanswered_sql(s)), 'true');
  PERFORM pg_temp.check_eq('no dismissed id was stored by a denial',
    (SELECT count(*)::text FROM teacher_conversations WHERE student_id = s AND teacher_dismissed_message_id IS NOT NULL), '0');

  -- 3. the teacher dismisses ---------------------------------------------------
  PERFORM pg_temp.check_eq('t dismisses (t, s): dismissed true',
    pg_temp.as_user(t, pg_temp.dismiss_sql(s, 'dismissed')), 'true');
  SELECT m.id INTO v_last FROM teacher_messages m
    JOIN teacher_conversations c ON c.id = m.conversation_id
   WHERE c.teacher_id = t AND c.student_id = s ORDER BY m.created_at DESC, m.id DESC LIMIT 1;
  PERFORM pg_temp.check_eq('stored id is the thread''s last message',
    (SELECT (teacher_dismissed_message_id = v_last)::text FROM teacher_conversations WHERE teacher_id = t AND student_id = s), 'true');
  PERFORM pg_temp.check_eq('(t, s) is no longer unanswered',
    pg_temp.as_user(t, pg_temp.unanswered_sql(s)), 'false');
  PERFORM pg_temp.check_eq('dismissing does not mark read: t still has 1 unread',
    pg_temp.as_user(t, format($q$ SELECT unread_count::text FROM public.message_threads('teacher') WHERE peer_id = %L $q$, s)), '1');
  PERFORM pg_temp.check_eq('t2''s thread with s is untouched: still unanswered',
    pg_temp.as_user(t2, pg_temp.unanswered_sql(s)), 'true');
  PERFORM pg_temp.check_eq('dismissing again is ok (idempotent)',
    pg_temp.as_user(t, pg_temp.dismiss_sql(s, 'ok')), 'true');

  -- 4. the student's next message brings it back -------------------------------
  PERFORM pg_temp.check_eq('s -> t again ok', pg_temp.as_user(s, pg_temp.send_sql(t, s, 'Question 2')), 'true');
  PERFORM pg_temp.check_eq('(t, s) unanswered again after a new student message',
    pg_temp.as_user(t, pg_temp.unanswered_sql(s)), 'true');

  -- 5. a teacher-last thread has nothing to dismiss ----------------------------
  PERFORM pg_temp.check_eq('t -> s reply ok', pg_temp.as_user(t, pg_temp.send_sql(t, s, 'Answer')), 'true');
  PERFORM pg_temp.check_eq('(t, s) not unanswered after the reply',
    pg_temp.as_user(t, pg_temp.unanswered_sql(s)), 'false');
  PERFORM pg_temp.check_eq('dismiss on a teacher-last thread: dismissed false',
    pg_temp.as_user(t, pg_temp.dismiss_sql(s, 'dismissed')), 'false');
  PERFORM pg_temp.check_eq('stored id unchanged by the no-op (still the first dismissed message)',
    (SELECT (teacher_dismissed_message_id = v_last)::text FROM teacher_conversations WHERE teacher_id = t AND student_id = s), 'true');
  PERFORM pg_temp.check_eq('s -> t a third time ok', pg_temp.as_user(s, pg_temp.send_sql(t, s, 'Question 3')), 'true');
  PERFORM pg_temp.check_eq('(t, s) unanswered after the student writes again',
    pg_temp.as_user(t, pg_temp.unanswered_sql(s)), 'true');

  -- 6. the student's view is unchanged ----------------------------------------
  PERFORM pg_temp.check_eq('s still sees both threads',
    pg_temp.as_user(s, $q$ SELECT count(*)::text FROM public.message_threads('student') $q$), '2');

  -- 7. account deletion with a dismissed id stored -----------------------------
  PERFORM pg_temp.check_eq('t dismisses again before deletion',
    pg_temp.as_user(t, pg_temp.dismiss_sql(s, 'dismissed')), 'true');
  PERFORM pg_temp.check_eq('s deletes their account',
    pg_temp.as_user(s, $q$ SELECT (public.delete_my_account())->>'ok' $q$), 'true');
  PERFORM pg_temp.check_eq('both conversations of s are gone',
    (SELECT count(*)::text FROM teacher_conversations WHERE student_id = s), '0');

  RAISE NOTICE '0178 PASS';
END;
$$;

ROLLBACK;
