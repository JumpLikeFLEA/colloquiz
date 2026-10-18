-- ============================================================
-- supabase/verify/091_telegram_message_pings.sql
--
-- TCH-012 full protocol for migration 091 (needs 079, 083 and 090 applied).
-- NOT a migration: run after 091 is applied, as postgres. Seeds its own data
-- and ROLLS BACK. A failed assertion aborts with "TCH-012 FAIL: ...". Every
-- denial is paired with a positive control proving the rows it would have
-- hidden exist.
-- ============================================================
BEGIN;

CREATE FUNCTION pg_temp.as_role(p_role TEXT, p_user UUID, p_sql TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_user IS NULL THEN json_build_object('role', p_role)::text
         ELSE json_build_object('sub', p_user, 'role', p_role)::text END, true);
  PERFORM set_config('role', p_role, true);
  EXECUTE p_sql INTO v;
  PERFORM set_config('role', 'postgres', true);
  RETURN COALESCE(v, 'null');
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('role', 'postgres', true);
  RETURN 'ERR:' || SQLSTATE;
END;
$$;

CREATE FUNCTION pg_temp.as_user(p_user UUID, p_sql TEXT) RETURNS TEXT LANGUAGE sql AS
$$ SELECT pg_temp.as_role('authenticated', p_user, p_sql) $$;
CREATE FUNCTION pg_temp.as_anon(p_sql TEXT) RETURNS TEXT LANGUAGE sql AS
$$ SELECT pg_temp.as_role('anon', NULL, p_sql) $$;
CREATE FUNCTION pg_temp.as_service(p_sql TEXT) RETURNS TEXT LANGUAGE sql AS
$$ SELECT pg_temp.as_role('service_role', NULL, p_sql) $$;

CREATE FUNCTION pg_temp.check_eq(p_label TEXT, p_got TEXT, p_want TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE '% -> got % (want %)', p_label, p_got, p_want;
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'TCH-012 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

-- SQL that sends a one-paragraph message (built here, while still postgres: the
-- role switch takes away USAGE on pg_temp) and returns the new message id.
CREATE FUNCTION pg_temp.send_sql(p_teacher UUID, p_student UUID, p_text TEXT)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT format('SELECT (public.send_teacher_message(%L, %L, %L::jsonb))->>''message_id''',
    p_teacher, p_student,
    jsonb_build_object('paragraphs',
      jsonb_build_array(jsonb_build_object('runs', jsonb_build_array(jsonb_build_object('text', p_text)))))::text)
$$;

-- SQL that claims a ping for a message and returns the answer's p_key.
CREATE FUNCTION pg_temp.claim_sql(p_message TEXT, p_key TEXT)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT format('SELECT (public.telegram_message_ping_claim(%L::uuid))->>%L', p_message, p_key)
$$;

-- One transaction gives every message the same NOW(); a message's created_at must
-- order against a ping's sent_at (clock_timestamp), as it does in the app, where
-- each message is its own transaction. Rolls back with the rest.
CREATE FUNCTION public._verify091_clock() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER aa_verify091_clock BEFORE INSERT ON teacher_messages
  FOR EACH ROW EXECUTE FUNCTION public._verify091_clock();

DO $$
DECLARE
  t  UUID := gen_random_uuid();   -- teacher of s
  s  UUID := gen_random_uuid();   -- student of t
  t2 UUID := gen_random_uuid();   -- teacher of s2 (positive control for the delete)
  s2 UUID := gen_random_uuid();
  v_a UUID;
  v_conv UUID; v_conv2 UUID;
  m1 TEXT; m2 TEXT; m3 TEXT; m4 TEXT; m5 TEXT; m6 TEXT; m7 TEXT; m8 TEXT; m9 TEXT; mc TEXT;
  r TEXT;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (t,  'authenticated', 'authenticated', 't-'  || t  || '@verify.test'),
    (s,  'authenticated', 'authenticated', 's-'  || s  || '@verify.test'),
    (t2, 'authenticated', 'authenticated', 't2-' || t2 || '@verify.test'),
    (s2, 'authenticated', 'authenticated', 's2-' || s2 || '@verify.test');

  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v91-a', 'A', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO v_a;
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES (v_a, t, t), (v_a, t2, t2);
  INSERT INTO author_seats (user_id, kind, public_name)
  SELECT DISTINCT ce.user_id, 'teacher', 'Verify seat' FROM course_editors ce
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO teacher_student_links (teacher_id, student_id, source)
  VALUES (t, s, 'join_link'), (t2, s2, 'join_link');

  -- 0. seed sanity -------------------------------------------------------------
  PERFORM pg_temp.check_eq('seed: 2 active links, no ping, no Telegram link yet',
    (SELECT count(*)::text FROM teacher_student_links WHERE ended_at IS NULL AND teacher_id IN (t, t2)) || '/' ||
    (SELECT count(*)::text FROM telegram_message_pings) || '/' ||
    (SELECT count(*)::text FROM telegram_links WHERE user_id IN (t, s, t2, s2)), '2/0/0');

  -- 1. the table and the function are closed ---------------------------------------
  PERFORM pg_temp.check_eq('authenticated and anon cannot read or write the log',
    pg_temp.as_user(t, $q$ SELECT count(*)::text FROM public.telegram_message_pings $q$) || '|' ||
    pg_temp.as_anon($q$ SELECT count(*)::text FROM public.telegram_message_pings $q$) || '|' ||
    pg_temp.as_user(t, $q$ INSERT INTO public.telegram_message_pings (conversation_id, to_role) VALUES (gen_random_uuid(), 'teacher') RETURNING 'x' $q$),
    'ERR:42501|ERR:42501|ERR:42501');
  PERFORM pg_temp.check_eq('authenticated and anon cannot call the claim',
    pg_temp.as_user(t, pg_temp.claim_sql(gen_random_uuid()::text, 'claimed')) || '|' ||
    pg_temp.as_anon(pg_temp.claim_sql(gen_random_uuid()::text, 'claimed')), 'ERR:42501|ERR:42501');
  PERFORM pg_temp.check_eq('...service_role may (positive control for the denials above)',
    has_function_privilege('service_role', 'public.telegram_message_ping_claim(uuid)', 'EXECUTE')::text, 'true');
  PERFORM pg_temp.check_eq('an unknown message answers no_message',
    pg_temp.as_service(pg_temp.claim_sql(gen_random_uuid()::text, 'reason')), 'no_message');

  -- 2. a recipient who never linked the bot gets no ping and no log row -------------
  m1 := pg_temp.as_user(s, pg_temp.send_sql(t, s, 'First question'));
  PERFORM pg_temp.check_eq('seed: the first message exists', (m1 IS NOT NULL AND m1 <> 'null')::text, 'true');
  PERFORM pg_temp.check_eq('t has not linked the bot: not_linked, and nothing is logged',
    pg_temp.as_service(pg_temp.claim_sql(m1, 'reason')) || '|' || (SELECT count(*)::text FROM telegram_message_pings), 'not_linked|0');

  -- 3. a linked recipient is pinged once, with the saved language -----------------
  INSERT INTO telegram_links (user_id, chat_id, lang, time_zone) VALUES (t, 9100001, 'ru', 'Europe/Belgrade');
  m2 := pg_temp.as_user(s, pg_temp.send_sql(t, s, 'Second question'));
  r := pg_temp.as_service(format($q$ SELECT public.telegram_message_ping_claim(%L::uuid)::text $q$, m2));
  PERFORM pg_temp.check_eq('t linked: the claim succeeds and names the recipient, the side, the language and the pair',
    (r::jsonb->>'claimed') || '|' || (r::jsonb->>'recipient_id' = t::text)::text || '|' || (r::jsonb->>'to_role') || '|' ||
    (r::jsonb->>'lang') || '|' || (r::jsonb->>'teacher_id' = t::text AND r::jsonb->>'student_id' = s::text)::text,
    'true|true|teacher|ru|true');
  PERFORM pg_temp.check_eq('...and logs exactly one ping against the conversation, to the teacher side',
    (SELECT count(*)::text || '/' || min(to_role) FROM telegram_message_pings), '1/teacher');

  -- 4. at most one per hour while unread --------------------------------------------
  m3 := pg_temp.as_user(s, pg_temp.send_sql(t, s, 'Third question'));
  PERFORM pg_temp.check_eq('a second message while the first is unread is throttled; no new log row',
    pg_temp.as_service(pg_temp.claim_sql(m3, 'reason')) || '|' || (SELECT count(*)::text FROM telegram_message_pings), 'throttled|1');
  PERFORM pg_temp.check_eq('...and so is a third (the throttle is not consumed by being asked)',
    pg_temp.as_service(pg_temp.claim_sql(m3, 'reason')), 'throttled');

  -- 5. reading ends the throttle early ------------------------------------------------
  SELECT c.id INTO v_conv FROM teacher_conversations c WHERE c.teacher_id = t AND c.student_id = s;
  PERFORM pg_temp.check_eq('t reads the thread: 3 messages marked',
    pg_temp.as_user(t, format($q$ SELECT public.mark_conversation_read(%L, %L)::text $q$, t, s)), '3');
  m4 := pg_temp.as_user(s, pg_temp.send_sql(t, s, 'Fourth question'));
  -- A claim and the count it changes are separate statements: one statement's
  -- subselects see the snapshot from before its own function calls ran.
  r := pg_temp.as_service(pg_temp.claim_sql(m4, 'claimed'));
  PERFORM pg_temp.check_eq('after t read everything, the next message pings again (a second log row)',
    r || '|' || (SELECT count(*)::text FROM telegram_message_pings), 'true|2');

  -- 6. the hour is a real window --------------------------------------------------------
  m5 := pg_temp.as_user(s, pg_temp.send_sql(t, s, 'Fifth question'));
  PERFORM pg_temp.check_eq('t has not read since the last ping: throttled (control for the window test below)',
    pg_temp.as_service(pg_temp.claim_sql(m5, 'reason')), 'throttled');
  UPDATE telegram_message_pings SET sent_at = sent_at - interval '2 hours';
  r := pg_temp.as_service(pg_temp.claim_sql(m5, 'claimed'));
  PERFORM pg_temp.check_eq('both pings are now 2 hours old, messages still unread: the next message pings',
    r || '|' || (SELECT count(*)::text FROM telegram_message_pings), 'true|3');

  -- 7. the other side is throttled on its own ----------------------------------------------
  m6 := pg_temp.as_user(t, pg_temp.send_sql(t, s, 'Teacher reply'));
  PERFORM pg_temp.check_eq('the student has not linked the bot: not_linked, no log row',
    pg_temp.as_service(pg_temp.claim_sql(m6, 'reason')) || '|' || (SELECT count(*)::text FROM telegram_message_pings), 'not_linked|3');
  INSERT INTO telegram_links (user_id, chat_id, lang) VALUES (s, 9100002, 'en');
  m7 := pg_temp.as_user(t, pg_temp.send_sql(t, s, 'Another reply'));
  r := pg_temp.as_service(format($q$ SELECT public.telegram_message_ping_claim(%L::uuid)::text $q$, m7));
  PERFORM pg_temp.check_eq('s linked: a teacher message pings the student side, in en, despite the teacher-side pings',
    (r::jsonb->>'claimed') || '|' || (r::jsonb->>'to_role') || '|' || (r::jsonb->>'lang') || '|' ||
    (r::jsonb->>'recipient_id' = s::text)::text, 'true|student|en|true');
  m8 := pg_temp.as_user(t, pg_temp.send_sql(t, s, 'Yet another'));
  PERFORM pg_temp.check_eq('a second teacher message while s has not read: throttled',
    pg_temp.as_service(pg_temp.claim_sql(m8, 'reason')), 'throttled');

  -- 8. a stopped link receives nothing, and nothing is logged -------------------------------
  UPDATE telegram_links SET stopped_at = now() WHERE user_id = s;
  UPDATE telegram_message_pings SET sent_at = sent_at - interval '2 hours' WHERE to_role = 'student';
  m9 := pg_temp.as_user(t, pg_temp.send_sql(t, s, 'After the stop'));
  PERFORM pg_temp.check_eq('s stopped the bot: not_linked even with the throttle open; log count unchanged',
    pg_temp.as_service(pg_temp.claim_sql(m9, 'reason')) || '|' || (SELECT count(*)::text FROM telegram_message_pings), 'not_linked|4');

  -- 9. account deletion removes the log with the conversation -----------------------------
  INSERT INTO telegram_links (user_id, chat_id, lang) VALUES (t2, 9100003, 'en');
  mc := pg_temp.as_user(s2, pg_temp.send_sql(t2, s2, 'Other pair'));
  PERFORM pg_temp.check_eq('seed: the other pair''s message earns a ping',
    pg_temp.as_service(pg_temp.claim_sql(mc, 'claimed')), 'true');
  SELECT c.id INTO v_conv2 FROM teacher_conversations c WHERE c.teacher_id = t2 AND c.student_id = s2;
  PERFORM pg_temp.check_eq('seed: pings for the two conversations',
    (SELECT count(*) FILTER (WHERE conversation_id = v_conv)::text || '/' || count(*) FILTER (WHERE conversation_id = v_conv2)::text
     FROM telegram_message_pings), '4/1');
  PERFORM pg_temp.check_eq('t deletes the account: ok',
    (pg_temp.as_user(t, $q$ SELECT public.delete_my_account()::text $q$)::jsonb)->>'ok', 'true');
  PERFORM pg_temp.check_eq('...the conversation and its pings are gone; the other pair''s ping remains (positive control)',
    (SELECT count(*) FILTER (WHERE conversation_id = v_conv)::text || '/' || count(*) FILTER (WHERE conversation_id = v_conv2)::text
     FROM telegram_message_pings) || '|' ||
    (SELECT count(*)::text FROM teacher_conversations WHERE id = v_conv), '0/1|0');

  RAISE NOTICE 'TCH-012 PASS';
END;
$$;

ROLLBACK;
