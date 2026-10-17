-- ============================================================
-- supabase/verify/083_seat_freeze.sql
--
-- TCH-008 full protocol for migration 083 (needs 082 and everything it
-- re-emits: 029, 041, 044-047, 055-071, 076-081). NOT a migration: run after
-- 083 is applied, as postgres. Seeds its own data and ROLLS BACK. A failed
-- assertion aborts with "TCH-008 FAIL: ...". Every denial is paired with a
-- positive control: the SAME calls, by the SAME teacher, succeed once an admin
-- renews the seat.
--
-- Shape: one call list (pg_temp.calls). Pass 1 runs every call as the teacher
-- whose seat is frozen and expects 'seat_lapsed' with the data fingerprint
-- unchanged. The admin renews the seat. Pass 2 runs the same list and expects
-- 'ok' with the fingerprint changed (a fingerprint that cannot move proves
-- nothing). Around them: who is NOT frozen, what a lapse must not change, and
-- a learner's lesson access printed before the lapse, during it and after the
-- renewal.
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
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('role', 'postgres', true);
  RETURN 'ERR:' || SQLSTATE;
END;
$$;

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

CREATE TEMP TABLE pg_temp.tally (n INTEGER NOT NULL);
INSERT INTO pg_temp.tally VALUES (0);

CREATE FUNCTION pg_temp.check_eq(p_label TEXT, p_got TEXT, p_want TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE pg_temp.tally SET n = n + 1;
  RAISE NOTICE '% -> got % (want %)', p_label, p_got, p_want;
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'TCH-008 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

-- The error code of a JSONB-returning call, or 'ok'.
CREATE FUNCTION pg_temp.res(p_user UUID, p_call TEXT)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT pg_temp.as_user(p_user, format('SELECT COALESCE((%s)->>''error'', ''ok'')', p_call))
$$;

CREATE TEMP TABLE pg_temp.calls (
  seq   INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  sql   TEXT NOT NULL
);

-- A hash of every row the frozen calls could touch.
CREATE FUNCTION pg_temp.fingerprint()
RETURNS TEXT LANGUAGE sql AS $$
  SELECT md5(concat_ws('|',
    (SELECT COALESCE(string_agg(c::text, ',' ORDER BY c.id), '') FROM courses c),
    (SELECT COALESCE(string_agg(l::text, ',' ORDER BY l.id), '') FROM lessons l),
    (SELECT COALESCE(string_agg(v.id::text, ',' ORDER BY v.id), '') FROM lesson_versions v),
    (SELECT COALESCE(string_agg(r::text, ',' ORDER BY r.id), '') FROM course_runs r),
    (SELECT COALESCE(string_agg(k::text, ',' ORDER BY k.id), '') FROM run_calls k),
    (SELECT COALESCE(string_agg(i::text, ',' ORDER BY i.id), '') FROM run_invites i),
    (SELECT COALESCE(string_agg(e::text, ',' ORDER BY e.id), '') FROM run_enrolments e),
    (SELECT COALESCE(string_agg(g::text, ',' ORDER BY g.id), '') FROM teacher_groups g),
    (SELECT COALESCE(string_agg(m::text, ',' ORDER BY m.group_id, m.student_id), '') FROM teacher_group_members m),
    (SELECT COALESCE(string_agg(h::text, ',' ORDER BY h.id), '') FROM homework_assignments h),
    (SELECT COALESCE(string_agg(t::text, ',' ORDER BY t.assignment_id, t.student_id, t.group_id), '') FROM homework_targets t),
    (SELECT COALESCE(string_agg(j::text, ',' ORDER BY j.teacher_id), '') FROM teacher_join_tokens j)
  ))
$$;

-- What a learner and a visitor can open, as one string.
CREATE FUNCTION pg_temp.access_snapshot(p_s5 UUID, p_s4 UUID, p_l1 UUID, p_l5 UUID, p_l6 UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT := '';
BEGIN
  v := v || 'anon L6=' || COALESCE(pg_temp.as_anon(format('SELECT public.lesson_state(%L)::text', p_l6)), 'null');
  v := v || ' anon L5=' || COALESCE(pg_temp.as_anon(format('SELECT public.lesson_state(%L)::text', p_l5)), 'null');
  v := v || ' s5 L5=' || COALESCE(pg_temp.as_user(p_s5, format('SELECT public.lesson_state(%L)::text', p_l5)), 'null');
  v := v || ' s5 L6=' || COALESCE(pg_temp.as_user(p_s5, format('SELECT public.lesson_state(%L)::text', p_l6)), 'null');
  v := v || ' s4 L5=' || COALESCE(pg_temp.as_user(p_s4, format('SELECT public.lesson_state(%L)::text', p_l5)), 'null');
  v := v || ' s5 can_read L5=' || COALESCE(pg_temp.as_user(p_s5, format('SELECT public.can_read_lesson(%L)::text', p_l5)), 'null');
  RETURN v;
END;
$$;

DO $$
DECLARE
  a   UUID := gen_random_uuid();   -- admin, no seat
  tl  UUID := gen_random_uuid();   -- the teacher whose seat lapses and is renewed
  t2  UUID := gen_random_uuid();   -- another teacher, active seat, own course
  e   UUID := gen_random_uuid();   -- editor of C1 with NO seat
  p   UUID := gen_random_uuid();   -- plain user
  s1  UUID := gen_random_uuid();   -- linked to tl, has a conversation
  s2  UUID := gen_random_uuid();   -- linked to tl, no conversation (student starts one)
  s3  UUID := gen_random_uuid();   -- linked to tl, no conversation (teacher starts one)
  s4  UUID := gen_random_uuid();   -- unlinked learner, no entitlement
  s5  UUID := gen_random_uuid();   -- learner entitled to C4 and enrolled in R1
  s6  UUID := gen_random_uuid();   -- linked to tl, leaves while the seat is frozen
  c1 UUID; c2 UUID; c3 UUID; c4 UUID; c9 UUID;
  l1 UUID; l2 UUID; l3 UUID; l4 UUID; l5 UUID; l6 UUID; l7 UUID;
  v1 UUID; v2 UUID; v3 UUID; v4 UUID; v5 UUID; v6 UUID;
  r1 UUID; r2 UUID; r3 UUID;
  k1 UUID; k2 UUID;
  i1 UUID; i2 UUID;
  en1 UUID; en_vs UUID;
  g1 UUID; g2 UUID; g3 UUID;
  h1 UUID; h2 UUID;
  conv UUID;
  sub1 UUID;
  r RECORD;
  f1 TEXT; f2 TEXT; f3 TEXT;
  a1 TEXT; a2 TEXT; a3 TEXT;
  v_res TEXT;
  v_n INTEGER;
  v_calls INTEGER;
  v_body JSONB := '{"paragraphs":[{"runs":[{"text":"Nice work"}]}]}';
  v_msg JSONB := '{"paragraphs":[{"runs":[{"text":"hello"}]}]}';
  v_link UUID;
  v_obj TEXT;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (a,  'authenticated', 'authenticated', 'a-'  || a  || '@verify.test'),
    (tl, 'authenticated', 'authenticated', 'tl-' || tl || '@verify.test'),
    (t2, 'authenticated', 'authenticated', 't2-' || t2 || '@verify.test'),
    (e,  'authenticated', 'authenticated', 'e-'  || e  || '@verify.test'),
    (p,  'authenticated', 'authenticated', 'p-'  || p  || '@verify.test'),
    (s1, 'authenticated', 'authenticated', 's1-' || s1 || '@verify.test'),
    (s2, 'authenticated', 'authenticated', 's2-' || s2 || '@verify.test'),
    (s3, 'authenticated', 'authenticated', 's3-' || s3 || '@verify.test'),
    (s4, 'authenticated', 'authenticated', 's4-' || s4 || '@verify.test'),
    (s5, 'authenticated', 'authenticated', 's5-' || s5 || '@verify.test'),
    (s6, 'authenticated', 'authenticated', 's6-' || s6 || '@verify.test');
  UPDATE profiles SET role = 'admin' WHERE id = a;

  INSERT INTO author_seats (user_id, kind, public_name, expires_at, granted_by) VALUES
    (tl, 'teacher', 'Verify TL', now() + interval '30 days', a),
    (t2, 'teacher', 'Verify T2', NULL, a);

  -- C1: self-paced draft of tl, with a co-editor who has no seat.
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v83-c1', 'C1', 'A2', 'draft', 'self_paced', 's', 'c') RETURNING id INTO c1;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v83-c2', 'C2', 'A2', 'draft', 'cohort', 's', 'c') RETURNING id INTO c2;
  INSERT INTO courses (slug, title, level, status, format)
    VALUES ('v83-c3', 'V83 Delete Me', 'A2', 'draft', 'self_paced') RETURNING id INTO c3;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v83-c4', 'C4', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO c4;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v83-c9', 'C9', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO c9;
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES
    (c1, tl, tl), (c1, e, a), (c2, tl, tl), (c3, tl, tl), (c4, tl, tl), (c9, t2, t2);

  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (c1, 1, 'L1', 'l1', 'anyone') RETURNING id INTO l1;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (c1, 2, 'L2', 'l2', 'signed_in') RETURNING id INTO l2;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (c1, 3, 'L3', 'l3', 'anyone') RETURNING id INTO l3;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week) VALUES (c2, 1, 'L4', 'l4', 'entitled', 1) RETURNING id INTO l4;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (c2, 2, 'L7', 'l7', 'entitled') RETURNING id INTO l7;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (c4, 1, 'L5', 'l5', 'entitled') RETURNING id INTO l5;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (c4, 2, 'L6', 'l6', 'anyone') RETURNING id INTO l6;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (l1, '[]'::jsonb, 'editor') RETURNING id INTO v1;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (l2, '[]'::jsonb, 'editor') RETURNING id INTO v2;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (l3, '[]'::jsonb, 'editor') RETURNING id INTO v3;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (l4, '[]'::jsonb, 'editor') RETURNING id INTO v4;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (l5, '[]'::jsonb, 'editor') RETURNING id INTO v5;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (l6, '[]'::jsonb, 'editor') RETURNING id INTO v6;
  UPDATE lessons SET published_version_id = v1 WHERE id = l1;
  UPDATE lessons SET published_version_id = v3 WHERE id = l3;
  UPDATE lessons SET published_version_id = v5 WHERE id = l5;
  UPDATE lessons SET published_version_id = v6 WHERE id = l6;
  INSERT INTO course_entitlements (user_id, course_id, source) VALUES (s5, c4, 'grant');

  -- C2: runs (R1 upcoming, R2 upcoming and empty, R3 started), calls, invites, an enrolment.
  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (c2, 'R1', now() + interval '2 days', now() + interval '30 days') RETURNING id INTO r1;
  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (c2, 'R2', now() + interval '5 days', now() + interval '33 days') RETURNING id INTO r2;
  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (c2, 'R3', now() - interval '2 days', now() + interval '26 days') RETURNING id INTO r3;
  INSERT INTO run_calls (run_id, starts_at, meet_url) VALUES (r1, now() + interval '3 days', 'https://meet.example/1') RETURNING id INTO k1;
  INSERT INTO run_calls (run_id, starts_at, meet_url) VALUES (r1, now() + interval '4 days', 'https://meet.example/2') RETURNING id INTO k2;
  INSERT INTO run_invites (run_id, tier, token_hash, invitee_name, invitee_contact, expires_at)
    VALUES (r1, 'basic', md5('v83-i1') || md5('v83-i1b'), 'I1', '@i1', now() + interval '7 days') RETURNING id INTO i1;
  INSERT INTO run_invites (run_id, tier, token_hash, invitee_name, invitee_contact, expires_at)
    VALUES (r1, 'basic', md5('v83-i2') || md5('v83-i2b'), 'I2', '@i2', now() + interval '7 days') RETURNING id INTO i2;
  INSERT INTO run_enrolments (run_id, user_id, tier) VALUES (r1, s5, 'basic') RETURNING id INTO en1;
  INSERT INTO run_enrolments (run_id, user_id, tier) VALUES (r3, s1, 'basic') RETURNING id INTO en_vs;

  -- A voice recording and a final comment awaiting tl's reply.
  INSERT INTO voice_submissions (id, enrolment_id, user_id, course_id, lesson_id, block_id,
                                 lesson_version_id, object_name, content_type)
    VALUES (gen_random_uuid(), en_vs, s1, c2, l4, 'b1', v4, 'verify/' || gen_random_uuid(), 'audio/webm')
    RETURNING id INTO sub1;

  -- tl's students, groups, homework, one existing conversation.
  INSERT INTO teacher_student_links (teacher_id, student_id, source) VALUES
    (tl, s1, 'join_link'), (tl, s2, 'join_link'), (tl, s3, 'join_link'), (tl, s6, 'join_link');
  INSERT INTO teacher_groups (teacher_id, name) VALUES (tl, 'G1') RETURNING id INTO g1;
  INSERT INTO teacher_groups (teacher_id, name) VALUES (tl, 'G2') RETURNING id INTO g2;
  INSERT INTO teacher_groups (teacher_id, name) VALUES (tl, 'G3') RETURNING id INTO g3;
  INSERT INTO teacher_group_members (group_id, teacher_id, student_id) VALUES (g3, tl, s2);
  INSERT INTO homework_assignments (teacher_id, course_id, lesson_id) VALUES (tl, c1, l1) RETURNING id INTO h1;
  INSERT INTO homework_assignments (teacher_id, course_id, lesson_id) VALUES (tl, c1, l3) RETURNING id INTO h2;
  INSERT INTO homework_targets (assignment_id, teacher_id, student_id) VALUES (h1, tl, s1), (h2, tl, s1);
  INSERT INTO teacher_conversations (teacher_id, student_id) VALUES (tl, s1) RETURNING id INTO conv;
  INSERT INTO teacher_messages (conversation_id, author_id, body) VALUES (conv, s1, v_msg);

  -- Seeded and not empty: the hosted-style "zero rows passes" trap.
  PERFORM pg_temp.check_eq('seed: tl edits 4 courses, has 4 live links, 3 groups, 2 assignments, 3 runs',
    ((SELECT count(*) FROM course_editors WHERE user_id = tl)::text || '/' ||
     (SELECT count(*) FROM teacher_student_links WHERE teacher_id = tl AND ended_at IS NULL)::text || '/' ||
     (SELECT count(*) FROM teacher_groups WHERE teacher_id = tl)::text || '/' ||
     (SELECT count(*) FROM homework_assignments WHERE teacher_id = tl)::text || '/' ||
     (SELECT count(*) FROM course_runs WHERE course_id = c2)::text), '4/4/3/2/3');

  -- ── 0. Static facts -------------------------------------------------------
  PERFORM pg_temp.check_eq('anon cannot execute studio_can_write',
    has_function_privilege('anon', 'public.studio_can_write()', 'EXECUTE')::text, 'false');
  PERFORM pg_temp.check_eq('authenticated can execute studio_can_write',
    has_function_privilege('authenticated', 'public.studio_can_write()', 'EXECUTE')::text, 'true');
  PERFORM pg_temp.check_eq('authenticated cannot execute _studio_can_write(uuid) (no probing other users)',
    has_function_privilege('authenticated', 'public._studio_can_write(uuid)', 'EXECUTE')::text, 'false');
  PERFORM pg_temp.check_eq('anon cannot execute my_author_seat_state',
    has_function_privilege('anon', 'public.my_author_seat_state()', 'EXECUTE')::text, 'false');
  PERFORM pg_temp.check_eq('anon cannot execute any re-emitted write function',
    (SELECT count(*)::text FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace AND prosrc LIKE '%_studio_can_write(%'
        AND proname NOT IN ('studio_can_write', '_studio_can_write', '_ask_teacher_allowed')
        AND has_function_privilege('anon', oid, 'EXECUTE')), '0');
  PERFORM pg_temp.check_eq('the three lesson-images editor policies carry the predicate (the delete policy cannot be driven from SQL: storage.protect_delete)',
    (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname LIKE 'lesson_images: editor %' AND COALESCE(qual, '') || COALESCE(with_check, '') LIKE '%studio_can_write()%'), '3');
  PERFORM pg_temp.check_eq('anon: studio_can_write refused',
    pg_temp.as_anon('SELECT public.studio_can_write()::text'), 'ERR:42501');

  -- Coverage: every function that guards on the predicate is the 35 write RPCs
  -- plus the two messaging bodies and the predicate's own wrappers, plus (084,
  -- COH-014) _calendar_scope_check, the one check behind the three event
  -- writes; every OTHER function that uses an editor or teacher gate is a
  -- read, a learner-side path, or a reply (listed, so a new unguarded write
  -- RPC fails here).
  PERFORM pg_temp.check_eq('guarded functions (prosrc calls _studio_can_write), excluding the helpers',
    (SELECT count(*)::text FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace AND prosrc LIKE '%_studio_can_write(%'
        AND proname NOT IN ('studio_can_write', '_studio_can_write')), '38');
  PERFORM pg_temp.check_eq('gate users WITHOUT the guard are exactly the reads, learner paths and replies',
    (SELECT string_agg(proname, ',' ORDER BY proname) FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
        AND (prosrc ILIKE '%can_edit_course(%' OR prosrc ILIKE '%_is_teacher(%' OR prosrc ILIKE '%_teacher_linked(%')
        AND prosrc NOT LIKE '%_studio_can_write(%'),
    '_homework_recipients,_lesson_access_at,_teacher_readable_lessons,calendar_events,claim_run_invite,course_calls,course_delete_blockers,course_run_invites,course_stats,homework_assignable,join_teacher,learner_lessons,learner_recordings,learner_roster,linked_student_assigned_lessons,linked_student_attempts,linked_student_lesson_scores,message_threads,my_calendar,my_conversations_export,my_teacher_join_link_state,review_final_comments,review_queue,run_invite_preview,save_final_comment,save_voice_feedback,teacher_join_preview,teacher_linked_students');

  -- ── 1. Before the lapse -----------------------------------------------------
  PERFORM pg_temp.check_eq('active seat: studio_can_write is true',
    pg_temp.as_user(tl, 'SELECT public.studio_can_write()::text'), 'true');
  PERFORM pg_temp.check_eq('active seat: my_author_seat_state is active with an expiry',
    pg_temp.as_user(tl, 'SELECT (SELECT is_active::text || '':'' || (expires_at IS NOT NULL)::text FROM public.my_author_seat_state())'), 'true:true');
  PERFORM pg_temp.check_eq('control while active: tl edits a lesson title',
    pg_temp.res(tl, format('public.update_lesson(%L, ''L1 active'', NULL, 5)', l1)), 'ok');
  a1 := pg_temp.access_snapshot(s5, s4, l1, l5, l6);
  RAISE NOTICE 'access BEFORE the lapse: %', a1;
  PERFORM pg_temp.check_eq('access snapshot is not vacuous (s5 and s4 differ on the entitled lesson)',
    (pg_temp.as_user(s5, format('SELECT public.can_read_lesson(%L)::text', l5))
      <> pg_temp.as_user(s4, format('SELECT public.can_read_lesson(%L)::text', l5)))::text, 'true');

  -- ── 2. The call list -------------------------------------------------------
  INSERT INTO pg_temp.calls (seq, label, sql) VALUES
    (1,  'update_lesson',                format('public.update_lesson(%L, ''L1 edited'', ''d'', 7)', l1)),
    (2,  'update_lesson_slug',           format('public.update_lesson_slug(%L, ''v83-l2b'')', l2)),
    (3,  'update_course',                format('public.update_course(%L, ''C1 edited'', ''d'', ''A2'', ''sub'', ''cov'')', c1)),
    (4,  'save_lesson_version',          format('public.save_lesson_version(%L, ''[]''::jsonb, %L)', l2, v2)),
    (5,  'publish_lesson',               format('public.publish_lesson(%L, %L, 0)', l3, v3)),
    (6,  'reorder_lessons',              format('public.reorder_lessons(%L, ARRAY[%L, %L, %L]::uuid[])', c1, l2, l1, l3)),
    (7,  'set_lesson_access_level',      format('public.set_lesson_access_level(%L, ''signed_in'')', l3)),
    (8,  'set_lesson_archived',          format('public.set_lesson_archived(%L, true)', l3)),
    (9,  'create_lesson',                format('public.create_lesson(%L, ''New one'', ''v83-new'', NULL)', c1)),
    (10, 'set_course_format',            format('public.set_course_format(%L, ''self_paced'')', c1)),
    (11, 'set_course_how_to_join_url',   format('public.set_course_how_to_join_url(%L, ''https://example.com/join'')', c1)),
    (12, 'publish_course',               format('public.publish_course(%L)', c1)),
    (13, 'unpublish_course',             format('public.unpublish_course(%L)', c1)),
    (14, 'delete_course',                format('public.delete_course(%L, ''V83 Delete Me'')', c3)),
    (15, 'set_lesson_week',              format('public.set_lesson_week(%L, 1)', l7)),
    (16, 'create_run',                   format('public.create_run(%L, now() + interval ''3 days'', ''RunX'')', c2)),
    (17, 'update_run',                   format('public.update_run(%L, now() + interval ''2 days'', ''R1 edited'')', r1)),
    (18, 'close_run',                    format('public.close_run(%L, now())', r3)),
    (19, 'delete_run',                   format('public.delete_run(%L)', r2)),
    (20, 'create_call',                  format('public.create_call(%L, now() + interval ''6 days'', ''https://meet.example/3'', ''Call 3'')', r1)),
    (21, 'update_call',                  format('public.update_call(%L, now() + interval ''3 days'', ''https://meet.example/1b'', ''Call 1'')', k1)),
    (22, 'delete_call',                  format('public.delete_call(%L)', k2)),
    (23, 'create_run_invite',            format('public.create_run_invite(%L, ''basic'', ''New invitee'', ''@verify_new'')', r1)),
    (24, 'revoke_run_invite',            format('public.revoke_run_invite(%L)', i1)),
    (25, 'delete_run_invite',            format('public.delete_run_invite(%L)', i2)),
    (26, 'set_enrolment_tier',           format('public.set_enrolment_tier(%L, ''extended'')', en1)),
    (27, 'rotate_teacher_join_token',    'public.rotate_teacher_join_token()'),
    (28, 'create_teacher_group',         'public.create_teacher_group(''V83 new group'')'),
    (29, 'rename_teacher_group',         format('public.rename_teacher_group(%L, ''G1 renamed'')', g1)),
    (30, 'delete_teacher_group',         format('public.delete_teacher_group(%L)', g2)),
    (31, 'add_teacher_group_members',    format('public.add_teacher_group_members(%L, ARRAY[%L]::uuid[])', g3, s1)),
    (32, 'remove_teacher_group_member',  format('public.remove_teacher_group_member(%L, %L)', g3, s2)),
    (33, 'assign_homework',              format('public.assign_homework(%L, %L, NULL, ''do it'', ARRAY[%L]::uuid[], ARRAY[]::uuid[])', c1, l1, s1)),
    (34, 'update_homework',              format('public.update_homework(%L, current_date + 3, ''later'')', h1)),
    (35, 'delete_homework',              format('public.delete_homework(%L)', h2));
  SELECT count(*) INTO v_calls FROM pg_temp.calls;
  PERFORM pg_temp.check_eq('the call list covers 35 write RPCs', v_calls::text, '35');

  -- ── 3. The seat lapses ------------------------------------------------------
  PERFORM pg_temp.check_eq('admin freezes the seat',
    pg_temp.res(a, format('public.freeze_author_seat(%L)', tl)), 'ok');
  PERFORM pg_temp.check_eq('lapsed: studio_can_write is false',
    pg_temp.as_user(tl, 'SELECT public.studio_can_write()::text'), 'false');
  PERFORM pg_temp.check_eq('lapsed: my_author_seat_state is inactive and still carries the date',
    pg_temp.as_user(tl, 'SELECT (SELECT is_active::text || '':'' || (expires_at IS NOT NULL)::text FROM public.my_author_seat_state())'), 'false:true');
  a2 := pg_temp.access_snapshot(s5, s4, l1, l5, l6);
  RAISE NOTICE 'access DURING the lapse: %', a2;
  PERFORM pg_temp.check_eq('a learner''s lesson access is identical before and during the lapse', a2, a1);

  f1 := pg_temp.fingerprint();
  FOR r IN SELECT * FROM pg_temp.calls ORDER BY seq LOOP
    PERFORM pg_temp.check_eq('FROZEN ' || r.seq || ' ' || r.label, pg_temp.res(tl, r.sql), 'seat_lapsed');
  END LOOP;
  f2 := pg_temp.fingerprint();
  PERFORM pg_temp.check_eq('no frozen call changed any row (fingerprint of 12 tables)', (f2 = f1)::text, 'true');

  -- The real expiry path, not the freeze RPC: a date that simply passes.
  UPDATE author_seats SET expires_at = now() - interval '1 second' WHERE user_id = tl;
  PERFORM pg_temp.check_eq('a seat whose date has passed refuses too (update_lesson)',
    pg_temp.res(tl, format('public.update_lesson(%L, ''x'', NULL, 5)', l1)), 'seat_lapsed');

  -- Who is not frozen, and who is refused for a different reason ------------
  PERFORM pg_temp.check_eq('admin with NO seat still writes (positive control)',
    pg_temp.res(a, format('public.update_lesson(%L, ''L1 by admin'', NULL, 5)', l1)), 'ok');
  PERFORM pg_temp.check_eq('another teacher with an active seat writes to their own course (positive control)',
    pg_temp.res(t2, format('public.create_lesson(%L, ''T2 lesson'', ''t2-lesson'', NULL)', c9)), 'ok');
  PERFORM pg_temp.check_eq('...but not to tl''s course: forbidden, not seat_lapsed',
    pg_temp.res(t2, format('public.update_lesson(%L, ''x'', NULL, 5)', l1)), 'forbidden');
  PERFORM pg_temp.check_eq('a plain user on tl''s course: forbidden, not seat_lapsed',
    pg_temp.res(p, format('public.update_lesson(%L, ''x'', NULL, 5)', l1)), 'forbidden');
  PERFORM pg_temp.check_eq('an editor with NO seat is refused as lapsed (0155 Decision 1)',
    pg_temp.res(e, format('public.update_lesson(%L, ''x'', NULL, 5)', l1)), 'seat_lapsed');
  PERFORM pg_temp.check_eq('a student cannot use the teacher RPCs: create_teacher_group forbidden',
    pg_temp.res(s1, 'public.create_teacher_group(''nope'')'), 'forbidden');

  -- Lesson images: the storage policies --------------------------------------
  v_obj := c1::text || '/seed.png';
  INSERT INTO storage.objects (bucket_id, name) VALUES ('lesson-images', v_obj);
  PERFORM pg_temp.check_eq('FROZEN storage INSERT into the course folder is refused',
    pg_temp.as_user(tl, format($q$ WITH i AS (INSERT INTO storage.objects (bucket_id, name) VALUES ('lesson-images', %L) RETURNING 1) SELECT 'ok' FROM i $q$, c1::text || '/frozen.png')),
    'ERR:42501');
  PERFORM pg_temp.check_eq('FROZEN storage UPDATE touches 0 rows',
    pg_temp.as_user(tl, format($q$ WITH u AS (UPDATE storage.objects SET metadata = '{"v":1}'::jsonb WHERE bucket_id = 'lesson-images' AND name = %L RETURNING 1) SELECT count(*)::text FROM u $q$, v_obj)),
    '0');
  PERFORM pg_temp.check_eq('public read of lesson images is untouched (anon sees the seed object)',
    pg_temp.as_anon(format($q$ SELECT count(*)::text FROM storage.objects WHERE bucket_id = 'lesson-images' AND name = %L $q$, v_obj)), '1');

  -- ── 4. Unchanged by a lapse -------------------------------------------------
  PERFORM pg_temp.check_eq('reads: tl still lists the 4 linked students',
    pg_temp.as_user(tl, 'SELECT count(*)::text FROM public.teacher_linked_students()'), '4');
  PERFORM pg_temp.check_eq('reads: tl still reads the run''s invites',
    pg_temp.as_user(tl, format('SELECT count(*)::text FROM public.course_run_invites(%L)', c2)), '2');
  PERFORM pg_temp.check_eq('reads: tl still reads the conversation (1 message)',
    pg_temp.as_user(tl, format('SELECT count(*)::text FROM public.conversation_messages(%L, %L)', tl, s1)), '1');
  PERFORM pg_temp.check_eq('reads: can_edit_course is unchanged for the frozen teacher',
    pg_temp.as_user(tl, format('SELECT public.can_edit_course(%L, %L)::text', c1, tl)), 'true');
  PERFORM pg_temp.check_eq('published course: still published, its open lesson still published',
    (SELECT c.status || ':' || (l.published_version_id IS NOT NULL)::text FROM courses c JOIN lessons l ON l.course_id = c.id WHERE l.id = l6), 'published:true');
  PERFORM pg_temp.check_eq('enrolments and entitlements are untouched (count)',
    ((SELECT count(*) FROM run_enrolments WHERE id IN (en1, en_vs))
     + (SELECT count(*) FROM course_entitlements WHERE user_id = s5))::text, '3');
  PERFORM pg_temp.check_eq('links are untouched (4 live links)',
    (SELECT count(*)::text FROM teacher_student_links WHERE teacher_id = tl AND ended_at IS NULL), '4');

  -- Replies and feedback ------------------------------------------------------
  PERFORM pg_temp.check_eq('REPLY: the frozen teacher answers in the existing conversation',
    pg_temp.res(tl, format('public.send_teacher_message(%L, %L, %L::jsonb)', tl, s1, v_msg)), 'ok');
  PERFORM pg_temp.check_eq('REPLY: the student writes again in it',
    pg_temp.res(s1, format('public.send_teacher_message(%L, %L, %L::jsonb)', tl, s1, v_msg)), 'ok');
  PERFORM pg_temp.check_eq('NEW thread: s2 cannot start one with the frozen teacher',
    pg_temp.res(s2, format('public.send_teacher_message(%L, %L, %L::jsonb)', tl, s2, v_msg)), 'teacher_unavailable');
  PERFORM pg_temp.check_eq('NEW thread: the frozen teacher cannot start one with s3',
    pg_temp.res(tl, format('public.send_teacher_message(%L, %L, %L::jsonb)', tl, s3, v_msg)), 'seat_lapsed');
  PERFORM pg_temp.check_eq('NEW thread: nothing was created for s2 or s3',
    (SELECT count(*)::text FROM teacher_conversations WHERE teacher_id = tl AND student_id IN (s2, s3)), '0');
  PERFORM pg_temp.check_eq('ask options: s2 (no thread) is not offered the frozen teacher',
    pg_temp.as_user(s2, format('SELECT count(*)::text FROM public.ask_teacher_options(%L)', l1)), '0');
  PERFORM pg_temp.check_eq('ask options: s1 (has a thread) still is (positive control)',
    pg_temp.as_user(s1, format('SELECT count(*)::text FROM public.ask_teacher_options(%L)', l1)), '1');
  PERFORM pg_temp.check_eq('VOICE: the frozen teacher still saves feedback on a recording',
    pg_temp.res(tl, format('public.save_voice_feedback(%L, %L::jsonb, false)', sub1, v_body)), 'ok');
  PERFORM pg_temp.check_eq('VOICE: ...and still saves a final comment',
    pg_temp.res(tl, format('public.save_final_comment(%L, %L::jsonb, false)', en_vs, v_body)), 'ok');
  SELECT l.id INTO v_link FROM teacher_student_links l WHERE l.teacher_id = tl AND l.student_id = s6 AND l.ended_at IS NULL;
  PERFORM pg_temp.check_eq('LINKS: a student can still leave the frozen teacher',
    pg_temp.res(s6, format('public.end_teacher_link(%L)', v_link)), 'ok');

  -- ── 5. The seat is renewed ---------------------------------------------------
  PERFORM pg_temp.check_eq('admin renews the seat',
    pg_temp.res(a, format('public.set_author_seat_expiry(%L, now() + interval ''30 days'')', tl)), 'ok');
  PERFORM pg_temp.check_eq('renewed: studio_can_write is true again',
    pg_temp.as_user(tl, 'SELECT public.studio_can_write()::text'), 'true');
  a3 := pg_temp.access_snapshot(s5, s4, l1, l5, l6);
  RAISE NOTICE 'access AFTER the renewal: %', a3;
  PERFORM pg_temp.check_eq('a learner''s lesson access is identical after the renewal', a3, a1);

  f1 := pg_temp.fingerprint();
  FOR r IN SELECT * FROM pg_temp.calls ORDER BY seq LOOP
    PERFORM pg_temp.check_eq('RENEWED ' || r.seq || ' ' || r.label, pg_temp.res(tl, r.sql), 'ok');
  END LOOP;
  f3 := pg_temp.fingerprint();
  PERFORM pg_temp.check_eq('the same calls changed rows once renewed (fingerprint moved)', (f3 <> f1)::text, 'true');

  PERFORM pg_temp.check_eq('RENEWED storage INSERT into the course folder works (positive control)',
    pg_temp.as_user(tl, format($q$ WITH i AS (INSERT INTO storage.objects (bucket_id, name) VALUES ('lesson-images', %L) RETURNING 1) SELECT 'ok' FROM i $q$, c1::text || '/renewed.png')),
    'ok');
  PERFORM pg_temp.check_eq('RENEWED storage UPDATE touches the row',
    pg_temp.as_user(tl, format($q$ WITH u AS (UPDATE storage.objects SET metadata = '{"v":1}'::jsonb WHERE bucket_id = 'lesson-images' AND name = %L RETURNING 1) SELECT count(*)::text FROM u $q$, v_obj)),
    '1');
  PERFORM pg_temp.check_eq('RENEWED new thread: s2 can start one with the teacher',
    pg_temp.res(s2, format('public.send_teacher_message(%L, %L, %L::jsonb)', tl, s2, v_msg)), 'ok');
  PERFORM pg_temp.check_eq('RENEWED new thread: the teacher can start one with s3',
    pg_temp.res(tl, format('public.send_teacher_message(%L, %L, %L::jsonb)', tl, s3, v_msg)), 'ok');
  PERFORM pg_temp.check_eq('RENEWED ask options: s2 now sees the teacher',
    pg_temp.as_user(s2, format('SELECT count(*)::text FROM public.ask_teacher_options(%L)', l1)), '1');

  RAISE NOTICE 'TCH-008 PASS: 083 full protocol (% asserted cells)', (SELECT n FROM pg_temp.tally);
END;
$$;

ROLLBACK;
