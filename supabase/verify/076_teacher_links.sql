-- ============================================================
-- supabase/verify/076_teacher_links.sql
--
-- TCH-001 full protocol for migration 076 (needs 073 applied too). NOT a
-- migration: run after 076 is applied, as postgres. Seeds its own data and
-- ROLLS BACK. A failed assertion aborts with "TCH-001 FAIL: ...". Every
-- negative check is paired with a positive control that proves the rows it
-- would have hidden exist.
-- ============================================================
BEGIN;

-- Run `p_sql` as `p_user` (authenticated), return its single jsonb/scalar.
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

CREATE FUNCTION pg_temp.as_anon(p_sql TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM set_config('role', 'anon', true);
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
    RAISE EXCEPTION 'TCH-001 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

DO $$
DECLARE
  t  UUID := gen_random_uuid();   -- teacher (course editor)
  t2 UUID := gen_random_uuid();   -- another teacher
  s  UUID := gen_random_uuid();   -- student
  s2 UUID := gen_random_uuid();   -- another student
  n  UUID := gen_random_uuid();   -- neither
  v_course UUID; v_run UUID; v_tok TEXT; v_tok2 TEXT; v_inv_tok TEXT; v_link UUID;
  v_res TEXT;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (t,  'authenticated', 'authenticated', 't-'  || t  || '@verify.test'),
    (t2, 'authenticated', 'authenticated', 't2-' || t2 || '@verify.test'),
    (s,  'authenticated', 'authenticated', 's-'  || s  || '@verify.test'),
    (s2, 'authenticated', 'authenticated', 's2-' || s2 || '@verify.test'),
    (n,  'authenticated', 'authenticated', 'n-'  || n  || '@verify.test');
  UPDATE profiles SET display_name = 'Teacher T' WHERE id = t;

  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v76-coh', 'Cohort', 'A2', 'published', 'cohort', 's', 'c') RETURNING id INTO v_course;
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES (v_course, t, t), (v_course, t2, t2);
  -- TCH-008: 083 freezes a writer with no active seat, so every seeded editor
  -- gets the open-ended seat 082's backfill gave the real ones.
  INSERT INTO author_seats (user_id, kind, public_name)
  SELECT DISTINCT ce.user_id, 'teacher', 'Verify seat' FROM course_editors ce
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week) VALUES (v_course, 1, 'W1', 'w1', 'entitled', 1);
  INSERT INTO course_runs (course_id, title, starts_at) VALUES (v_course, 'R', now() + interval '1 day') RETURNING id INTO v_run;

  -- 1. a non-teacher cannot create a join link; a teacher can --------------
  PERFORM pg_temp.check_eq('non-teacher rotate',
    pg_temp.as_user(s, $q$ SELECT public.rotate_teacher_join_token()->>'error' $q$), 'forbidden');
  v_tok := pg_temp.as_user(t, $q$ SELECT public.rotate_teacher_join_token()->>'token' $q$);
  PERFORM pg_temp.check_eq('teacher rotate returns a 32-hex token', (v_tok ~ '^[0-9a-f]{32}$')::text, 'true');
  PERFORM pg_temp.check_eq('raw token is not stored',
    (SELECT count(*)::text FROM teacher_join_tokens WHERE token_hash = v_tok), '0');
  PERFORM pg_temp.check_eq('only the hash is stored (positive control)',
    (SELECT count(*)::text FROM teacher_join_tokens WHERE teacher_id = t AND token_hash ~ '^[0-9a-f]{64}$'), '1');

  -- 2. preview: anon sees the name, a bad token sees nothing ----------------
  PERFORM pg_temp.check_eq('anon preview state',
    pg_temp.as_anon(format($q$ SELECT public.teacher_join_preview(%L)->>'state' $q$, v_tok)), 'ok');
  PERFORM pg_temp.check_eq('anon preview name',
    pg_temp.as_anon(format($q$ SELECT public.teacher_join_preview(%L)->>'teacher_name' $q$, v_tok)), 'Teacher T');
  PERFORM pg_temp.check_eq('unknown token',
    pg_temp.as_anon($q$ SELECT public.teacher_join_preview('00000000000000000000000000000000')->>'state' $q$), 'not_found');
  PERFORM pg_temp.check_eq('malformed token',
    pg_temp.as_anon($q$ SELECT public.teacher_join_preview('nope')->>'state' $q$), 'not_found');
  PERFORM pg_temp.check_eq('teacher opening own link',
    pg_temp.as_user(t, format($q$ SELECT public.teacher_join_preview(%L)->>'state' $q$, v_tok)), 'self');

  -- 3. join: anon refused, student links, double join is idempotent --------
  PERFORM pg_temp.check_eq('anon cannot join (no EXECUTE)',
    (SELECT has_function_privilege('anon', 'public.join_teacher(text)', 'EXECUTE'))::text, 'false');
  PERFORM pg_temp.check_eq('teacher joining self',
    pg_temp.as_user(t, format($q$ SELECT public.join_teacher(%L)->>'error' $q$, v_tok)), 'self');
  PERFORM pg_temp.check_eq('student joins',
    pg_temp.as_user(s, format($q$ SELECT public.join_teacher(%L)->>'ok' $q$, v_tok)), 'true');
  PERFORM pg_temp.check_eq('student joins again: already_linked',
    pg_temp.as_user(s, format($q$ SELECT public.join_teacher(%L)->>'already_linked' $q$, v_tok)), 'true');
  PERFORM pg_temp.check_eq('exactly one active link',
    (SELECT count(*)::text FROM teacher_student_links WHERE teacher_id = t AND student_id = s AND ended_at IS NULL), '1');
  PERFORM pg_temp.check_eq('preview now already_linked',
    pg_temp.as_user(s, format($q$ SELECT public.teacher_join_preview(%L)->>'state' $q$, v_tok)), 'already_linked');

  -- 4. a learner cannot link anyone else; the link is theirs only ----------
  -- join_teacher takes no student argument: the student is always auth.uid().
  PERFORM pg_temp.check_eq('link student is the caller',
    (SELECT student_id::text FROM teacher_student_links WHERE teacher_id = t AND ended_at IS NULL), s::text);
  PERFORM pg_temp.check_eq('no direct table access (student)',
    (SELECT has_table_privilege('authenticated', 'public.teacher_student_links', 'SELECT'))::text, 'false');
  PERFORM pg_temp.check_eq('no direct insert (student)',
    (SELECT has_table_privilege('authenticated', 'public.teacher_student_links', 'INSERT'))::text, 'false');

  -- 5. a teacher sees only their own links ---------------------------------
  PERFORM pg_temp.check_eq('teacher sees own student (positive control)',
    pg_temp.as_user(t, $q$ SELECT count(*)::text FROM public.teacher_linked_students() $q$), '1');
  PERFORM pg_temp.check_eq('other teacher sees none',
    pg_temp.as_user(t2, $q$ SELECT count(*)::text FROM public.teacher_linked_students() $q$), '0');
  PERFORM pg_temp.check_eq('non-teacher sees none',
    pg_temp.as_user(n, $q$ SELECT count(*)::text FROM public.teacher_linked_students() $q$), '0');
  PERFORM pg_temp.check_eq('student sees own teacher (positive control)',
    pg_temp.as_user(s, $q$ SELECT count(*)::text FROM public.my_teachers() $q$), '1');
  PERFORM pg_temp.check_eq('other student sees no teachers',
    pg_temp.as_user(s2, $q$ SELECT count(*)::text FROM public.my_teachers() $q$), '0');
  PERFORM pg_temp.check_eq('student label is the contact label',
    pg_temp.as_user(t, $q$ SELECT contact_label FROM public.teacher_linked_students() $q$), 's-' || s || '@verify.test');
  PERFORM pg_temp.check_eq('_teacher_linked true while active',
    public._teacher_linked(t, s)::text, 'true');
  PERFORM pg_temp.check_eq('_teacher_linked false for another pair',
    public._teacher_linked(t2, s)::text, 'false');

  -- 6. leave / remove: either party, nobody else ---------------------------
  SELECT id INTO v_link FROM teacher_student_links WHERE teacher_id = t AND student_id = s AND ended_at IS NULL;
  PERFORM pg_temp.check_eq('stranger cannot end the link',
    pg_temp.as_user(n, format($q$ SELECT public.end_teacher_link(%L)->>'error' $q$, v_link)), 'not_found');
  PERFORM pg_temp.check_eq('other teacher cannot end the link',
    pg_temp.as_user(t2, format($q$ SELECT public.end_teacher_link(%L)->>'error' $q$, v_link)), 'not_found');
  PERFORM pg_temp.check_eq('link still active after refused attempts',
    public._teacher_linked(t, s)::text, 'true');
  PERFORM pg_temp.check_eq('student leaves',
    pg_temp.as_user(s, format($q$ SELECT public.end_teacher_link(%L)->>'ok' $q$, v_link)), 'true');
  PERFORM pg_temp.check_eq('ended_by is the student',
    (SELECT ended_by::text FROM teacher_student_links WHERE id = v_link), s::text);
  PERFORM pg_temp.check_eq('ended link stops _teacher_linked',
    public._teacher_linked(t, s)::text, 'false');
  PERFORM pg_temp.check_eq('ended link leaves the teacher roster',
    pg_temp.as_user(t, $q$ SELECT count(*)::text FROM public.teacher_linked_students() $q$), '0');
  PERFORM pg_temp.check_eq('ended link leaves my_teachers',
    pg_temp.as_user(s, $q$ SELECT count(*)::text FROM public.my_teachers() $q$), '0');
  PERFORM pg_temp.check_eq('ended link stays in the export list',
    pg_temp.as_user(s, $q$ SELECT ended_by FROM public.my_teacher_links() $q$), 'you');
  PERFORM pg_temp.check_eq('ending twice',
    pg_temp.as_user(s, format($q$ SELECT public.end_teacher_link(%L)->>'error' $q$, v_link)), 'not_found');

  -- 7. relink after leaving makes a NEW row; teacher can remove ------------
  PERFORM pg_temp.check_eq('relink',
    pg_temp.as_user(s, format($q$ SELECT public.join_teacher(%L)->>'ok' $q$, v_tok)), 'true');
  PERFORM pg_temp.check_eq('two rows now, one active',
    (SELECT count(*)::text || '/' || count(*) FILTER (WHERE ended_at IS NULL)::text
       FROM teacher_student_links WHERE teacher_id = t AND student_id = s), '2/1');
  SELECT id INTO v_link FROM teacher_student_links WHERE teacher_id = t AND student_id = s AND ended_at IS NULL;
  PERFORM pg_temp.check_eq('teacher removes the student',
    pg_temp.as_user(t, format($q$ SELECT public.end_teacher_link(%L)->>'ok' $q$, v_link)), 'true');
  PERFORM pg_temp.check_eq('ended_by is the teacher',
    (SELECT ended_by::text FROM teacher_student_links WHERE id = v_link), t::text);

  -- 8. rotation kills the old link -----------------------------------------
  v_tok2 := pg_temp.as_user(t, $q$ SELECT public.rotate_teacher_join_token()->>'token' $q$);
  PERFORM pg_temp.check_eq('rotated token differs', (v_tok2 <> v_tok)::text, 'true');
  PERFORM pg_temp.check_eq('old token is dead',
    pg_temp.as_anon(format($q$ SELECT public.teacher_join_preview(%L)->>'state' $q$, v_tok)), 'not_found');
  PERFORM pg_temp.check_eq('old token cannot join',
    pg_temp.as_user(s2, format($q$ SELECT public.join_teacher(%L)->>'error' $q$, v_tok)), 'not_found');
  PERFORM pg_temp.check_eq('new token works (positive control)',
    pg_temp.as_user(s2, format($q$ SELECT public.join_teacher(%L)->>'ok' $q$, v_tok2)), 'true');
  PERFORM pg_temp.check_eq('one token row per teacher',
    (SELECT count(*)::text FROM teacher_join_tokens WHERE teacher_id = t), '1');

  -- 9. a teacher who stops being a teacher: the link stops resolving -------
  DELETE FROM course_editors WHERE user_id = t;
  DELETE FROM author_seats WHERE user_id = t;  -- TCH-008: 082 made a seat count as "teacher" too
  PERFORM pg_temp.check_eq('non-teacher token is dead',
    pg_temp.as_anon(format($q$ SELECT public.teacher_join_preview(%L)->>'state' $q$, v_tok2)), 'not_found');
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES (v_course, t, t);
  -- TCH-008: 083 freezes a writer with no active seat, so every seeded editor
  -- gets the open-ended seat 082's backfill gave the real ones.
  INSERT INTO author_seats (user_id, kind, public_name)
  SELECT DISTINCT ce.user_id, 'teacher', 'Verify seat' FROM course_editors ce
  ON CONFLICT (user_id) DO NOTHING;

  -- 10. run invite: links to the creator who edits the course ---------------
  v_inv_tok := pg_temp.as_user(t, format(
    $q$ SELECT public.create_run_invite(%L, 'basic', 'Learner', 'learner@example.com')->>'token' $q$, v_run));
  PERFORM pg_temp.check_eq('invite preview names the creator',
    pg_temp.as_anon(format($q$ SELECT public.run_invite_preview(%L)->>'teacher_name' $q$, v_inv_tok)), 'Teacher T');
  PERFORM pg_temp.check_eq('claim joins',
    pg_temp.as_user(n, format($q$ SELECT public.claim_run_invite(%L)->>'ok' $q$, v_inv_tok)), 'true');
  PERFORM pg_temp.check_eq('claim linked the claimer to the creator',
    public._teacher_linked(t, n)::text, 'true');
  PERFORM pg_temp.check_eq('link source is run_invite',
    (SELECT source FROM teacher_student_links WHERE teacher_id = t AND student_id = n AND ended_at IS NULL), 'run_invite');
  PERFORM pg_temp.check_eq('no link to the OTHER editor',
    public._teacher_linked(t2, n)::text, 'false');

  -- 11. invite by a creator who no longer edits the course: enrolled, no link
  v_inv_tok := pg_temp.as_user(t2, format(
    $q$ SELECT public.create_run_invite(%L, 'basic', 'Learner2', 'l2@example.com')->>'token' $q$, v_run));
  DELETE FROM course_editors WHERE user_id = t2;
  PERFORM pg_temp.check_eq('preview names nobody',
    coalesce(pg_temp.as_anon(format($q$ SELECT public.run_invite_preview(%L)->>'teacher_name' $q$, v_inv_tok)), 'NULL'), 'NULL');
  PERFORM pg_temp.check_eq('claim still enrols',
    pg_temp.as_user(s, format($q$ SELECT public.claim_run_invite(%L)->>'ok' $q$, v_inv_tok)), 'true');
  PERFORM pg_temp.check_eq('...but makes no link to the ex-editor',
    public._teacher_linked(t2, s)::text, 'false');

  -- 12. deletion removes links both ways and the token ---------------------
  PERFORM pg_temp.check_eq('student delete ok',
    pg_temp.as_user(n, $q$ SELECT public.delete_my_account()->>'ok' $q$), 'true');
  PERFORM pg_temp.check_eq('student links gone',
    (SELECT count(*)::text FROM teacher_student_links WHERE student_id = n), '0');
  PERFORM pg_temp.check_eq('teacher links to others untouched (positive control)',
    (SELECT count(*)::text FROM teacher_student_links WHERE teacher_id = t AND student_id = s2), '1');
  PERFORM pg_temp.check_eq('teacher delete ok',
    pg_temp.as_user(t, $q$ SELECT public.delete_my_account()->>'ok' $q$), 'true');
  PERFORM pg_temp.check_eq('teacher links gone',
    (SELECT count(*)::text FROM teacher_student_links WHERE teacher_id = t), '0');
  PERFORM pg_temp.check_eq('teacher token gone',
    (SELECT count(*)::text FROM teacher_join_tokens WHERE teacher_id = t), '0');

  RAISE NOTICE 'TCH-001 PASS';
END;
$$;

ROLLBACK;
