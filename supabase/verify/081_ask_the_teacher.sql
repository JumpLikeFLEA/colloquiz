-- ============================================================
-- supabase/verify/081_ask_the_teacher.sql
--
-- TCH-006 full protocol for migration 081 (needs 058, 076, 079, 080 applied).
-- NOT a migration: run after 081 is applied, as postgres. Seeds its own data
-- and ROLLS BACK. A failed assertion aborts with "TCH-006 FAIL: ...". Every
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

-- An anonymous caller: role anon, no sub.
CREATE FUNCTION pg_temp.as_anon(p_sql TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  PERFORM set_config('role', 'anon', true);
  EXECUTE p_sql INTO v;
  PERFORM set_config('role', 'postgres', true);
  RETURN v;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('role', 'postgres', true);
  RETURN 'ERR:' || SQLSTATE;
END;
$$;

CREATE FUNCTION pg_temp.check_eq(p_label TEXT, p_got TEXT, p_want TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE '% -> got % (want %)', p_label, p_got, p_want;
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'TCH-006 FAIL: % (got %, want %)', p_label, p_got, p_want;
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

-- SQL that sends a message with an attachment (or NULL) and returns the
-- result's p_key.
CREATE FUNCTION pg_temp.send_sql(p_teacher UUID, p_student UUID, p_text TEXT, p_att JSONB, p_key TEXT)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT format('SELECT (public.send_teacher_message(%L, %L, %L::jsonb, %L::jsonb))->>%L',
                p_teacher, p_student, pg_temp.body(p_text)::text, p_att::text, p_key)
$$;

-- The same, in the 079 three-argument form.
CREATE FUNCTION pg_temp.send3_sql(p_teacher UUID, p_student UUID, p_text TEXT, p_key TEXT)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT format('SELECT (public.send_teacher_message(%L, %L, %L::jsonb))->>%L',
                p_teacher, p_student, pg_temp.body(p_text)::text, p_key)
$$;

-- What a client sends for an exercise: the version, the block and optionally
-- the response, with display fields that are deliberately WRONG so the test
-- shows the database overwrites them.
CREATE FUNCTION pg_temp.att(p_kind TEXT, p_ver UUID, p_block JSONB, p_response JSONB DEFAULT NULL)
RETURNS JSONB LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'v', 1, 'kind', p_kind,
    'courseSlug', 'forged-course', 'courseTitle', 'FORGED course',
    'lessonSlug', 'forged-lesson', 'lessonTitle', 'FORGED lesson', 'lessonId', gen_random_uuid(),
    'versionId', p_ver, 'blockId', p_block->>'id', 'number', 99, 'block', p_block)
  || CASE WHEN p_response IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('response', p_response) END
$$;

-- Each seeded message gets its own timestamp (the 079 verify note).
CREATE FUNCTION public._verify081_clock() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER aa_verify081_clock BEFORE INSERT ON teacher_messages
  FOR EACH ROW EXECUTE FUNCTION public._verify081_clock();

DO $$
DECLARE
  t  UUID := gen_random_uuid();   -- teacher: edits E, linked to s, s2 (ends), s3
  th UUID := gen_random_uuid();   -- teacher: edits X; assigned E2 (only) to s; linked to s
  t2 UUID := gen_random_uuid();   -- teacher: edits X2; linked to s; nothing assigned
  t3 UUID := gen_random_uuid();   -- teacher: edits X3; NOT linked to anyone
  s  UUID := gen_random_uuid();   -- student linked to t, th, t2
  s2 UUID := gen_random_uuid();   -- student whose link to t ends
  s3 UUID := gen_random_uuid();   -- student linked to t, no conversation yet
  n  UUID := gen_random_uuid();   -- third party: neither
  v_e UUID; v_x UUID; v_x2 UUID; v_x3 UUID;
  v_e1 UUID; v_e2 UUID;
  v_ve1 UUID; v_ve2 UUID;
  v_doc JSONB; v_ex1 JSONB; v_ex2 JSONB; v_tk1 JSONB; v_th1 JSONB;
  v_res TEXT;
  v_msg UUID;
  v_n INTEGER;
  v_stored JSONB;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (t,  'authenticated', 'authenticated', 't-'  || t  || '@verify.test'),
    (th, 'authenticated', 'authenticated', 'th-' || th || '@verify.test'),
    (t2, 'authenticated', 'authenticated', 't2-' || t2 || '@verify.test'),
    (t3, 'authenticated', 'authenticated', 't3-' || t3 || '@verify.test'),
    (s,  'authenticated', 'authenticated', 's-'  || s  || '@verify.test'),
    (s2, 'authenticated', 'authenticated', 's2-' || s2 || '@verify.test'),
    (s3, 'authenticated', 'authenticated', 's3-' || s3 || '@verify.test'),
    (n,  'authenticated', 'authenticated', 'n-'  || n  || '@verify.test');
  UPDATE profiles SET display_name = 'Teacher T'  WHERE id = t;
  UPDATE profiles SET display_name = 'Teacher TH' WHERE id = th;

  v_th1 := jsonb_build_object('id', 'th1', 'kind', 'theory', 'type', 'paragraph');
  v_ex1 := jsonb_build_object('id', 'ex1', 'kind', 'practice', 'type', 'selection',
             'payload', jsonb_build_object('prompt', 'Pick one'));
  v_tk1 := jsonb_build_object('id', 'tk1', 'kind', 'task', 'type', 'voice', 'maxSeconds', 60);
  v_ex2 := jsonb_build_object('id', 'ex2', 'kind', 'practice', 'type', 'selection',
             'payload', jsonb_build_object('prompt', 'Pick again'));
  -- theory, exercise 1, voice task, exercise 2: ex2 must be numbered 2.
  v_doc := jsonb_build_array(v_th1, v_ex1, v_tk1, v_ex2);

  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v81-e', 'Course E', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO v_e;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v81-x', 'X', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO v_x;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v81-x2', 'X2', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO v_x2;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v81-x3', 'X3', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO v_x3;
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES
    (v_e, t, t), (v_x, th, th), (v_x2, t2, t2), (v_x3, t3, t3);

  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_e, 1, 'Lesson E1', 'e1', 'anyone') RETURNING id INTO v_e1;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_e, 2, 'Lesson E2', 'e2', 'anyone') RETURNING id INTO v_e2;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_e1, v_doc, 'editor') RETURNING id INTO v_ve1;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_e2, v_doc, 'editor') RETURNING id INTO v_ve2;
  UPDATE lessons SET published_version_id = v_ve1 WHERE id = v_e1;
  UPDATE lessons SET published_version_id = v_ve2 WHERE id = v_e2;

  INSERT INTO teacher_student_links (teacher_id, student_id, source) VALUES
    (t, s, 'join_link'), (th, s, 'join_link'), (t2, s, 'join_link'),
    (t, s2, 'join_link'), (t, s3, 'join_link');

  -- th assigns ONE lesson of E (E2) to s. th does not edit E.
  v_res := pg_temp.as_user(th, format(
    $q$ SELECT public.assign_homework(%L, %L, NULL, NULL, ARRAY[%L]::uuid[], ARRAY[]::uuid[])::text $q$,
    v_e, v_e2, s));
  PERFORM pg_temp.check_eq('seed: th assigns E2 to s', (v_res::jsonb->>'ok'), 'true');
  PERFORM pg_temp.check_eq('seed: 4 links and a homework target exist (tables are not empty)',
    ((SELECT count(*) FROM teacher_student_links WHERE student_id IN (s, s2, s3))
     + (SELECT count(*) FROM homework_targets WHERE student_id = s))::text, '6');

  -- 1. who the page offers -----------------------------------------------------
  PERFORM pg_temp.check_eq('options E1 as s: exactly t (edits E); th assigned E2 only, t2 nothing',
    pg_temp.as_user(s, format($q$ SELECT string_agg(teacher_label, ',' ORDER BY teacher_label) FROM public.ask_teacher_options(%L) $q$, v_e1)),
    'Teacher T');
  PERFORM pg_temp.check_eq('options E2 as s: t (edits) AND th (assigned this lesson): a picker',
    pg_temp.as_user(s, format($q$ SELECT string_agg(teacher_label, ',' ORDER BY teacher_label) FROM public.ask_teacher_options(%L) $q$, v_e2)),
    'Teacher T,Teacher TH');
  PERFORM pg_temp.check_eq('options for a lesson of a course nobody here edits or assigned: none',
    pg_temp.as_user(s, format($q$ SELECT count(*)::text FROM public.ask_teacher_options(%L) $q$,
      (SELECT id FROM lessons WHERE course_id = v_x LIMIT 1))), '0');
  PERFORM pg_temp.check_eq('options E1 as n (not linked to anyone): none (positive control: s gets 1)',
    pg_temp.as_user(n, format($q$ SELECT count(*)::text FROM public.ask_teacher_options(%L) $q$, v_e1)), '0');
  PERFORM pg_temp.check_eq('options E1 as the teacher t (not a student of anyone here): none',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.ask_teacher_options(%L) $q$, v_e1)), '0');
  PERFORM pg_temp.check_eq('options E1 as anon: no execute',
    pg_temp.as_anon(format($q$ SELECT count(*)::text FROM public.ask_teacher_options(%L) $q$, v_e1)), 'ERR:42501');

  -- 2. a good exercise question -----------------------------------------------
  v_res := pg_temp.as_user(s, pg_temp.send_sql(t, s, 'Why this one?',
    pg_temp.att('exercise', v_ve1, v_ex1, '{"selectedOptionIds":["a"]}'::jsonb), 'ok'));
  PERFORM pg_temp.check_eq('s asks t about exercise 1 with an answer: ok', v_res, 'true');
  SELECT m.attachment INTO v_stored FROM teacher_messages m
    JOIN teacher_conversations c ON c.id = m.conversation_id
   WHERE c.teacher_id = t AND c.student_id = s;
  PERFORM pg_temp.check_eq('stored: course title comes from the database, not the request',
    v_stored->>'courseTitle', 'Course E');
  PERFORM pg_temp.check_eq('stored: lesson title from the database', v_stored->>'lessonTitle', 'Lesson E1');
  PERFORM pg_temp.check_eq('stored: slugs from the database',
    (v_stored->>'courseSlug') || '/' || (v_stored->>'lessonSlug'), 'v81-e/e1');
  PERFORM pg_temp.check_eq('stored: lesson id from the database',
    v_stored->>'lessonId', v_e1::text);
  PERFORM pg_temp.check_eq('stored: Exercise number from the document (1), not the forged 99',
    v_stored->>'number', '1');
  PERFORM pg_temp.check_eq('stored: the block is the version''s own', (v_stored->'block')::text, v_ex1::text);
  PERFORM pg_temp.check_eq('stored: the response is kept', (v_stored->'response')::text, '{"selectedOptionIds": ["a"]}');

  -- exercise 2 sits after a voice task: still number 2 (practice blocks only)
  v_res := pg_temp.as_user(s, pg_temp.send_sql(t, s, 'And this one?',
    pg_temp.att('exercise', v_ve1, v_ex2), 'ok'));
  PERFORM pg_temp.check_eq('exercise 2, no answer included: ok', v_res, 'true');
  PERFORM pg_temp.check_eq('exercise 2 is numbered 2 although a voice task precedes it',
    (SELECT m.attachment->>'number' FROM teacher_messages m
       JOIN teacher_conversations c ON c.id = m.conversation_id
      WHERE c.teacher_id = t AND c.student_id = s AND m.attachment->>'blockId' = 'ex2'), '2');
  PERFORM pg_temp.check_eq('exercise 2 stored no response key at all',
    (SELECT (m.attachment ? 'response')::text FROM teacher_messages m
       JOIN teacher_conversations c ON c.id = m.conversation_id
      WHERE c.teacher_id = t AND c.student_id = s AND m.attachment->>'blockId' = 'ex2'), 'false');

  -- 3. the voice task -----------------------------------------------------------
  v_res := pg_temp.as_user(s, pg_temp.send_sql(t, s, 'The voice task',
    pg_temp.att('voice_task', v_ve1, v_tk1), 'ok'));
  PERFORM pg_temp.check_eq('voice task question: ok', v_res, 'true');
  PERFORM pg_temp.check_eq('voice task: number is null',
    (SELECT (m.attachment->'number')::text FROM teacher_messages m
       JOIN teacher_conversations c ON c.id = m.conversation_id
      WHERE c.teacher_id = t AND c.student_id = s AND m.attachment->>'blockId' = 'tk1'), 'null');
  PERFORM pg_temp.check_eq('voice task with a response: refused (the recording is not attached)',
    pg_temp.as_user(s, pg_temp.send_sql(t, s, 'x', pg_temp.att('voice_task', v_ve1, v_tk1, '{"a":1}'::jsonb), 'error')),
    'attachment_invalid');

  -- 4. a snapshot cannot be forged ---------------------------------------------
  PERFORM pg_temp.check_eq('a changed prompt: refused',
    pg_temp.as_user(s, pg_temp.send_sql(t, s, 'x',
      pg_temp.att('exercise', v_ve1, jsonb_set(v_ex1, '{payload,prompt}', '"Pick the answer key"')), 'error')),
    'attachment_invalid');
  PERFORM pg_temp.check_eq('an unknown version id: refused',
    pg_temp.as_user(s, pg_temp.send_sql(t, s, 'x', pg_temp.att('exercise', gen_random_uuid(), v_ex1), 'error')),
    'attachment_invalid');
  PERFORM pg_temp.check_eq('a block id that is not in the version: refused',
    pg_temp.as_user(s, pg_temp.send_sql(t, s, 'x',
      pg_temp.att('exercise', v_ve1, jsonb_set(v_ex1, '{id}', '"nope"')), 'error')),
    'attachment_invalid');
  PERFORM pg_temp.check_eq('a theory block cannot be asked about',
    pg_temp.as_user(s, pg_temp.send_sql(t, s, 'x', pg_temp.att('exercise', v_ve1, v_th1), 'error')),
    'attachment_invalid');
  PERFORM pg_temp.check_eq('a practice block sent as a voice task: refused',
    pg_temp.as_user(s, pg_temp.send_sql(t, s, 'x', pg_temp.att('voice_task', v_ve1, v_ex1), 'error')),
    'attachment_invalid');
  PERFORM pg_temp.check_eq('a JSON null response: refused',
    pg_temp.as_user(s, pg_temp.send_sql(t, s, 'x', pg_temp.att('exercise', v_ve1, v_ex1) || '{"response": null}'::jsonb, 'error')),
    'attachment_invalid');
  PERFORM pg_temp.check_eq('a response over 8,000 characters: refused',
    pg_temp.as_user(s, pg_temp.send_sql(t, s, 'x',
      pg_temp.att('exercise', v_ve1, v_ex1, to_jsonb(repeat('a', 8001))), 'error')),
    'attachment_invalid');
  PERFORM pg_temp.check_eq('a response of exactly 8,000 characters including its quotes: accepted (boundary)',
    pg_temp.as_user(s, pg_temp.send_sql(t, s, 'boundary',
      pg_temp.att('exercise', v_ve1, v_ex1, to_jsonb(repeat('a', 7998))), 'ok')), 'true');
  PERFORM pg_temp.check_eq('an attachment that is not an object: refused',
    pg_temp.as_user(s, pg_temp.send_sql(t, s, 'x', '[1]'::jsonb, 'error')), 'attachment_invalid');
  PERFORM pg_temp.check_eq('an unknown kind: refused',
    pg_temp.as_user(s, pg_temp.send_sql(t, s, 'x',
      jsonb_set(pg_temp.att('exercise', v_ve1, v_ex1), '{kind}', '"homework"'), 'error')),
    'attachment_invalid');

  -- 5. who may attach, to whom --------------------------------------------------
  PERFORM pg_temp.check_eq('th, who assigned E2 only: s may ask about E2 (positive control)',
    pg_temp.as_user(s, pg_temp.send_sql(th, s, 'about E2', pg_temp.att('exercise', v_ve2, v_ex1), 'ok')), 'true');
  PERFORM pg_temp.check_eq('th: s may NOT ask about E1, which th neither edits nor assigned',
    pg_temp.as_user(s, pg_temp.send_sql(th, s, 'about E1', pg_temp.att('exercise', v_ve1, v_ex1), 'error')),
    'attachment_not_allowed');
  PERFORM pg_temp.check_eq('t2 (linked, nothing assigned, does not edit E): refused',
    pg_temp.as_user(s, pg_temp.send_sql(t2, s, 'x', pg_temp.att('exercise', v_ve1, v_ex1), 'error')),
    'attachment_not_allowed');
  PERFORM pg_temp.check_eq('t2 can still be sent a PLAIN message (the link is live)',
    pg_temp.as_user(s, pg_temp.send3_sql(t2, s, 'a plain hello', 'ok')), 'true');
  PERFORM pg_temp.check_eq('the teacher cannot attach (same payload from s succeeded above)',
    pg_temp.as_user(t, pg_temp.send_sql(t, s, 'x', pg_temp.att('exercise', v_ve1, v_ex1), 'error')),
    'attachment_not_allowed');
  PERFORM pg_temp.check_eq('t3 is not linked to s: not_linked comes first',
    pg_temp.as_user(s, pg_temp.send_sql(t3, s, 'x', pg_temp.att('exercise', v_ve1, v_ex1), 'error')),
    'not_linked');
  PERFORM pg_temp.check_eq('a third party cannot post',
    pg_temp.as_user(n, pg_temp.send_sql(t, s, 'x', pg_temp.att('exercise', v_ve1, v_ex1), 'error')),
    'forbidden');

  -- 6. a refused attachment leaves no empty conversation ------------------------
  PERFORM pg_temp.check_eq('s3 has no conversation with t yet',
    (SELECT count(*)::text FROM teacher_conversations WHERE teacher_id = t AND student_id = s3), '0');
  PERFORM pg_temp.check_eq('s3: a bad attachment is refused',
    pg_temp.as_user(s3, pg_temp.send_sql(t, s3, 'x',
      pg_temp.att('exercise', v_ve1, jsonb_set(v_ex1, '{payload,prompt}', '"changed"')), 'error')),
    'attachment_invalid');
  PERFORM pg_temp.check_eq('...and still no conversation row exists',
    (SELECT count(*)::text FROM teacher_conversations WHERE teacher_id = t AND student_id = s3), '0');
  PERFORM pg_temp.check_eq('s3: the same message with a good attachment creates it (positive control)',
    pg_temp.as_user(s3, pg_temp.send_sql(t, s3, 'first message', pg_temp.att('exercise', v_ve1, v_ex1), 'ok')), 'true');
  PERFORM pg_temp.check_eq('...exactly one conversation now',
    (SELECT count(*)::text FROM teacher_conversations WHERE teacher_id = t AND student_id = s3), '1');

  -- 7. the 079 three-argument form still sends, with no attachment --------------
  PERFORM pg_temp.check_eq('the three-argument form sends a plain message',
    pg_temp.as_user(t, pg_temp.send3_sql(t, s, 'The teacher replies', 'ok')), 'true');
  PERFORM pg_temp.check_eq('...and stores a NULL attachment',
    (SELECT (m.attachment IS NULL)::text FROM teacher_messages m
       JOIN teacher_conversations c ON c.id = m.conversation_id
      WHERE c.teacher_id = t AND c.student_id = s AND m.author_id = t), 'true');

  -- 8. both parties read it; a third user does not ------------------------------
  PERFORM pg_temp.check_eq('t reads s''s thread: 4 messages carry an attachment (ex1, ex2, voice, boundary)',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.conversation_messages(%L, %L) WHERE attachment IS NOT NULL $q$, t, s)), '4');
  PERFORM pg_temp.check_eq('s reads her own thread: the same 4',
    pg_temp.as_user(s, format($q$ SELECT count(*)::text FROM public.conversation_messages(%L, %L) WHERE attachment IS NOT NULL $q$, t, s)), '4');
  PERFORM pg_temp.check_eq('t sees the title written by the database',
    pg_temp.as_user(t, format($q$ SELECT attachment->>'courseTitle' FROM public.conversation_messages(%L, %L) WHERE attachment->>'blockId' = 'ex1' $q$, t, s)),
    'Course E');
  PERFORM pg_temp.check_eq('a third user n reads nothing (positive control above: 4 rows exist)',
    pg_temp.as_user(n, format($q$ SELECT count(*)::text FROM public.conversation_messages(%L, %L) $q$, t, s)), '0');
  PERFORM pg_temp.check_eq('the other teacher th reads nothing of the t–s thread',
    pg_temp.as_user(th, format($q$ SELECT count(*)::text FROM public.conversation_messages(%L, %L) $q$, t, s)), '0');
  PERFORM pg_temp.check_eq('export (student side): the 4 attachments to t and the 1 to th are in it',
    pg_temp.as_user(s, $q$ SELECT count(*)::text FROM public.my_conversations_export() WHERE attachment IS NOT NULL $q$), '5');
  PERFORM pg_temp.check_eq('export: the teacher t, who is no one''s student here, exports none',
    pg_temp.as_user(t, $q$ SELECT count(*)::text FROM public.my_conversations_export() $q$), '0');

  -- 9. a later edit does not change what the teacher sees -----------------------
  UPDATE lessons SET title = 'Renamed lesson' WHERE id = v_e1;
  UPDATE courses SET title = 'Renamed course' WHERE id = v_e;
  UPDATE lesson_versions SET document = jsonb_build_array(v_th1) WHERE id = v_ve1;
  PERFORM pg_temp.check_eq('after renaming and emptying the lesson, the snapshot still says Lesson E1',
    pg_temp.as_user(t, format($q$ SELECT attachment->>'lessonTitle' FROM public.conversation_messages(%L, %L) WHERE attachment->>'blockId' = 'ex1' $q$, t, s)),
    'Lesson E1');
  PERFORM pg_temp.check_eq('...and still carries the exercise itself',
    pg_temp.as_user(t, format($q$ SELECT attachment->'block'->'payload'->>'prompt' FROM public.conversation_messages(%L, %L) WHERE attachment->>'blockId' = 'ex1' $q$, t, s)),
    'Pick one');
  PERFORM pg_temp.check_eq('and a new question on the emptied block is now refused (it is no longer in the version)',
    pg_temp.as_user(s, pg_temp.send_sql(t, s, 'x', pg_temp.att('exercise', v_ve1, v_ex1), 'error')),
    'attachment_invalid');

  -- 10. a link that ends: the conversation stays readable, takes nothing --------
  v_res := pg_temp.as_user(s2, pg_temp.send_sql(t, s2, 'Before the link ends', pg_temp.att('exercise', v_ve2, v_ex1), 'ok'));
  PERFORM pg_temp.check_eq('s2 asks while linked', v_res, 'true');
  UPDATE teacher_student_links SET ended_at = now(), ended_by = s2
   WHERE teacher_id = t AND student_id = s2 AND ended_at IS NULL;
  PERFORM pg_temp.check_eq('after the link ends: a new attachment is refused as closed',
    pg_temp.as_user(s2, pg_temp.send_sql(t, s2, 'x', pg_temp.att('exercise', v_ve2, v_ex1), 'error')), 'closed');
  PERFORM pg_temp.check_eq('after the link ends: no options are offered',
    pg_temp.as_user(s2, format($q$ SELECT count(*)::text FROM public.ask_teacher_options(%L) $q$, v_e2)), '0');
  PERFORM pg_temp.check_eq('after the link ends: the old attachment is still readable by s2',
    pg_temp.as_user(s2, format($q$ SELECT count(*)::text FROM public.conversation_messages(%L, %L) WHERE attachment IS NOT NULL $q$, t, s2)), '1');

  -- 11. the column's own limits and privileges ----------------------------------
  SELECT m.id INTO v_msg FROM teacher_messages m
    JOIN teacher_conversations c ON c.id = m.conversation_id
   WHERE c.teacher_id = t AND c.student_id = s AND m.author_id = t;
  BEGIN
    UPDATE teacher_messages SET attachment = jsonb_build_object('pad', repeat('a', 41000)) WHERE id = v_msg;
    RAISE EXCEPTION 'TCH-006 FAIL: a 41,000-character attachment was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'oversized attachment -> check_violation (want check_violation)';
  END;
  PERFORM pg_temp.check_eq('authenticated has no table read on teacher_messages',
    (SELECT has_table_privilege('authenticated', 'public.teacher_messages', 'SELECT'))::text, 'false');
  PERFORM pg_temp.check_eq('authenticated has no table write on teacher_messages',
    (SELECT has_table_privilege('authenticated', 'public.teacher_messages', 'INSERT'))::text, 'false');
  PERFORM pg_temp.check_eq('anon cannot send (4-argument form)',
    (SELECT has_function_privilege('anon', 'public.send_teacher_message(uuid,uuid,jsonb,jsonb)', 'EXECUTE'))::text, 'false');
  PERFORM pg_temp.check_eq('authenticated can send (positive control)',
    (SELECT has_function_privilege('authenticated', 'public.send_teacher_message(uuid,uuid,jsonb,jsonb)', 'EXECUTE'))::text, 'true');
  PERFORM pg_temp.check_eq('authenticated cannot call the internal gate',
    (SELECT has_function_privilege('authenticated', 'public._ask_teacher_allowed(uuid,uuid,uuid)', 'EXECUTE'))::text, 'false');
  PERFORM pg_temp.check_eq('authenticated cannot call the internal normaliser',
    (SELECT has_function_privilege('authenticated', 'public._attachment_normalise(uuid,uuid,jsonb)', 'EXECUTE'))::text, 'false');

  -- 12. deleting the conversation takes the attachments with it -----------------
  DELETE FROM teacher_conversations WHERE teacher_id = t AND student_id = s;
  PERFORM pg_temp.check_eq('conversation deleted: its messages and attachments are gone',
    (SELECT count(*)::text FROM teacher_messages m
       WHERE m.attachment->>'courseSlug' = 'v81-e' AND m.conversation_id NOT IN (SELECT id FROM teacher_conversations)), '0');
  PERFORM pg_temp.check_eq('...while other conversations'' attachments remain (positive control: s2 and s3 and th)',
    (SELECT count(*)::text FROM teacher_messages WHERE attachment IS NOT NULL), '3');

  RAISE NOTICE 'TCH-006 PASS: 081 full protocol';
END;
$$;

ROLLBACK;
