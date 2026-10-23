-- ============================================================
-- supabase/verify/101_telegram_homework_pings.sql
--
-- TCH-013 full protocol for migration 101 (needs 058, 075..080, 082/083, 090 and 096
-- applied). NOT a migration: run after 101 is applied, as postgres. Seeds its own data
-- and ROLLS BACK. A failed assertion aborts with "TCH-013 FAIL: ...". Every denial is
-- paired with a positive control (a student is left out for ONE reason, then that reason
-- is removed and the student is claimed). The clock is moved through the claim's p_now;
-- nothing here waits.
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
    RAISE EXCEPTION 'TCH-013 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

-- t assigns through the real RPC (so the data is what the route produces); returns the id.
CREATE FUNCTION pg_temp.assign(p_teacher UUID, p_course UUID, p_lesson UUID, p_due DATE,
                               p_students UUID[], p_groups UUID[])
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  v := pg_temp.as_user(p_teacher, format(
    $q$ SELECT public.assign_homework(%L, %L, %L, NULL, %L::uuid[], %L::uuid[])::text $q$,
    p_course, p_lesson, p_due, p_students, p_groups));
  IF v LIKE 'ERR:%' OR (v::jsonb->>'ok') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'TCH-013 FAIL: seed assign_homework answered %', v;
  END IF;
  RETURN (v::jsonb->>'id')::uuid;
END;
$$;

-- One student answers the lesson's single exercise: the lesson is then complete (075).
CREATE FUNCTION pg_temp.complete(p_user UUID, p_version UUID) RETURNS VOID LANGUAGE sql AS $$
  INSERT INTO lesson_attempts (id, user_id, lesson_version_id, block_id, earned, possible, response, created_at)
  VALUES (gen_random_uuid(), p_user, p_version, 'ex1', 1, 1, '{"selectedOptionIds":["a"]}', now());
$$;

-- "name:label,..." (or "-") of what a claim returned; run as postgres (the claims are
-- SECURITY DEFINER). Names and labels come in as VALUES lists; an unlisted id shows as ?.
CREATE FUNCTION pg_temp.run_due(p_now TIMESTAMPTZ, p_names TEXT, p_labels TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  EXECUTE format(
    $f$ SELECT COALESCE(string_agg(COALESCE(n.name, 'user?') || ':' || COALESCE(l.label, '?'), ',' ORDER BY n.name, l.label), '-')
        FROM public.telegram_homework_due_claim(100, %L) x
        LEFT JOIN (VALUES %s) n(id, name) ON n.id = x.recipient_id
        LEFT JOIN (VALUES %s) l(id, label) ON l.id = x.assignment_id $f$,
    p_now, p_names, p_labels) INTO v;
  RETURN v;
END;
$$;

CREATE FUNCTION pg_temp.run_new(p_assignment UUID, p_names TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  EXECUTE format(
    $f$ SELECT COALESCE(string_agg(COALESCE(n.name, 'user?'), ',' ORDER BY n.name), '-')
        FROM public.telegram_homework_new_claim(%L) x
        LEFT JOIN (VALUES %s) n(id, name) ON n.id = x.recipient_id $f$,
    p_assignment, p_names) INTO v;
  RETURN v;
END;
$$;

DO $$
DECLARE
  t  UUID := gen_random_uuid();   -- teacher: edits E, D, D2, F; linked to everyone below
  a  UUID := gen_random_uuid();   -- linked bot (en, UTC)
  b  UUID := gen_random_uuid();   -- linked bot (ru, UTC); completes E1
  c  UUID := gen_random_uuid();   -- NEVER linked the bot (new-ping control)
  d  UUID := gen_random_uuid();   -- bot link STOPPED (new-ping control)
  e  UUID := gen_random_uuid();   -- linked bot, link to t ENDS
  f  UUID := gen_random_uuid();   -- linked bot, member of group G
  g  UUID := gen_random_uuid();   -- linked bot; completes E1 only (1 of 2)
  h  UUID := gen_random_uuid();   -- linked bot; completes E1 and E2
  z  UUID := gen_random_uuid();   -- linked bot, Pacific/Auckland
  w  UUID := gen_random_uuid();   -- linked bot, a time zone the database does not know
  k  UUID := gen_random_uuid();   -- NEVER linked the bot (due-ping control)
  m  UUID := gen_random_uuid();   -- bot link STOPPED (due-ping control)
  u  UUID := gen_random_uuid();   -- linked bot; the 12-hour rule
  o  UUID := gen_random_uuid();   -- not a teacher, not linked to anyone
  v_e UUID; v_d UUID; v_d2 UUID; v_f UUID;
  v_e1 UUID; v_e2 UUID; v_d1 UUID; v_d2l UUID; v_f1 UUID;
  v_ve1 UUID; v_ve2 UUID; v_vd1 UUID; v_vd2 UUID; v_vf1 UUID;
  v_g UUID;
  hw1 UUID; hw_draft UUID; hw_old UUID; hw_arch UUID;
  hx UUID; hx2 UUID; hy UUID; hc UUID; hdr UUID; har UUID; hz UUID;
  names TEXT;
  labels TEXT := '(NULL::uuid,''-'')';
  p1 TIMESTAMPTZ := TIMESTAMPTZ '2030-06-10 20:00:00+00';
  r TEXT;
  n_all INT; n_f INT; n_b INT; n_a INT;
  v_row RECORD;
BEGIN
  INSERT INTO auth.users (id, aud, role, email)
  SELECT x, 'authenticated', 'authenticated', 'u-' || x || '@verify.test'
  FROM unnest(ARRAY[t, a, b, c, d, e, f, g, h, z, w, k, m, u, o]) AS x;
  names := format(
    '(%L::uuid,''a''),(%L::uuid,''b''),(%L::uuid,''c''),(%L::uuid,''d''),(%L::uuid,''e''),(%L::uuid,''f''),'
    '(%L::uuid,''g''),(%L::uuid,''h''),(%L::uuid,''z''),(%L::uuid,''w''),(%L::uuid,''k''),(%L::uuid,''m''),(%L::uuid,''u'')',
    a, b, c, d, e, f, g, h, z, w, k, m, u);

  -- courses: E published (2 lessons), D draft, D2 draft, F published ------------------------
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v101-e', 'Course E', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO v_e;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v101-d', 'Course D', 'A2', 'draft', 'self_paced', 's', 'c') RETURNING id INTO v_d;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v101-d2', 'Course D2', 'A2', 'draft', 'self_paced', 's', 'c') RETURNING id INTO v_d2;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v101-f', 'Course F', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO v_f;
  INSERT INTO course_editors (course_id, user_id, granted_by)
    VALUES (v_e, t, t), (v_d, t, t), (v_d2, t, t), (v_f, t, t);
  INSERT INTO author_seats (user_id, kind, public_name) VALUES (t, 'teacher', 'Verify seat');

  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_e, 1, 'E1 title', 'e1', 'anyone') RETURNING id INTO v_e1;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_e, 2, 'E2 title', 'e2', 'anyone') RETURNING id INTO v_e2;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_d, 1, 'D1 title', 'd1', 'anyone') RETURNING id INTO v_d1;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_d2, 1, 'D2 title', 'd2', 'anyone') RETURNING id INTO v_d2l;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (v_f, 1, 'F1 title', 'f1', 'anyone') RETURNING id INTO v_f1;
  INSERT INTO lesson_versions (lesson_id, document, source) SELECT x.id, jsonb_build_array(
      jsonb_build_object('id', 'th1', 'kind', 'theory', 'type', 'paragraph'),
      jsonb_build_object('id', 'ex1', 'kind', 'practice', 'type', 'selection',
        'payload', jsonb_build_object('prompt', 'Pick'))), 'editor'
    FROM (VALUES (v_e1), (v_e2), (v_d1), (v_d2l), (v_f1)) AS x(id);
  SELECT id INTO v_ve1 FROM lesson_versions WHERE lesson_id = v_e1;
  SELECT id INTO v_ve2 FROM lesson_versions WHERE lesson_id = v_e2;
  SELECT id INTO v_vd1 FROM lesson_versions WHERE lesson_id = v_d1;
  SELECT id INTO v_vd2 FROM lesson_versions WHERE lesson_id = v_d2l;
  SELECT id INTO v_vf1 FROM lesson_versions WHERE lesson_id = v_f1;
  UPDATE lessons SET published_version_id = v_ve1 WHERE id = v_e1;
  UPDATE lessons SET published_version_id = v_ve2 WHERE id = v_e2;
  UPDATE lessons SET published_version_id = v_vd1 WHERE id = v_d1;
  UPDATE lessons SET published_version_id = v_vd2 WHERE id = v_d2l;
  UPDATE lessons SET published_version_id = v_vf1 WHERE id = v_f1;

  -- links: t is linked to every student; telegram links as described above ---------------------
  INSERT INTO teacher_student_links (teacher_id, student_id, source)
  SELECT t, x, 'join_link' FROM unnest(ARRAY[a, b, c, d, e, f, g, h, z, w, k, m, u]) AS x;
  INSERT INTO telegram_links (user_id, chat_id, lang, time_zone, stopped_at) VALUES
    (a, 9101, 'en', 'UTC',               NULL),
    (b, 9102, 'ru', 'UTC',               NULL),
    (d, 9104, 'en', 'UTC',               now()),
    (e, 9105, 'en', 'UTC',               NULL),
    (f, 9106, 'ru', 'UTC',               NULL),
    (g, 9107, 'en', 'UTC',               NULL),
    (h, 9108, 'en', 'UTC',               NULL),
    (z, 9109, 'en', 'Pacific/Auckland',  NULL),
    (w, 9110, 'en', 'Mars/Phobos',       NULL),
    (m, 9111, 'en', 'UTC',               now()),
    (u, 9112, 'en', 'UTC',               NULL);
  INSERT INTO teacher_groups (teacher_id, name) VALUES (t, 'G') RETURNING id INTO v_g;
  INSERT INTO teacher_group_members (group_id, teacher_id, student_id) VALUES (v_g, t, f);
  PERFORM pg_temp.check_eq('seed: 11 telegram links (table is not empty)',
    (SELECT count(*)::text FROM telegram_links WHERE user_id IN (a,b,d,e,f,g,h,z,w,m,u)), '11');

  -- ============================================================
  -- A. The "new homework" claim
  -- ============================================================
  hw1 := pg_temp.assign(t, v_e, v_e1, DATE '2031-01-01', ARRAY[a, b, c, d, e], ARRAY[v_g]);
  PERFORM pg_temp.check_eq('A0: before anything, 6 students receive hw1 (c and d are recipients too)',
    (SELECT count(*)::text FROM _homework_recipients(t, NULL) WHERE assignment_id = hw1), '6');
  -- e's link to the teacher ends: e stops being a recipient.
  UPDATE teacher_student_links SET ended_at = now(), ended_by = e WHERE teacher_id = t AND student_id = e;
  PERFORM pg_temp.check_eq('A0: after e''s link ends, 5 receive hw1',
    (SELECT count(*)::text FROM _homework_recipients(t, NULL) WHERE assignment_id = hw1), '5');

  PERFORM pg_temp.check_eq('A1: service_role claims hw1: a, b and f only (3 rows)',
    pg_temp.as_service(format($q$ SELECT count(*)::text FROM public.telegram_homework_new_claim(%L) $q$, hw1)), '3');
  PERFORM pg_temp.check_eq('A1: the log names exactly a, b, f as kind new',
    (SELECT string_agg(n.name, ',' ORDER BY n.name)
       FROM telegram_homework_pings p JOIN (SELECT * FROM (VALUES (a,'a'),(b,'b'),(f,'f')) v(id,name)) n ON n.id = p.student_id
      WHERE p.assignment_id = hw1 AND p.kind = 'new'), 'a,b,f');
  PERFORM pg_temp.check_eq('A1: the log has no other row for hw1',
    (SELECT count(*)::text FROM telegram_homework_pings WHERE assignment_id = hw1), '3');
  PERFORM pg_temp.check_eq('A2: calling again claims nothing (once per assignment and student)',
    pg_temp.run_new(hw1, names), '-');
  -- positive controls: c and d are claimed once their only obstacle is removed
  INSERT INTO telegram_links (user_id, chat_id, lang, time_zone) VALUES (c, 9103, 'en', 'UTC');
  PERFORM pg_temp.check_eq('A3: c, who had no bot link, is claimed once they link (control)',
    pg_temp.run_new(hw1, names), 'c');
  UPDATE telegram_links SET stopped_at = NULL WHERE user_id = d;
  PERFORM pg_temp.check_eq('A3: d, whose link was stopped, is claimed once it is on again (control)',
    pg_temp.run_new(hw1, names), 'd');
  PERFORM pg_temp.check_eq('A3: e (link to t ended) is still not claimed, and never was',
    (SELECT count(*)::text FROM telegram_homework_pings WHERE assignment_id = hw1 AND student_id = e), '0');
  -- content of a claimed row
  hdr := pg_temp.assign(t, v_e, v_e2, DATE '2031-02-02', ARRAY[b], ARRAY[]::uuid[]);
  SELECT * INTO v_row FROM telegram_homework_new_claim(hdr);
  PERFORM pg_temp.check_eq('A4: row content: recipient b, ru, course slug',
    (v_row.recipient_id = b)::text || ',' || v_row.lang || ',' || v_row.course_slug, 'true,ru,v101-e');
  PERFORM pg_temp.check_eq('A4: ...titles and due date',
    v_row.course_title || '|' || v_row.lesson_title || '|' || v_row.due_on, 'Course E|E2 title|2031-02-02');

  -- a draft course: students do not see it (my_homework), so no ping; control: publish it
  hw_draft := pg_temp.assign(t, v_d, v_d1, NULL, ARRAY[a], ARRAY[]::uuid[]);
  PERFORM pg_temp.check_eq('A5: a draft course announces nothing',
    pg_temp.run_new(hw_draft, names), '-');
  UPDATE courses SET status = 'published' WHERE id = v_d;
  PERFORM pg_temp.check_eq('A5: after the course is published, a is claimed (control)',
    pg_temp.run_new(hw_draft, names), 'a');

  -- an assignment older than an hour is not announced; control: bring it back inside the hour
  hw_old := pg_temp.assign(t, v_e, v_e1, NULL, ARRAY[z], ARRAY[]::uuid[]);
  UPDATE homework_assignments SET created_at = now() - interval '2 hours' WHERE id = hw_old;
  PERFORM pg_temp.check_eq('A6: homework assigned 2 hours ago is not announced', pg_temp.run_new(hw_old, names), '-');
  UPDATE homework_assignments SET created_at = now() - interval '5 minutes' WHERE id = hw_old;
  PERFORM pg_temp.check_eq('A6: the same homework 5 minutes after the assign is (control)', pg_temp.run_new(hw_old, names), 'z');

  -- an archived lesson announces nothing; control: un-archive it
  hw_arch := pg_temp.assign(t, v_f, v_f1, NULL, ARRAY[w], ARRAY[]::uuid[]);
  UPDATE lessons SET archived_at = now() WHERE id = v_f1;
  PERFORM pg_temp.check_eq('A7: an archived lesson announces nothing', pg_temp.run_new(hw_arch, names), '-');
  UPDATE lessons SET archived_at = NULL WHERE id = v_f1;
  PERFORM pg_temp.check_eq('A7: un-archived, w is claimed (control)', pg_temp.run_new(hw_arch, names), 'w');

  -- an unknown assignment id claims nothing
  PERFORM pg_temp.check_eq('A8: an unknown assignment claims nothing', pg_temp.run_new(gen_random_uuid(), names), '-');

  -- ============================================================
  -- B. The "due tomorrow" claim, at p1 = 2030-06-10 20:00 UTC
  --    UTC students: tomorrow is 2030-06-11. Auckland (UTC+12): it is 08:00 on the 11th, tomorrow is the 12th.
  -- ============================================================
  hx  := pg_temp.assign(t, v_e, v_e1, DATE '2030-06-11', ARRAY[a, b, k, m, z, w], ARRAY[]::uuid[]);
  hx2 := pg_temp.assign(t, v_e, v_e2, DATE '2030-06-11', ARRAY[b], ARRAY[]::uuid[]);
  hy  := pg_temp.assign(t, v_e, v_e1, DATE '2030-06-12', ARRAY[a, z], ARRAY[]::uuid[]);
  hc  := pg_temp.assign(t, v_e, NULL, DATE '2030-06-11', ARRAY[f, g, h], ARRAY[]::uuid[]);
  labels := labels || format(',(%L::uuid,''X''),(%L::uuid,''X2''),(%L::uuid,''Y''),(%L::uuid,''C'')', hx, hx2, hy, hc);
  PERFORM pg_temp.complete(b, v_ve1);        -- b: X (E1) is done, X2 (E2) is not
  PERFORM pg_temp.complete(g, v_ve1);        -- g: course C is 1 of 2
  PERFORM pg_temp.complete(h, v_ve1);
  PERFORM pg_temp.complete(h, v_ve2);        -- h: course C is 2 of 2
  PERFORM pg_temp.check_eq('B0: seed: b, g, h have attempts (table is not empty)',
    (SELECT count(*)::text FROM lesson_attempts WHERE user_id IN (b, g, h)), '4');

  PERFORM pg_temp.check_eq('B1: cron run 1 (service_role) claims 6 rows',
    pg_temp.as_service(format($q$ SELECT count(*)::text FROM public.telegram_homework_due_claim(100, %L) $q$, p1)), '6');
  PERFORM pg_temp.check_eq('B1: ...a:X (UTC), b:X2 (X is done), f:C, g:C (1 of 2), w:X (unknown zone reads as UTC), z:Y (Auckland)',
    (SELECT string_agg(COALESCE(n.name, 'user?') || ':' || COALESCE(l.label, '?'), ',' ORDER BY n.name, l.label)
       FROM telegram_homework_pings p
       LEFT JOIN (VALUES (a,'a'),(b,'b'),(f,'f'),(g,'g'),(h,'h'),(z,'z'),(w,'w'),(k,'k'),(m,'m')) n(id,name) ON n.id = p.student_id
       LEFT JOIN (VALUES (hx,'X'),(hx2,'X2'),(hy,'Y'),(hc,'C')) l(id,label) ON l.id = p.assignment_id
      WHERE p.kind = 'due' AND p.assignment_id IN (hx, hx2, hy, hc)),
    'a:X,b:X2,f:C,g:C,w:X,z:Y');
  PERFORM pg_temp.check_eq('B1: one ping per student: 6 rows, 6 distinct students',
    (SELECT count(*)::text || '/' || count(DISTINCT student_id)::text FROM telegram_homework_pings
      WHERE kind = 'due' AND assignment_id IN (hx, hx2, hy, hc)), '6/6');
  PERFORM pg_temp.check_eq('B2: cron run 2 at the same moment claims nothing',
    pg_temp.run_due(p1, names, labels), '-');
  PERFORM pg_temp.check_eq('B2: a done lesson (b, X) and a finished course (h, C) sent nothing',
    (SELECT count(*)::text FROM telegram_homework_pings WHERE kind = 'due' AND (
       (assignment_id = hx AND student_id = b) OR (assignment_id = hc AND student_id = h))), '0');
  PERFORM pg_temp.check_eq('B2: k (never linked) and m (stopped) sent nothing',
    (SELECT count(*)::text FROM telegram_homework_pings WHERE kind = 'due' AND student_id IN (k, m)), '0');

  -- the next day's run: only what has just become "tomorrow" and was not sent
  PERFORM pg_temp.check_eq('B3: run 3, a day later: only a:Y (due on the 12th, tomorrow for a now)',
    pg_temp.run_due(p1 + interval '1 day', names, labels), 'a:Y');
  PERFORM pg_temp.check_eq('B3: run 4, the same moment: nothing',
    pg_temp.run_due(p1 + interval '1 day', names, labels), '-');

  -- positive controls for each exclusion, at p1 again
  INSERT INTO telegram_links (user_id, chat_id, lang, time_zone) VALUES (k, 9113, 'en', 'UTC');
  SELECT * INTO v_row FROM telegram_homework_due_claim(100, p1);
  PERFORM pg_temp.check_eq('B4: k, once linked, is claimed for X (control) ',
    (v_row.recipient_id = k)::text || ',' || v_row.lang, 'true,en');
  PERFORM pg_temp.check_eq('B4: ...with the titles and the due date',
    v_row.course_title || '|' || v_row.lesson_title || '|' || v_row.due_on, 'Course E|E1 title|2030-06-11');
  UPDATE telegram_links SET stopped_at = NULL WHERE user_id = m;
  PERFORM pg_temp.check_eq('B4: m, once the link is on again, is claimed (control)',
    pg_temp.run_due(p1, names, labels), 'm:X');
  DELETE FROM lesson_attempts WHERE user_id = b AND lesson_version_id = v_ve1;
  DELETE FROM lesson_attempts WHERE user_id = h AND lesson_version_id = v_ve2;
  PERFORM pg_temp.check_eq('B4: once b''s E1 and h''s E2 answers are gone, b:X and h:C are claimed (done was the only reason)',
    pg_temp.run_due(p1, names, labels), 'b:X,h:C');

  -- a draft course announces nothing; control: publish it
  hdr := pg_temp.assign(t, v_d2, v_d2l, DATE '2030-06-11', ARRAY[a], ARRAY[]::uuid[]);
  labels := labels || format(',(%L::uuid,''DR'')', hdr);
  PERFORM pg_temp.check_eq('B5: a draft course announces nothing', pg_temp.run_due(p1, names, labels), '-');
  UPDATE courses SET status = 'published' WHERE id = v_d2;
  PERFORM pg_temp.check_eq('B5: once published, a:DR (control)', pg_temp.run_due(p1, names, labels), 'a:DR');

  -- a lesson that has since been archived: an empty scope is never done and never announced
  har := pg_temp.assign(t, v_f, v_f1, DATE '2030-06-11', ARRAY[a], ARRAY[]::uuid[]);
  labels := labels || format(',(%L::uuid,''AR'')', har);
  UPDATE lessons SET archived_at = now() WHERE id = v_f1;
  PERFORM pg_temp.check_eq('B6: an archived lesson''s homework (nothing to do) is not announced',
    pg_temp.run_due(p1, names, labels), '-');
  UPDATE lessons SET archived_at = NULL WHERE id = v_f1;
  PERFORM pg_temp.check_eq('B6: un-archived, a:AR (control)', pg_temp.run_due(p1, names, labels), 'a:AR');

  -- the 12-hour rule: someone just told about new homework with the date is not told again
  -- at once. (Real clock here; Z is due tomorrow in UTC.)
  hz := pg_temp.assign(t, v_e, v_e1, ((now() AT TIME ZONE 'UTC')::date + 1), ARRAY[u], ARRAY[]::uuid[]);
  PERFORM pg_temp.check_eq('B7: u is claimed as new homework', pg_temp.run_new(hz, names), 'u');
  PERFORM pg_temp.check_eq('B7: due tomorrow, but u was told a moment ago: no due ping',
    pg_temp.run_due(now(), names, labels || format(',(%L::uuid,''Z'')', hz)), '-');
  UPDATE telegram_homework_pings SET claimed_at = claimed_at - interval '13 hours' WHERE assignment_id = hz AND kind = 'new';
  PERFORM pg_temp.check_eq('B7: 13 hours after the new ping, u:Z is claimed (control)',
    pg_temp.run_due(now(), names, labels || format(',(%L::uuid,''Z'')', hz)), 'u:Z');

  -- ============================================================
  -- C. Privileges: no client reaches the functions or the log
  -- ============================================================
  PERFORM pg_temp.check_eq('C1: anon cannot call the new claim',
    pg_temp.as_anon(format($q$ SELECT count(*)::text FROM public.telegram_homework_new_claim(%L) $q$, hw1)), 'ERR:42501');
  PERFORM pg_temp.check_eq('C1: authenticated cannot call the new claim',
    pg_temp.as_user(t, format($q$ SELECT count(*)::text FROM public.telegram_homework_new_claim(%L) $q$, hw1)), 'ERR:42501');
  PERFORM pg_temp.check_eq('C2: anon cannot call the due claim',
    pg_temp.as_anon($q$ SELECT count(*)::text FROM public.telegram_homework_due_claim() $q$), 'ERR:42501');
  PERFORM pg_temp.check_eq('C2: authenticated cannot call the due claim',
    pg_temp.as_user(t, $q$ SELECT count(*)::text FROM public.telegram_homework_due_claim() $q$), 'ERR:42501');
  PERFORM pg_temp.check_eq('C3: the log is unreadable to a client (RLS on, no grant)',
    pg_temp.as_user(a, $q$ SELECT count(*)::text FROM public.telegram_homework_pings $q$), 'ERR:42501');
  PERFORM pg_temp.check_eq('C3: ...though it holds rows (positive control)',
    (SELECT (count(*) > 0)::text FROM telegram_homework_pings), 'true');

  -- ============================================================
  -- D. The log goes with the link, the assignment and the accounts
  -- ============================================================
  SELECT count(*) INTO n_all FROM telegram_homework_pings;
  SELECT count(*) INTO n_f FROM telegram_homework_pings WHERE student_id = f;
  SELECT count(*) INTO n_b FROM telegram_homework_pings WHERE student_id = b;
  SELECT count(*) INTO n_a FROM telegram_homework_pings WHERE student_id = a;
  PERFORM pg_temp.check_eq('D0: f, b and a have log rows (positive control)', (n_f > 0 AND n_b > 0 AND n_a > 0)::text, 'true');

  -- the link to the teacher ends: that student's rows go, the others stay
  UPDATE teacher_student_links SET ended_at = now(), ended_by = f WHERE teacher_id = t AND student_id = f;
  PERFORM pg_temp.check_eq('D1: f ended the link: f has no log rows', (SELECT count(*)::text FROM telegram_homework_pings WHERE student_id = f), '0');
  PERFORM pg_temp.check_eq('D1: ...nobody else lost any',
    (SELECT count(*)::text FROM telegram_homework_pings), (n_all - n_f)::text);
  SELECT count(*) INTO n_all FROM telegram_homework_pings;

  -- deleting an assignment deletes its rows
  PERFORM pg_temp.check_eq('D2: t deletes hw1: ok',
    pg_temp.as_user(t, format($q$ SELECT public.delete_homework(%L)::text $q$, hw1))::jsonb->>'ok', 'true');
  PERFORM pg_temp.check_eq('D2: ...and its log rows are gone',
    (SELECT count(*)::text FROM telegram_homework_pings WHERE assignment_id = hw1), '0');
  SELECT count(*) INTO n_all FROM telegram_homework_pings;
  SELECT count(*) INTO n_b FROM telegram_homework_pings WHERE student_id = b;
  SELECT count(*) INTO n_a FROM telegram_homework_pings WHERE student_id = a;
  PERFORM pg_temp.check_eq('D2: a and b still have rows (control for the next deletions)', (n_a > 0 AND n_b > 0)::text, 'true');

  -- a student deletes the account (096): their rows go through the link trigger
  PERFORM pg_temp.check_eq('D3: a deletes the account: ok',
    pg_temp.as_user(a, $q$ SELECT public.delete_my_account()::text $q$)::jsonb->>'ok', 'true');
  PERFORM pg_temp.check_eq('D3: ...a has no log rows', (SELECT count(*)::text FROM telegram_homework_pings WHERE student_id = a), '0');
  PERFORM pg_temp.check_eq('D3: ...b''s rows are unchanged',
    (SELECT count(*)::text FROM telegram_homework_pings WHERE student_id = b), n_b::text);
  PERFORM pg_temp.check_eq('D3: ...and the table lost exactly a''s rows',
    (SELECT count(*)::text FROM telegram_homework_pings), (n_all - n_a)::text);

  -- the teacher deletes the account: their assignments, and the rows with them
  PERFORM pg_temp.check_eq('D4: t has log rows before deleting (positive control)',
    (SELECT (count(*) > 0)::text FROM telegram_homework_pings p JOIN homework_assignments h ON h.id = p.assignment_id WHERE h.teacher_id = t), 'true');
  PERFORM pg_temp.check_eq('D4: t deletes the account: ok',
    pg_temp.as_user(t, $q$ SELECT public.delete_my_account()::text $q$)::jsonb->>'ok', 'true');
  PERFORM pg_temp.check_eq('D4: ...no log row remains for t''s students',
    (SELECT count(*)::text FROM telegram_homework_pings), '0');

  RAISE NOTICE 'TCH-013 PASS';
END;
$$;

ROLLBACK;
