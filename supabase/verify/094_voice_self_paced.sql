-- ============================================================
-- supabase/verify/094_voice_self_paced.sql
--
-- VOICE-010 full protocol for migration 094 (needs everything through 093). NOT a
-- migration: run after 094 is applied, as postgres. Seeds its own data and ROLLS BACK.
-- A failed assertion aborts with "VOICE-010 FAIL: ...". Every denial is paired with a
-- positive control: the same call by a caller who may, or the same caller on a lesson
-- they may open.
--
-- Callers: anon; p (signed in, no entitlement); g (a grant on the self-paced course);
-- gd (a grant on a draft course); ed (editor of the self-paced course); en (enrolled in
-- the cohort run in progress); en2 (enrolled in a run that has not started, and granted);
-- p2 (signed in, not enrolled in the cohort course); ed2 (editor of the cohort course).
-- Lessons: anyone, signed_in and entitled, each with a voice task, in a published
-- self-paced course (CS); a lesson with no voice task (CN); a draft course (CD); a
-- published course whose only voice lesson is entitled (CE); a published cohort course
-- (CC) with an anyone lesson and an entitled week-1 lesson.
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

CREATE FUNCTION pg_temp.as_service(p_sql TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  PERFORM set_config('role', 'service_role', true);
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
    RAISE EXCEPTION 'VOICE-010 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

-- The object the upload would have left in the bucket (the RPC checks it exists).
CREATE FUNCTION pg_temp.put_object(p_course UUID, p_user UUID, p_sub UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v_name TEXT := p_course::text || '/' || p_user::text || '/' || p_sub::text || '.webm';
BEGIN
  INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
  VALUES ('voice-recordings', v_name, p_user::text, '{"mimetype":"audio/webm","size":1234}'::jsonb);
  RETURN v_name;
END;
$$;

-- submit_voice_recording as p_user for a fresh submission id: 'ok:<slot>' or the error code.
CREATE FUNCTION pg_temp.send(p_user UUID, p_course UUID, p_lesson UUID, p_sub UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v_obj TEXT; v TEXT;
BEGIN
  v_obj := pg_temp.put_object(p_course, p_user, p_sub);
  v := pg_temp.as_user(p_user, format(
    $q$ SELECT CASE WHEN r->>'ok' = 'true' THEN 'ok:' || (r->>'slot') ELSE r->>'error' END
        FROM (SELECT public.submit_voice_recording(%L, %L, 'vt1', %L) AS r) x $q$,
    p_sub, p_lesson, v_obj));
  RETURN v;
END;
$$;

-- An INSERT into the bucket as p_user: 'ok' or the SQLSTATE.
CREATE FUNCTION pg_temp.upload(p_user UUID, p_course UUID, p_segment_user UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  RETURN pg_temp.as_user(p_user, format(
    $q$ WITH i AS (INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('voice-recordings', %L, %L) RETURNING 1) SELECT 'ok' FROM i $q$,
    p_course::text || '/' || p_segment_user::text || '/' || gen_random_uuid()::text || '.webm', p_user::text));
END;
$$;

DO $$
DECLARE
  p   UUID := gen_random_uuid();
  g   UUID := gen_random_uuid();
  gd  UUID := gen_random_uuid();
  ge  UUID := gen_random_uuid();
  ed  UUID := gen_random_uuid();
  en  UUID := gen_random_uuid();
  en2 UUID := gen_random_uuid();
  p2  UUID := gen_random_uuid();
  ed2 UUID := gen_random_uuid();
  cs UUID; cn UUID; cd UUID; ce UUID; cc UUID;
  la UUID; ls UUID; le UUID; ln UUID; ld UUID; lee UUID; lca UUID; lce UUID;
  va UUID; vs UUID; ve UUID; vn UUID; vd UUID; vee UUID; vca UUID; vce UUID;
  rc UUID; rf UUID; ro UUID;
  en_id UUID; en2_id UUID; en_old UUID;
  doc JSONB := '[{"id":"vt1","kind":"task","type":"voice","prompt":{"paragraphs":[{"runs":[{"text":"Say it"}]}],"maxSeconds":60}}]';
  s1 UUID := gen_random_uuid(); s2 UUID := gen_random_uuid(); s3 UUID := gen_random_uuid();
  s4 UUID := gen_random_uuid(); s5 UUID := gen_random_uuid(); s6 UUID := gen_random_uuid();
  s7 UUID := gen_random_uuid(); s8 UUID := gen_random_uuid(); s9 UUID := gen_random_uuid();
  obj1 TEXT; obj2 TEXT;
  v_res TEXT;
  v_n INTEGER;
  v_rows TEXT;
  sub_enrolled UUID; sub_self UUID; sub_old_self UUID; sub_old_coh UUID;
  v_body JSONB := '{"paragraphs":[{"runs":[{"text":"Nice work"}]}]}';
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (p,   'authenticated', 'authenticated', 'p-'   || p   || '@verify.test'),
    (g,   'authenticated', 'authenticated', 'g-'   || g   || '@verify.test'),
    (gd,  'authenticated', 'authenticated', 'gd-'  || gd  || '@verify.test'),
    (ge,  'authenticated', 'authenticated', 'ge-'  || ge  || '@verify.test'),
    (ed,  'authenticated', 'authenticated', 'ed-'  || ed  || '@verify.test'),
    (en,  'authenticated', 'authenticated', 'en-'  || en  || '@verify.test'),
    (en2, 'authenticated', 'authenticated', 'en2-' || en2 || '@verify.test'),
    (p2,  'authenticated', 'authenticated', 'p2-'  || p2  || '@verify.test'),
    (ed2, 'authenticated', 'authenticated', 'ed2-' || ed2 || '@verify.test');

  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v94-cs', 'CS', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO cs;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v94-cn', 'CN', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO cn;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v94-cd', 'CD', 'A2', 'draft', 'self_paced', 's', 'c') RETURNING id INTO cd;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v94-ce', 'CE', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO ce;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v94-cc', 'CC', 'A2', 'published', 'cohort', 's', 'c') RETURNING id INTO cc;
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES (cs, ed, ed), (cc, ed2, ed2);

  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cs, 1, 'LA', 'la', 'anyone')    RETURNING id INTO la;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cs, 2, 'LS', 'ls', 'signed_in') RETURNING id INTO ls;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cs, 3, 'LE', 'le', 'entitled')  RETURNING id INTO le;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cn, 1, 'LN', 'ln', 'anyone')    RETURNING id INTO ln;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cd, 1, 'LD', 'ld', 'anyone')    RETURNING id INTO ld;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (ce, 1, 'LEE', 'lee', 'entitled') RETURNING id INTO lee;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cc, 1, 'LCA', 'lca', 'anyone')  RETURNING id INTO lca;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week) VALUES (cc, 2, 'LCE', 'lce', 'entitled', 1) RETURNING id INTO lce;

  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (la,  doc, 'editor') RETURNING id INTO va;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (ls,  doc, 'editor') RETURNING id INTO vs;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (le,  doc, 'editor') RETURNING id INTO ve;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (ln,  '[]'::jsonb, 'editor') RETURNING id INTO vn;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (ld,  doc, 'editor') RETURNING id INTO vd;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (lee, doc, 'editor') RETURNING id INTO vee;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (lca, doc, 'editor') RETURNING id INTO vca;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (lce, doc, 'editor') RETURNING id INTO vce;
  UPDATE lessons SET published_version_id = va  WHERE id = la;
  UPDATE lessons SET published_version_id = vs  WHERE id = ls;
  UPDATE lessons SET published_version_id = ve  WHERE id = le;
  UPDATE lessons SET published_version_id = vn  WHERE id = ln;
  UPDATE lessons SET published_version_id = vd  WHERE id = ld;
  UPDATE lessons SET published_version_id = vee WHERE id = lee;
  UPDATE lessons SET published_version_id = vca WHERE id = lca;
  UPDATE lessons SET published_version_id = vce WHERE id = lce;

  INSERT INTO course_entitlements (user_id, course_id, source) VALUES
    (g, cs, 'grant'), (gd, cd, 'grant'), (ge, ce, 'grant'), (en2, cc, 'grant');

  -- CC: RC in progress (en), RF not started (en2), RO ended long ago (retention control).
  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (cc, 'RC', now() - interval '2 days', now() + interval '26 days') RETURNING id INTO rc;
  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (cc, 'RF', now() + interval '5 days', now() + interval '33 days') RETURNING id INTO rf;
  -- RO has already ended; the guards refuse to enrol into an ended run, so this one
  -- seed row disables the tables' user triggers (owner, rolled back with everything else).
  ALTER TABLE course_runs DISABLE TRIGGER USER;
  ALTER TABLE run_enrolments DISABLE TRIGGER USER;
  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (cc, 'RO', '2025-12-01 12:00+00', '2026-01-31 12:00+00') RETURNING id INTO ro;
  INSERT INTO run_enrolments (run_id, user_id, tier) VALUES (ro, ge, 'basic')  RETURNING id INTO en_old;
  ALTER TABLE course_runs ENABLE TRIGGER USER;
  ALTER TABLE run_enrolments ENABLE TRIGGER USER;
  INSERT INTO run_enrolments (run_id, user_id, tier) VALUES (rc, en, 'basic')  RETURNING id INTO en_id;
  INSERT INTO run_enrolments (run_id, user_id, tier) VALUES (rf, en2, 'basic') RETURNING id INTO en2_id;

  PERFORM pg_temp.check_eq('seed: 5 courses, 8 lessons all published, 4 grants, 3 enrolments',
    ((SELECT count(*) FROM courses WHERE slug LIKE 'v94-%')::text || '/' ||
     (SELECT count(*) FROM lessons WHERE course_id IN (cs, cn, cd, ce, cc) AND published_version_id IS NOT NULL)::text || '/' ||
     (SELECT count(*) FROM course_entitlements WHERE course_id IN (cs, cd, ce, cc))::text || '/' ||
     (SELECT count(*) FROM run_enrolments WHERE run_id IN (rc, rf, ro))::text), '5/8/4/3');

  -- ── 0. Static facts -------------------------------------------------------
  PERFORM pg_temp.check_eq('voice_submissions.enrolment_id is nullable',
    (SELECT is_nullable FROM information_schema.columns WHERE table_name = 'voice_submissions' AND column_name = 'enrolment_id'), 'YES');
  PERFORM pg_temp.check_eq('the partial unique index exists with its predicate',
    (SELECT indexdef FROM pg_indexes WHERE indexname = 'voice_submissions_one_self_paced_per_slot'),
    'CREATE UNIQUE INDEX voice_submissions_one_self_paced_per_slot ON public.voice_submissions USING btree (user_id, lesson_id, block_id) WHERE (enrolment_id IS NULL)');
  PERFORM pg_temp.check_eq('the old per-enrolment unique constraint is still there',
    (SELECT count(*)::text FROM pg_constraint WHERE conname = 'voice_submissions_one_per_slot'), '1');
  PERFORM pg_temp.check_eq('anon cannot execute submit_voice_recording',
    has_function_privilege('anon', 'public.submit_voice_recording(uuid,uuid,text,text)', 'EXECUTE')::text, 'false');
  PERFORM pg_temp.check_eq('authenticated can execute submit_voice_recording',
    has_function_privilege('authenticated', 'public.submit_voice_recording(uuid,uuid,text,text)', 'EXECUTE')::text, 'true');
  PERFORM pg_temp.check_eq('anon cannot execute can_send_self_paced_voice',
    has_function_privilege('anon', 'public.can_send_self_paced_voice(uuid)', 'EXECUTE')::text, 'false');
  PERFORM pg_temp.check_eq('authenticated can execute can_send_self_paced_voice',
    has_function_privilege('authenticated', 'public.can_send_self_paced_voice(uuid)', 'EXECUTE')::text, 'true');
  PERFORM pg_temp.check_eq('authenticated cannot execute voice_purge_due',
    has_function_privilege('authenticated', 'public.voice_purge_due(timestamptz)', 'EXECUTE')::text, 'false');
  PERFORM pg_temp.check_eq('service_role can execute voice_purge_due',
    has_function_privilege('service_role', 'public.voice_purge_due(timestamptz)', 'EXECUTE')::text, 'true');
  PERFORM pg_temp.check_eq('anon has no SELECT on voice_submissions',
    has_table_privilege('anon', 'public.voice_submissions', 'SELECT')::text, 'false');

  -- ── 1. Storage INSERT policy ---------------------------------------------
  -- Anonymous-path rows (re-run): a visitor can neither upload nor read.
  PERFORM pg_temp.check_eq('anon upload to a published course with an open voice lesson is refused',
    pg_temp.as_anon(format($q$ WITH i AS (INSERT INTO storage.objects (bucket_id, name) VALUES ('voice-recordings', %L) RETURNING 1) SELECT 'ok' FROM i $q$,
      cs::text || '/' || p::text || '/' || gen_random_uuid()::text || '.webm')), 'ERR:42501');
  PERFORM pg_temp.check_eq('anon sees 0 voice_submissions (no grant)',
    pg_temp.as_anon('SELECT count(*)::text FROM public.voice_submissions'), 'ERR:42501');

  PERFORM pg_temp.check_eq('policy: p uploads under their own segment of CS (signed-in, open voice lessons) [positive control]',
    pg_temp.upload(p, cs, p), 'ok');
  PERFORM pg_temp.check_eq('policy: p uploads under g''s segment of CS: refused',
    pg_temp.upload(p, cs, g), 'ERR:42501');
  PERFORM pg_temp.check_eq('policy: p uploads to CN (open lesson, no voice task): refused',
    pg_temp.upload(p, cn, p), 'ERR:42501');
  PERFORM pg_temp.check_eq('policy: p uploads to CD (draft course): refused',
    pg_temp.upload(p, cd, p), 'ERR:42501');
  PERFORM pg_temp.check_eq('policy: gd (granted) uploads to CD (draft course) [positive control, 060''s branch]',
    pg_temp.upload(gd, cd, gd), 'ok');
  PERFORM pg_temp.check_eq('policy: p uploads to CE (its only voice lesson is entitled): refused',
    pg_temp.upload(p, ce, p), 'ERR:42501');
  PERFORM pg_temp.check_eq('policy: ge (granted) uploads to CE [positive control]',
    pg_temp.upload(ge, ce, ge), 'ok');
  PERFORM pg_temp.check_eq('policy: p uploads to a course id that does not exist: refused',
    pg_temp.upload(p, gen_random_uuid(), p), 'ERR:42501');
  PERFORM pg_temp.check_eq('policy: en (enrolled) uploads to CC [positive control, 060''s branch]',
    pg_temp.upload(en, cc, en), 'ok');
  PERFORM pg_temp.check_eq('policy: p2 (not enrolled) uploads to CC (anyone lesson with a voice task)',
    pg_temp.upload(p2, cc, p2), 'ok');
  PERFORM pg_temp.check_eq('can_send_self_paced_voice(CS) for p / anon-less call / CE for p',
    pg_temp.as_user(p, format('SELECT public.can_send_self_paced_voice(%L)::text', cs)) || '/' ||
    pg_temp.as_user(p, format('SELECT public.can_send_self_paced_voice(%L)::text', cn)) || '/' ||
    pg_temp.as_user(p, format('SELECT public.can_send_self_paced_voice(%L)::text', ce)), 'true/false/false');
  -- The bucket's read policy is unchanged: p cannot read g's object, ed (editor of CS) can.
  INSERT INTO storage.objects (bucket_id, name, owner_id)
    VALUES ('voice-recordings', cs::text || '/' || g::text || '/readme.webm', g::text);
  PERFORM pg_temp.check_eq('bucket read: p does not see g''s object',
    pg_temp.as_user(p, format($q$ SELECT count(*)::text FROM storage.objects WHERE bucket_id = 'voice-recordings' AND name = %L $q$,
      cs::text || '/' || g::text || '/readme.webm')), '0');
  PERFORM pg_temp.check_eq('bucket read: ed (editor of CS) sees it [positive control]',
    pg_temp.as_user(ed, format($q$ SELECT count(*)::text FROM storage.objects WHERE bucket_id = 'voice-recordings' AND name = %L $q$,
      cs::text || '/' || g::text || '/readme.webm')), '1');

  -- ── 2. submit_voice_recording: callers x lesson levels -------------------
  PERFORM pg_temp.check_eq('anon cannot call the RPC',
    pg_temp.as_anon(format('SELECT public.submit_voice_recording(%L, %L, ''vt1'', ''x'')::text', gen_random_uuid(), la)), 'ERR:42501');

  -- anyone lesson
  PERFORM pg_temp.check_eq('p on LA (anyone)',               pg_temp.send(p,  cs, la, s1), 'ok:self_paced');
  PERFORM pg_temp.check_eq('g on LA (anyone, granted)',      pg_temp.send(g,  cs, la, s2), 'ok:self_paced');
  PERFORM pg_temp.check_eq('ed on LA (editor)',              pg_temp.send(ed, cs, la, s3), 'ok:self_paced');
  -- signed_in lesson
  PERFORM pg_temp.check_eq('p on LS (signed_in)',            pg_temp.send(p,  cs, ls, s4), 'ok:self_paced');
  -- entitled lesson: denial for the plain user, positive control for the grant
  PERFORM pg_temp.check_eq('p on LE (entitled, no grant): refused',   pg_temp.send(p, cs, le, s5), 'lesson_not_open');
  PERFORM pg_temp.check_eq('g on LE (entitled, granted)',             pg_temp.send(g, cs, le, s6), 'ok:self_paced');
  PERFORM pg_temp.check_eq('ed on LE (entitled, editor)',             pg_temp.send(ed, cs, le, s7), 'ok:self_paced');
  -- the lesson must hold a voice task
  PERFORM pg_temp.check_eq('p on LN (no voice task)',                 pg_temp.send(p, cn, ln, s8), 'not_a_voice_block');
  -- draft course: a plain user cannot open the lesson; a grantee can open it but there is no slot
  PERFORM pg_temp.check_eq('p on LD (draft course): refused',         pg_temp.send(p,  cd, ld, s9), 'lesson_not_open');
  PERFORM pg_temp.check_eq('gd on LD (draft course, granted): not_enrolled (no self-paced slot on a draft)',
    pg_temp.send(gd, cd, ld, gen_random_uuid()), 'not_enrolled');

  -- cohort course
  PERFORM pg_temp.check_eq('en on LCA (enrolled): the enrolment''s slot',        pg_temp.send(en, cc, lca, gen_random_uuid()), 'ok:enrolment');
  PERFORM pg_temp.check_eq('en on LCE (entitled week 1, open for en): the enrolment''s slot',
    pg_temp.send(en, cc, lce, gen_random_uuid()), 'ok:enrolment');
  PERFORM pg_temp.check_eq('p2 on LCA (not enrolled, anyone lesson): a self-paced slot',
    pg_temp.send(p2, cc, lca, gen_random_uuid()), 'ok:self_paced');
  PERFORM pg_temp.check_eq('p2 on LCE (not enrolled, entitled): refused',
    pg_temp.send(p2, cc, lce, gen_random_uuid()), 'lesson_not_open');
  PERFORM pg_temp.check_eq('en2 on LCE (granted, enrolled in a run that has not started): not_enrolled, never a self-paced slot',
    pg_temp.send(en2, cc, lce, gen_random_uuid()), 'not_enrolled');
  PERFORM pg_temp.check_eq('en2 on LCA (same user, anyone lesson, enrolment opens it) [positive control]',
    pg_temp.send(en2, cc, lca, gen_random_uuid()), 'ok:enrolment');

  -- ── 3. The slot: one current take, per user ------------------------------
  PERFORM pg_temp.check_eq('after 3 senders on LA: 3 rows with no enrolment (one each), not 1',
    (SELECT count(*)::text FROM voice_submissions WHERE lesson_id = la AND enrolment_id IS NULL), '3');
  -- p re-sends on LA: the earlier take is replaced and its object queued.
  obj1 := (SELECT object_name FROM voice_submissions WHERE user_id = p AND lesson_id = la);
  PERFORM pg_temp.check_eq('p re-sends on LA: ok, same slot', pg_temp.send(p, cs, la, gen_random_uuid()), 'ok:self_paced');
  PERFORM pg_temp.check_eq('p still has exactly one take on LA',
    (SELECT count(*)::text FROM voice_submissions WHERE user_id = p AND lesson_id = la AND block_id = 'vt1'), '1');
  PERFORM pg_temp.check_eq('the replaced take''s object was queued for deletion',
    (SELECT count(*)::text FROM voice_object_deletions WHERE object_name = obj1 AND reason = 'replaced'), '1');
  PERFORM pg_temp.check_eq('g''s take on LA was not touched by p''s replace',
    (SELECT count(*)::text FROM voice_submissions WHERE user_id = g AND lesson_id = la), '1');
  -- the same submission id twice
  s9 := (SELECT id FROM voice_submissions WHERE user_id = p AND lesson_id = la);
  PERFORM pg_temp.check_eq('the current take sent again: duplicate_submission',
    pg_temp.as_user(p, format($q$ SELECT r->>'error' FROM (SELECT public.submit_voice_recording(%L, %L, 'vt1', %L) AS r) x $q$,
      s9, la, (SELECT object_name FROM voice_submissions WHERE id = s9))), 'duplicate_submission');
  -- the index itself, below the RPC
  BEGIN
    INSERT INTO voice_submissions (id, enrolment_id, user_id, course_id, lesson_id, block_id, lesson_version_id, object_name, content_type)
      VALUES (gen_random_uuid(), NULL, p, cs, la, 'vt1', va, 'v94/dup-' || gen_random_uuid(), 'audio/webm');
    RAISE EXCEPTION 'VOICE-010 FAIL: the partial unique index let a second self-paced row in';
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.check_eq('index: second self-paced row for the same slot refused', 'unique_violation', 'unique_violation');
  END;
  INSERT INTO voice_submissions (id, enrolment_id, user_id, course_id, lesson_id, block_id, lesson_version_id, object_name, content_type)
    VALUES (gen_random_uuid(), NULL, p, cs, la, 'vt2', va, 'v94/other-block-' || gen_random_uuid(), 'audio/webm');
  PERFORM pg_temp.check_eq('index: a different block id is a different slot [positive control]',
    (SELECT count(*)::text FROM voice_submissions WHERE user_id = p AND lesson_id = la), '2');
  DELETE FROM voice_submissions WHERE user_id = p AND lesson_id = la AND block_id = 'vt2';
  BEGIN
    INSERT INTO voice_submissions (id, enrolment_id, user_id, course_id, lesson_id, block_id, lesson_version_id, object_name, content_type)
      VALUES (gen_random_uuid(), en_id, en, cc, lca, 'vt1', vca, 'v94/dup-' || gen_random_uuid(), 'audio/webm');
    RAISE EXCEPTION 'VOICE-010 FAIL: the per-enrolment unique constraint stopped holding';
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.check_eq('constraint: a second row for the same enrolment slot still refused', 'unique_violation', 'unique_violation');
  END;

  -- ── 4. Reads (RLS) ---------------------------------------------------------
  PERFORM pg_temp.check_eq('RLS: p reads only their own rows (LA + LS = 2)',
    pg_temp.as_user(p, 'SELECT count(*)::text FROM public.voice_submissions WHERE course_id = ' || quote_literal(cs)), '2');
  PERFORM pg_temp.check_eq('RLS: ed (editor of CS) reads every take of CS (p 2, g 2, ed 2 = 6)',
    pg_temp.as_user(ed, 'SELECT count(*)::text FROM public.voice_submissions WHERE course_id = ' || quote_literal(cs)), '6');
  PERFORM pg_temp.check_eq('RLS: ed2 (editor of CC, not CS) reads none of CS''s takes',
    pg_temp.as_user(ed2, 'SELECT count(*)::text FROM public.voice_submissions WHERE course_id = ' || quote_literal(cs)), '0');

  -- ── 5. save_voice_feedback -------------------------------------------------
  sub_self     := (SELECT id FROM voice_submissions WHERE user_id = p2 AND lesson_id = lca);
  sub_enrolled := (SELECT id FROM voice_submissions WHERE user_id = en AND lesson_id = lca);
  PERFORM pg_temp.check_eq('seed: the cohort course has one self-paced and one enrolled take',
    ((sub_self IS NOT NULL)::text || '/' || (sub_enrolled IS NOT NULL)::text), 'true/true');
  PERFORM pg_temp.check_eq('save_voice_feedback: ed2 on the self-paced take: self_paced_take',
    pg_temp.as_user(ed2, format($q$ SELECT public.save_voice_feedback(%L, %L::jsonb, false)->>'error' $q$, sub_self, v_body)), 'self_paced_take');
  PERFORM pg_temp.check_eq('save_voice_feedback: ed2 on the enrolled take: ok [positive control]',
    pg_temp.as_user(ed2, format($q$ SELECT COALESCE(public.save_voice_feedback(%L, %L::jsonb, false)->>'error', 'ok') $q$, sub_enrolled, v_body)), 'ok');
  PERFORM pg_temp.check_eq('save_voice_feedback: ed (not an editor of CC) on the self-paced take: forbidden, not self_paced_take',
    pg_temp.as_user(ed, format($q$ SELECT public.save_voice_feedback(%L, %L::jsonb, false)->>'error' $q$, sub_self, v_body)), 'forbidden');
  PERFORM pg_temp.check_eq('save_voice_feedback: the learner on their own self-paced take: forbidden',
    pg_temp.as_user(p2, format($q$ SELECT public.save_voice_feedback(%L, %L::jsonb, false)->>'error' $q$, sub_self, v_body)), 'forbidden');
  PERFORM pg_temp.check_eq('no voice_feedback row exists for the self-paced take',
    (SELECT count(*)::text FROM voice_feedback WHERE submission_id = sub_self), '0');

  -- ── 6. Absent from the review queue and the Studio inbox ------------------
  -- The inbox reads review_queue (waiting, draft) and review_final_comments; the
  -- learner page reads learner_recordings. CC holds one enrolled take (positive
  -- control: it IS in the queue) beside p2's self-paced take (it is NOT).
  PERFORM pg_temp.check_eq('review_queue (all statuses): the enrolled take is listed [positive control]',
    pg_temp.as_user(ed2, format($q$ SELECT count(*)::text FROM public.review_queue(%L) WHERE submission_id = %L $q$, cc, sub_enrolled)), '1');
  PERFORM pg_temp.check_eq('review_queue (all statuses): the self-paced take is absent',
    pg_temp.as_user(ed2, format($q$ SELECT count(*)::text FROM public.review_queue(%L) WHERE submission_id = %L $q$, cc, sub_self)), '0');
  PERFORM pg_temp.check_eq('review_queue (all statuses, no filter): no row names a user with a self-paced take',
    pg_temp.as_user(ed2, format($q$ SELECT count(*)::text FROM public.review_queue() WHERE user_id = %L $q$, p2)), '0');
  PERFORM pg_temp.check_eq('review_queue waiting (the inbox + nav badge): no row for p2 or p (self-paced takers); the enrolled take is a draft by now',
    pg_temp.as_user(ed2, format($q$ SELECT count(*)::text FROM public.review_queue(NULL, NULL, NULL, 'waiting') WHERE user_id IN (%L, %L) $q$, p2, p)), '0');
  PERFORM pg_temp.check_eq('review_queue draft (the inbox): the enrolled take, now a draft, is listed [positive control]',
    pg_temp.as_user(ed2, format($q$ SELECT count(*)::text FROM public.review_queue(NULL, NULL, NULL, 'draft') WHERE submission_id = %L $q$, sub_enrolled)), '1');
  PERFORM pg_temp.check_eq('review_queue as the CS editor: no row at all although CS holds 6 takes (self-paced takes never enter it)',
    pg_temp.as_user(ed, format($q$ SELECT count(*)::text FROM public.review_queue(%L) $q$, cs)), '0');
  PERFORM pg_temp.check_eq('learner_recordings(p2) as ed2: no row (the Studio learner page lists enrolment takes only)',
    pg_temp.as_user(ed2, format($q$ SELECT count(*)::text FROM public.learner_recordings(%L) $q$, p2)), '0');
  PERFORM pg_temp.check_eq('learner_recordings(en) as ed2: the enrolled take is listed [positive control]',
    pg_temp.as_user(ed2, format($q$ SELECT count(*)::text FROM public.learner_recordings(%L) WHERE submission_id = %L $q$, en, sub_enrolled)), '1');

  -- ── 7. Retention: voice_purge_due ----------------------------------------
  -- Fixed clocks: a self-paced take sent at T is due at T + 6 months and not a
  -- day (or a second) earlier. The cohort branch (run end + 6 months) is unchanged.
  sub_old_self := gen_random_uuid();
  sub_old_coh  := gen_random_uuid();
  INSERT INTO voice_submissions (id, enrolment_id, user_id, course_id, lesson_id, block_id, lesson_version_id, object_name, content_type, submitted_at)
    VALUES (sub_old_self, NULL, g, cs, ls, 'vt1', vs, 'v94/old-self-paced', 'audio/webm', '2026-01-15 12:00+00');
  INSERT INTO voice_submissions (id, enrolment_id, user_id, course_id, lesson_id, block_id, lesson_version_id, object_name, content_type, submitted_at)
    VALUES (sub_old_coh, en_old, ge, cc, lca, 'vt1', vca, 'v94/old-cohort', 'audio/webm', '2026-01-10 12:00+00');
  PERFORM pg_temp.check_eq('purge: self-paced take, a day before 6 months (2026-07-14 12:00): NOT due',
    (SELECT count(*)::text FROM voice_purge_due('2026-07-14 12:00+00') WHERE object_name = 'v94/old-self-paced'), '0');
  PERFORM pg_temp.check_eq('purge: self-paced take, one second before 6 months: NOT due',
    (SELECT count(*)::text FROM voice_purge_due('2026-07-15 11:59:59+00') WHERE object_name = 'v94/old-self-paced'), '0');
  PERFORM pg_temp.check_eq('purge: self-paced take, exactly 6 months (2026-07-15 12:00): due, reason retention [positive control]',
    (SELECT count(*)::text || '/' || min(reason) FROM voice_purge_due('2026-07-15 12:00+00') WHERE object_name = 'v94/old-self-paced'), '1/retention');
  PERFORM pg_temp.check_eq('purge: a recent self-paced take (p, sent now) is not due at that clock',
    (SELECT count(*)::text FROM voice_purge_due('2026-07-15 12:00+00') WHERE object_name IN (SELECT object_name FROM voice_submissions WHERE user_id = p)), '0');
  PERFORM pg_temp.check_eq('purge: cohort take, a day before run end + 6 months (2026-07-30 12:00): NOT due',
    (SELECT count(*)::text FROM voice_purge_due('2026-07-30 12:00+00') WHERE object_name = 'v94/old-cohort'), '0');
  PERFORM pg_temp.check_eq('purge: cohort take at run end + 6 months (2026-07-31 12:00): due [positive control, branch unchanged]',
    (SELECT count(*)::text FROM voice_purge_due('2026-07-31 12:00+00') WHERE object_name = 'v94/old-cohort'), '1');
  PERFORM pg_temp.check_eq('purge: cohort take at sent + 6 months (2026-07-11) but before run end + 6 months: NOT due (the self-paced rule does not apply to an enrolled take)',
    (SELECT count(*)::text FROM voice_purge_due('2026-07-11 12:00+00') WHERE object_name = 'v94/old-cohort'), '0');
  PERFORM pg_temp.check_eq('purge: service_role calls it and gets the self-paced take at 6 months [positive control]',
    pg_temp.as_service($q$ SELECT count(*)::text FROM public.voice_purge_due('2026-07-15 12:00+00') WHERE object_name = 'v94/old-self-paced' $q$), '1');
  PERFORM pg_temp.check_eq('purge: authenticated cannot call it',
    pg_temp.as_user(p, $q$ SELECT count(*)::text FROM public.voice_purge_due() $q$), 'ERR:42501');

  -- ── 8. Account deletion covers a take with no enrolment -------------------
  PERFORM pg_temp.check_eq('delete_my_account: p has 1 take on LA, 1 on LS and queued objects before deleting',
    (SELECT count(*)::text FROM voice_submissions WHERE user_id = p), '2');
  v_res := pg_temp.as_user(p, 'SELECT (public.delete_my_account())->>''ok''');
  PERFORM pg_temp.check_eq('delete_my_account: ok', v_res, 'true');
  PERFORM pg_temp.check_eq('delete_my_account: p''s self-paced takes are gone',
    (SELECT count(*)::text FROM voice_submissions WHERE user_id = p), '0');
  PERFORM pg_temp.check_eq('delete_my_account: g''s takes are untouched',
    (SELECT (count(*) > 0)::text FROM voice_submissions WHERE user_id = g), 'true');
  PERFORM pg_temp.check_eq('delete_my_account: p''s objects are queued for removal',
    (SELECT (count(*) >= 2)::text FROM voice_object_deletions WHERE object_name LIKE cs::text || '/' || p::text || '/%' AND reason = 'account_deleted'), 'true');

  RAISE NOTICE 'VOICE-010 PASS: 094 full protocol (% asserted cells)', (SELECT n FROM pg_temp.tally);
END;
$$;

ROLLBACK;
