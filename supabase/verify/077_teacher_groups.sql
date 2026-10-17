-- ============================================================
-- supabase/verify/077_teacher_groups.sql
--
-- TCH-002 full protocol for migration 077 (needs 073-076 applied too). NOT a
-- migration: run after 077 is applied, as postgres. Seeds its own data and
-- ROLLS BACK. A failed assertion aborts with "TCH-002 FAIL: ...". Every
-- negative check is paired with a positive control that proves the rows it
-- would have hidden exist.
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
    RAISE EXCEPTION 'TCH-002 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

DO $$
DECLARE
  t  UUID := gen_random_uuid();   -- teacher
  t2 UUID := gen_random_uuid();   -- another teacher
  s  UUID := gen_random_uuid();   -- student linked to t (and later t2)
  s2 UUID := gen_random_uuid();   -- student linked to t
  n  UUID := gen_random_uuid();   -- not linked to anyone
  v_course UUID; v_g1 UUID; v_g2 UUID; v_g3 UUID; v_other UUID; v_link UUID;
  v_failed BOOLEAN;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (t,  'authenticated', 'authenticated', 't-'  || t  || '@verify.test'),
    (t2, 'authenticated', 'authenticated', 't2-' || t2 || '@verify.test'),
    (s,  'authenticated', 'authenticated', 's-'  || s  || '@verify.test'),
    (s2, 'authenticated', 'authenticated', 's2-' || s2 || '@verify.test'),
    (n,  'authenticated', 'authenticated', 'n-'  || n  || '@verify.test');
  UPDATE profiles SET display_name = 'Teacher T' WHERE id = t;

  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v77-c', 'Course', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO v_course;
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES (v_course, t, t), (v_course, t2, t2);
  -- TCH-008: 083 freezes a writer with no active seat, so every seeded editor
  -- gets the open-ended seat 082's backfill gave the real ones.
  INSERT INTO author_seats (user_id, kind, public_name)
  SELECT DISTINCT ce.user_id, 'teacher', 'Verify seat' FROM course_editors ce
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO teacher_student_links (teacher_id, student_id, source) VALUES
    (t, s, 'join_link'), (t, s2, 'join_link');

  -- 1. create: teachers only, name rules, unique per teacher ---------------
  PERFORM pg_temp.check_eq('non-teacher create',
    pg_temp.as_user(n, $q$ SELECT public.create_teacher_group('X')->>'error' $q$), 'forbidden');
  v_g1 := pg_temp.as_user(t, $q$ SELECT public.create_teacher_group('  Evening class ')->>'id' $q$)::uuid;
  PERFORM pg_temp.check_eq('name is trimmed',
    (SELECT name FROM teacher_groups WHERE id = v_g1), 'Evening class');
  PERFORM pg_temp.check_eq('duplicate name, other case',
    pg_temp.as_user(t, $q$ SELECT public.create_teacher_group('evening CLASS')->>'error' $q$), 'name_taken');
  PERFORM pg_temp.check_eq('empty name',
    pg_temp.as_user(t, $q$ SELECT public.create_teacher_group('   ')->>'error' $q$), 'invalid_name');
  PERFORM pg_temp.check_eq('61-char name',
    pg_temp.as_user(t, format($q$ SELECT public.create_teacher_group(%L)->>'error' $q$, repeat('a', 61))), 'invalid_name');
  PERFORM pg_temp.check_eq('60-char name (positive control)',
    pg_temp.as_user(t, format($q$ SELECT public.create_teacher_group(%L)->>'ok' $q$, repeat('a', 60))), 'true');
  PERFORM pg_temp.check_eq('same name, other teacher is fine',
    pg_temp.as_user(t2, $q$ SELECT public.create_teacher_group('Evening class')->>'ok' $q$), 'true');
  v_g2 := pg_temp.as_user(t, $q$ SELECT public.create_teacher_group('Morning')->>'id' $q$)::uuid;
  SELECT id INTO v_other FROM teacher_groups WHERE teacher_id = t2;

  -- 2. members must be live linked students; all or nothing ----------------
  PERFORM pg_temp.check_eq('add two linked students',
    pg_temp.as_user(t, format($q$ SELECT public.add_teacher_group_members(%L, ARRAY[%L, %L]::uuid[])->>'added' $q$, v_g1, s, s2)), '2');
  PERFORM pg_temp.check_eq('adding again adds nobody',
    pg_temp.as_user(t, format($q$ SELECT public.add_teacher_group_members(%L, ARRAY[%L]::uuid[])->>'added' $q$, v_g1, s)), '0');
  PERFORM pg_temp.check_eq('a non-linked user is refused',
    pg_temp.as_user(t, format($q$ SELECT public.add_teacher_group_members(%L, ARRAY[%L]::uuid[])->>'error' $q$, v_g2, n)), 'not_linked');
  PERFORM pg_temp.check_eq('all or nothing: one bad id inserts nobody',
    pg_temp.as_user(t, format($q$ SELECT public.add_teacher_group_members(%L, ARRAY[%L, %L]::uuid[])->>'error' $q$, v_g2, s, n)), 'not_linked');
  PERFORM pg_temp.check_eq('...and the good id was not inserted',
    (SELECT count(*)::text FROM teacher_group_members WHERE group_id = v_g2), '0');
  PERFORM pg_temp.check_eq('a student may be in several groups',
    pg_temp.as_user(t, format($q$ SELECT public.add_teacher_group_members(%L, ARRAY[%L]::uuid[])->>'ok' $q$, v_g2, s)), 'true');
  PERFORM pg_temp.check_eq('s is in two groups',
    (SELECT count(*)::text FROM teacher_group_members WHERE student_id = s AND teacher_id = t), '2');
  PERFORM pg_temp.check_eq('a student linked to t is not linkable by t2 (t2 group)',
    pg_temp.as_user(t2, format($q$ SELECT public.add_teacher_group_members(%L, ARRAY[%L]::uuid[])->>'error' $q$, v_other, s)), 'not_linked');
  PERFORM pg_temp.check_eq('unauthenticated-style: no EXECUTE for anon',
    (SELECT has_function_privilege('anon', 'public.add_teacher_group_members(uuid, uuid[])', 'EXECUTE'))::text, 'false');

  -- 3. another teacher cannot read or change t's groups --------------------
  PERFORM pg_temp.check_eq('t lists two groups plus the 60-char one (positive control)',
    pg_temp.as_user(t, $q$ SELECT count(*)::text FROM public.teacher_groups_list() $q$), '3');
  PERFORM pg_temp.check_eq('t2 lists only its own',
    pg_temp.as_user(t2, $q$ SELECT count(*)::text FROM public.teacher_groups_list() $q$), '1');
  PERFORM pg_temp.check_eq('t sees its memberships (positive control)',
    pg_temp.as_user(t, $q$ SELECT count(*)::text FROM public.teacher_group_member_rows() $q$), '3');
  PERFORM pg_temp.check_eq('t2 sees none of them',
    pg_temp.as_user(t2, $q$ SELECT count(*)::text FROM public.teacher_group_member_rows() $q$), '0');
  PERFORM pg_temp.check_eq('t2 cannot rename t group',
    pg_temp.as_user(t2, format($q$ SELECT public.rename_teacher_group(%L, 'Hijack')->>'error' $q$, v_g1)), 'not_found');
  PERFORM pg_temp.check_eq('t2 cannot add to t group',
    pg_temp.as_user(t2, format($q$ SELECT public.add_teacher_group_members(%L, ARRAY[]::uuid[])->>'error' $q$, v_g1)), 'not_found');
  PERFORM pg_temp.check_eq('t2 cannot remove from t group',
    pg_temp.as_user(t2, format($q$ SELECT public.remove_teacher_group_member(%L, %L)->>'error' $q$, v_g1, s)), 'not_found');
  PERFORM pg_temp.check_eq('t2 cannot delete t group',
    pg_temp.as_user(t2, format($q$ SELECT public.delete_teacher_group(%L)->>'error' $q$, v_g1)), 'not_found');
  PERFORM pg_temp.check_eq('t group untouched by all of that',
    (SELECT name || '/' || (SELECT count(*) FROM teacher_group_members WHERE group_id = v_g1) FROM teacher_groups WHERE id = v_g1), 'Evening class/2');
  PERFORM pg_temp.check_eq('no direct table access (groups)',
    (SELECT has_table_privilege('authenticated', 'public.teacher_groups', 'SELECT'))::text, 'false');
  PERFORM pg_temp.check_eq('no direct table access (members)',
    (SELECT has_table_privilege('authenticated', 'public.teacher_group_members', 'INSERT'))::text, 'false');

  -- composite FK: a membership cannot name a group under another teacher
  v_failed := false;
  BEGIN
    INSERT INTO teacher_group_members (group_id, teacher_id, student_id) VALUES (v_g1, t2, n);
  EXCEPTION WHEN foreign_key_violation THEN
    v_failed := true;
  END;
  PERFORM pg_temp.check_eq('membership under the wrong teacher is rejected by the FK', v_failed::text, 'true');

  -- 4. the student sees names in the export read, and nothing else ----------
  PERFORM pg_temp.check_eq('s sees two group names (positive control)',
    pg_temp.as_user(s, $q$ SELECT count(*)::text FROM public.my_group_memberships() $q$), '2');
  PERFORM pg_temp.check_eq('teacher name comes with it',
    pg_temp.as_user(s, $q$ SELECT DISTINCT teacher_name FROM public.my_group_memberships() $q$), 'Teacher T');
  PERFORM pg_temp.check_eq('s2 sees only its own one',
    pg_temp.as_user(s2, $q$ SELECT count(*)::text FROM public.my_group_memberships() $q$), '1');
  PERFORM pg_temp.check_eq('an unlinked user sees none',
    pg_temp.as_user(n, $q$ SELECT count(*)::text FROM public.my_group_memberships() $q$), '0');
  PERFORM pg_temp.check_eq('a student reads no teacher membership rows',
    pg_temp.as_user(s, $q$ SELECT count(*)::text FROM public.teacher_group_member_rows() $q$), '0');
  PERFORM pg_temp.check_eq('a student lists no groups',
    pg_temp.as_user(s, $q$ SELECT count(*)::text FROM public.teacher_groups_list() $q$), '0');

  -- 5. rename ---------------------------------------------------------------
  PERFORM pg_temp.check_eq('rename',
    pg_temp.as_user(t, format($q$ SELECT public.rename_teacher_group(%L, 'Evenings')->>'ok' $q$, v_g1)), 'true');
  PERFORM pg_temp.check_eq('rename to an existing name',
    pg_temp.as_user(t, format($q$ SELECT public.rename_teacher_group(%L, 'MORNING')->>'error' $q$, v_g1)), 'name_taken');
  PERFORM pg_temp.check_eq('name unchanged after the refused rename',
    (SELECT name FROM teacher_groups WHERE id = v_g1), 'Evenings');

  -- 6. remove one member ----------------------------------------------------
  PERFORM pg_temp.check_eq('remove a member',
    pg_temp.as_user(t, format($q$ SELECT public.remove_teacher_group_member(%L, %L)->>'ok' $q$, v_g1, s2)), 'true');
  PERFORM pg_temp.check_eq('removing again',
    pg_temp.as_user(t, format($q$ SELECT public.remove_teacher_group_member(%L, %L)->>'error' $q$, v_g1, s2)), 'not_found');
  PERFORM pg_temp.check_eq('s2 still linked after leaving the group (positive control)',
    public._teacher_linked(t, s2)::text, 'true');
  PERFORM pg_temp.check_eq('put s2 back',
    pg_temp.as_user(t, format($q$ SELECT public.add_teacher_group_members(%L, ARRAY[%L]::uuid[])->>'ok' $q$, v_g1, s2)), 'true');

  -- 7. a link that ends removes the student from THAT teacher's groups ------
  INSERT INTO teacher_student_links (teacher_id, student_id, source) VALUES (t2, s, 'join_link');
  PERFORM pg_temp.check_eq('t2 can now group s (linked)',
    pg_temp.as_user(t2, format($q$ SELECT public.add_teacher_group_members(%L, ARRAY[%L]::uuid[])->>'ok' $q$, v_other, s)), 'true');
  SELECT id INTO v_link FROM teacher_student_links WHERE teacher_id = t AND student_id = s AND ended_at IS NULL;
  PERFORM pg_temp.check_eq('s leaves t',
    pg_temp.as_user(s, format($q$ SELECT public.end_teacher_link(%L)->>'ok' $q$, v_link)), 'true');
  PERFORM pg_temp.check_eq('s is in none of t groups',
    (SELECT count(*)::text FROM teacher_group_members WHERE teacher_id = t AND student_id = s), '0');
  PERFORM pg_temp.check_eq('s2 still in t group (positive control)',
    (SELECT count(*)::text FROM teacher_group_members WHERE teacher_id = t AND student_id = s2), '1');
  PERFORM pg_temp.check_eq('s still in t2 group (other teacher untouched)',
    (SELECT count(*)::text FROM teacher_group_members WHERE teacher_id = t2 AND student_id = s), '1');
  PERFORM pg_temp.check_eq('t cannot re-add s once unlinked',
    pg_temp.as_user(t, format($q$ SELECT public.add_teacher_group_members(%L, ARRAY[%L]::uuid[])->>'error' $q$, v_g1, s)), 'not_linked');
  -- the teacher removing the student does the same
  SELECT id INTO v_link FROM teacher_student_links WHERE teacher_id = t AND student_id = s2 AND ended_at IS NULL;
  PERFORM pg_temp.check_eq('t removes s2',
    pg_temp.as_user(t, format($q$ SELECT public.end_teacher_link(%L)->>'ok' $q$, v_link)), 'true');
  PERFORM pg_temp.check_eq('s2 is in none of t groups',
    (SELECT count(*)::text FROM teacher_group_members WHERE teacher_id = t AND student_id = s2), '0');
  PERFORM pg_temp.check_eq('the export read shows s2 no groups',
    pg_temp.as_user(s2, $q$ SELECT count(*)::text FROM public.my_group_memberships() $q$), '0');

  -- 8. delete a group: members go, other groups stay ------------------------
  INSERT INTO teacher_student_links (teacher_id, student_id, source) VALUES (t, s2, 'join_link');
  PERFORM pg_temp.check_eq('relink and group s2',
    pg_temp.as_user(t, format($q$ SELECT public.add_teacher_group_members(%L, ARRAY[%L]::uuid[])->>'ok' $q$, v_g1, s2)), 'true');
  PERFORM pg_temp.check_eq('add to second group',
    pg_temp.as_user(t, format($q$ SELECT public.add_teacher_group_members(%L, ARRAY[%L]::uuid[])->>'ok' $q$, v_g2, s2)), 'true');
  PERFORM pg_temp.check_eq('delete a group',
    pg_temp.as_user(t, format($q$ SELECT public.delete_teacher_group(%L)->>'ok' $q$, v_g1)), 'true');
  PERFORM pg_temp.check_eq('its memberships are gone',
    (SELECT count(*)::text FROM teacher_group_members WHERE group_id = v_g1), '0');
  PERFORM pg_temp.check_eq('the other group keeps its member (positive control)',
    (SELECT count(*)::text FROM teacher_group_members WHERE group_id = v_g2), '1');
  PERFORM pg_temp.check_eq('s2 stays linked',
    public._teacher_linked(t, s2)::text, 'true');

  -- 9. account deletion -----------------------------------------------------
  PERFORM pg_temp.check_eq('student delete ok',
    pg_temp.as_user(s2, $q$ SELECT public.delete_my_account()->>'ok' $q$), 'true');
  PERFORM pg_temp.check_eq('student memberships gone',
    (SELECT count(*)::text FROM teacher_group_members WHERE student_id = s2), '0');
  PERFORM pg_temp.check_eq('the teacher group itself survives (positive control)',
    (SELECT count(*)::text FROM teacher_groups WHERE id = v_g2), '1');
  PERFORM pg_temp.check_eq('teacher delete ok',
    pg_temp.as_user(t2, $q$ SELECT public.delete_my_account()->>'ok' $q$), 'true');
  PERFORM pg_temp.check_eq('teacher groups gone',
    (SELECT count(*)::text FROM teacher_groups WHERE teacher_id = t2), '0');
  PERFORM pg_temp.check_eq('its memberships gone',
    (SELECT count(*)::text FROM teacher_group_members WHERE teacher_id = t2), '0');
  PERFORM pg_temp.check_eq('other teacher groups untouched (positive control)',
    (SELECT count(*)::text FROM teacher_groups WHERE teacher_id = t), '2');

  RAISE NOTICE 'TCH-002 PASS';
END;
$$;

ROLLBACK;
