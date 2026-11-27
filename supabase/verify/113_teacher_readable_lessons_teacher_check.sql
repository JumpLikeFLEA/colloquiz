-- ============================================================
-- supabase/verify/113_teacher_readable_lessons_teacher_check.sql
--
-- TCH-019 full protocol for migration 113 (needs 076..112 applied).
-- NOT a migration: run as postgres. Seeds its own data and ROLLS BACK. A failed
-- assertion aborts with "TCH-019 FAIL: ...".
--
-- Every reader over _teacher_readable_lessons is called by four people linked
-- to the same student, each with an assignment of lesson L1 (or editing its
-- course):
--   x   an ex-teacher: no admin role, no course_editors row, no author seat;
--       still linked, still the owner of an assignment. Must read NOTHING.
--   ed  an editor of course C (no seat): control, reads both lessons.
--   ta  an active seat, assigns L1: control.
--   tl  a lapsed seat, assigns L1: control (a lapsed seat still reads, 0155).
-- The "counts" NOTICE lines are printed for every caller BEFORE any assertion,
-- so a run against the unpatched stack prints the gap and then FAILs.
--
-- Readers, printed in this order per caller:
--   attempts  linked_student_attempts(s)          (080)
--   scores    linked_student_lesson_scores(s)     (080)
--   assigned  linked_student_assigned_lessons(s)  (080)
--   writing   writing_review_queue(), linked route through _writing_can_review (109)
--   notebook  linked_student_notebook(s) entries  (112, already checks _is_teacher)
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

CREATE TABLE pg_temp.tally (n INTEGER);
INSERT INTO pg_temp.tally VALUES (0);

CREATE FUNCTION pg_temp.check_eq(p_label TEXT, p_got TEXT, p_want TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE '% -> got % (want %)', p_label, p_got, p_want;
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'TCH-019 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
  UPDATE pg_temp.tally SET n = n + 1;
END;
$$;

-- attempts/scores/assigned/writing/notebook for p_user reading p_student.
CREATE FUNCTION pg_temp.reads(p_user UUID, p_student UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  RETURN pg_temp.as_user(p_user, format($q$ SELECT
      (SELECT count(*) FROM public.linked_student_attempts(%1$L))::text || '/' ||
      (SELECT count(*) FROM public.linked_student_lesson_scores(%1$L))::text || '/' ||
      (SELECT count(*) FROM public.linked_student_assigned_lessons(%1$L))::text || '/' ||
      (SELECT count(*) FROM public.writing_review_queue() q WHERE q.user_id = %1$L)::text || '/' ||
      (SELECT jsonb_array_length(public.linked_student_notebook(%1$L)->'entries'))::text $q$, p_student));
END;
$$;

DO $$
DECLARE
  x  UUID := gen_random_uuid();   -- ex-teacher
  ed UUID := gen_random_uuid();   -- editor of C, no seat
  ta UUID := gen_random_uuid();   -- active seat
  tl UUID := gen_random_uuid();   -- lapsed seat
  o  UUID := gen_random_uuid();   -- owner of C (editor + seat), linked to nobody
  s  UUID := gen_random_uuid();   -- student linked to all four
  s2 UUID := gen_random_uuid();   -- student linked to x only
  c UUID; l1 UUID; l2 UUID; v1 UUID; v2 UUID;
  hx UUID; hx2 UUID; hta UUID; htl UUID;
  vs UUID; vs2 UUID;
  doc JSONB := '[{"id":"th1","kind":"theory","type":"paragraph","content":[{"text":"Hi"}]},'
            || '{"id":"ex1","kind":"practice","type":"selection","payload":{"prompt":"Pick"}},'
            || '{"id":"w1","kind":"task","type":"writing","prompt":{"paragraphs":[{"runs":[{"text":"Write"}]}]},"sendToTeacher":true}]';
  r_x TEXT; r_ed TEXT; r_ta TEXT; r_tl TEXT; r_x2 TEXT; r_o TEXT;
BEGIN
  INSERT INTO auth.users (id, aud, role, email)
  SELECT u, 'authenticated', 'authenticated', n || '-' || u || '@verify.test'
  FROM (VALUES (x,'x'),(ed,'ed'),(ta,'ta'),(tl,'tl'),(o,'o'),(s,'s'),(s2,'s2')) v(u, n);

  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v113-c', 'C', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO c;
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES (c, o, o), (c, ed, o);
  INSERT INTO author_seats (user_id, kind, public_name) VALUES (o, 'teacher', 'Seat o'), (ta, 'teacher', 'Seat ta');
  INSERT INTO author_seats (user_id, kind, public_name, expires_at) VALUES (tl, 'teacher', 'Seat tl', now() - interval '3 days');

  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (c, 1, 'L1', 'l1', 'anyone') RETURNING id INTO l1;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (c, 2, 'L2', 'l2', 'anyone') RETURNING id INTO l2;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (l1, doc, 'editor') RETURNING id INTO v1;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (l2, doc, 'editor') RETURNING id INTO v2;
  UPDATE lessons SET published_version_id = v1 WHERE id = l1;
  UPDATE lessons SET published_version_id = v2 WHERE id = l2;

  INSERT INTO teacher_student_links (teacher_id, student_id, source) VALUES
    (x, s, 'join_link'), (ed, s, 'join_link'), (ta, s, 'join_link'), (tl, s, 'join_link'), (x, s2, 'join_link');

  INSERT INTO homework_assignments (teacher_id, course_id, lesson_id) VALUES (x,  c, l1) RETURNING id INTO hx;
  INSERT INTO homework_assignments (teacher_id, course_id, lesson_id) VALUES (x,  c, l1) RETURNING id INTO hx2;
  INSERT INTO homework_assignments (teacher_id, course_id, lesson_id) VALUES (ta, c, l1) RETURNING id INTO hta;
  INSERT INTO homework_assignments (teacher_id, course_id, lesson_id) VALUES (tl, c, l1) RETURNING id INTO htl;
  INSERT INTO homework_targets (assignment_id, teacher_id, student_id) VALUES
    (hx, x, s), (hx2, x, s2), (hta, ta, s), (htl, tl, s);

  -- s: an attempt on each lesson, a written answer on L1 (linked route), a said
  -- entry on L1. s2: the same on L1 only.
  INSERT INTO lesson_attempts (id, user_id, lesson_version_id, block_id, earned, possible, response, created_at) VALUES
    (gen_random_uuid(), s,  v1, 'ex1', 1, 1, '{"selectedOptionIds":["a"]}', now() - interval '2 hours'),
    (gen_random_uuid(), s,  v2, 'ex1', 0, 1, '{"selectedOptionIds":["b"]}', now() - interval '1 hour'),
    (gen_random_uuid(), s2, v1, 'ex1', 1, 1, '{"selectedOptionIds":["a"]}', now() - interval '1 hour');
  INSERT INTO writing_submissions (user_id, course_id, lesson_id, block_id, lesson_version_id, body) VALUES
    (s, c, l1, 'w1', v1, 'My answer'), (s2, c, l1, 'w1', v1, 'My answer');
  INSERT INTO voice_submissions (id, enrolment_id, user_id, course_id, lesson_id, block_id, lesson_version_id, object_name, content_type) VALUES
    (gen_random_uuid(), NULL, s,  c, l1, 'vt1', v1, 'verify/' || gen_random_uuid(), 'audio/webm'),
    (gen_random_uuid(), NULL, s2, c, l1, 'vt1', v1, 'verify/' || gen_random_uuid(), 'audio/webm');
  SELECT id INTO vs  FROM voice_submissions WHERE user_id = s;
  SELECT id INTO vs2 FROM voice_submissions WHERE user_id = s2;
  INSERT INTO notebook_entries (user_id, kind, submission_id, course_id, lesson_id, course_title, lesson_title, phrase, quote, exact) VALUES
    (s,  'said', vs,  c, l1, 'C', 'L1', 'be about to', 'be about to', true),
    (s2, 'said', vs2, c, l1, 'C', 'L1', 'be about to', 'be about to', true);

  PERFORM pg_temp.check_eq('seed (tables not empty): links/assignments/attempts/answers/notebook',
    (SELECT count(*) FROM teacher_student_links WHERE student_id IN (s, s2))::text || '/' ||
    (SELECT count(*) FROM homework_assignments WHERE course_id = c)::text || '/' ||
    (SELECT count(*) FROM lesson_attempts WHERE user_id IN (s, s2))::text || '/' ||
    (SELECT count(*) FROM writing_submissions WHERE user_id IN (s, s2))::text || '/' ||
    (SELECT count(*) FROM notebook_entries WHERE user_id IN (s, s2))::text, '5/4/3/2/2');
  PERFORM pg_temp.check_eq('_is_teacher: x / ed / ta / tl',
    _is_teacher(x)::text || '/' || _is_teacher(ed)::text || '/' || _is_teacher(ta)::text || '/' || _is_teacher(tl)::text,
    'false/true/true/true');
  PERFORM pg_temp.check_eq('x still has an active link and an assignment for s (the precondition of the gap)',
    _teacher_linked(x, s)::text || '/' || (SELECT count(*) FROM _homework_recipients(x, s))::text, 'true/1');

  -- ── Every reader, every caller, printed before any assertion ──────────────
  r_x  := pg_temp.reads(x,  s);
  r_x2 := pg_temp.reads(x,  s2);
  r_ed := pg_temp.reads(ed, s);
  r_ta := pg_temp.reads(ta, s);
  r_tl := pg_temp.reads(tl, s);
  r_o  := pg_temp.reads(o,  s);
  RAISE NOTICE 'counts attempts/scores/assigned/writing/notebook: x->s %, x->s2 %, ed->s %, ta->s %, tl->s %, o->s (not linked) %',
    r_x, r_x2, r_ed, r_ta, r_tl, r_o;

  -- ── The ex-teacher reads nothing ────────────────────────────────────────
  PERFORM pg_temp.check_eq('x (ex-teacher) reading s: every reader empty', r_x, '0/0/0/0/0');
  PERFORM pg_temp.check_eq('x (ex-teacher) reading s2: every reader empty', r_x2, '0/0/0/0/0');
  PERFORM pg_temp.check_eq('x: _writing_can_review on s''s answer',
    _writing_can_review(x, (SELECT id FROM writing_submissions WHERE user_id = s))::text, 'false');
  PERFORM pg_temp.check_eq('x: save_writing_feedback refused like an unknown id',
    pg_temp.as_user(x, format($q$ SELECT public.save_writing_feedback(%L, '{"paragraphs":[{"runs":[{"text":"Good"}]}]}'::jsonb, false)->>'error' $q$,
      (SELECT id FROM writing_submissions WHERE user_id = s))) || '|' ||
    pg_temp.as_user(x, format($q$ SELECT public.save_writing_feedback(%L, '{"paragraphs":[{"runs":[{"text":"Good"}]}]}'::jsonb, false)->>'error' $q$,
      gen_random_uuid())),
    'forbidden|forbidden');

  -- ── Controls: the same rows as before the change ────────────────────────
  -- ed edits C: both lessons' attempts and scores, no "assigned but not edited"
  -- lesson, the answer, the notebook entry.
  PERFORM pg_temp.check_eq('ed (editor) reading s', r_ed, '2/2/0/1/1');
  PERFORM pg_temp.check_eq('ta (active seat, assigns L1) reading s', r_ta, '1/1/1/1/1');
  PERFORM pg_temp.check_eq('tl (lapsed seat, assigns L1) reading s', r_tl, '1/1/1/1/1');
  PERFORM pg_temp.check_eq('o (editor, not linked) reading s: nothing', r_o, '0/0/0/0/0');
  PERFORM pg_temp.check_eq('tl: save_writing_feedback still accepted (lapsed seat answers, 0155)',
    pg_temp.as_user(tl, format($q$ SELECT (public.save_writing_feedback(%L, '{"paragraphs":[{"runs":[{"text":"Good"}]}]}'::jsonb, false)->>'ok') $q$,
      (SELECT id FROM writing_submissions WHERE user_id = s))), 'true');

  -- ── The student's side, as it is ────────────────────────────────────────
  -- s2's only teacher is x: the written answer has no route and the card falls
  -- back to practice (0225); s still has three teachers, so 'linked'.
  PERFORM pg_temp.check_eq('writing_task_state route: s2 (only x) / s (ed, ta, tl too)',
    pg_temp.as_user(s2, format($q$ SELECT public.writing_task_state(%L, 'w1')->>'route' $q$, l1)) || '/' ||
    pg_temp.as_user(s,  format($q$ SELECT public.writing_task_state(%L, 'w1')->>'route' $q$, l1)),
    'practice/linked');
  PERFORM pg_temp.check_eq('submit_writing_answer: s2 refused, s accepted',
    pg_temp.as_user(s2, format($q$ SELECT COALESCE(public.submit_writing_answer(%L, 'w1', 'Again')->>'error', 'ok') $q$, l1)) || '/' ||
    pg_temp.as_user(s,  format($q$ SELECT COALESCE(public.submit_writing_answer(%L, 'w1', 'Again')->>'error', 'ok') $q$, l1)),
    'no_route/ok');
  -- Reported as it is, not changed by 113: my_teachers lists every active link.
  PERFORM pg_temp.check_eq('my_teachers for s2 still lists x (link active, unchanged by 113)',
    pg_temp.as_user(s2, $q$ SELECT count(*)::text FROM public.my_teachers() $q$), '1');

  RAISE NOTICE 'TCH-019 PASS: 113 full protocol (% asserted cells)', (SELECT n FROM pg_temp.tally);
END $$;

ROLLBACK;
