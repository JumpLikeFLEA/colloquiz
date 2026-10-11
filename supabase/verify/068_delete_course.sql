-- ============================================================
-- supabase/verify/068_delete_course.sql
--
-- AUTH-018 full protocol for migration 068 (docs/decisions/0125 D8,
-- docs/decisions/0129). NOT a migration: run it after 068 is applied, in
-- the SQL Editor or psql, as the postgres role. It seeds its own users and
-- courses, asserts, and ROLLS BACK, so it leaves nothing behind. Any failed
-- assertion aborts with "AUTH-018 FAIL: ..."; success prints "AUTH-018
-- PASS" notices, the row counts before and after each call, and ends with
-- ROLLBACK.
--
-- Every test course has the same shape: a cohort course with one lesson
-- (week 1, entitled), one version (published_version_id set), one upcoming
-- run with one call, and the editor E's course_editors row. That is all of
-- the "own structure" 068's header says does not block, so each case also
-- proves the structure alone is deletable.
--
-- Cases:
--   anon                         -> no EXECUTE on either function
--   N (signed in, not an editor) -> forbidden from both; course survives
--   one row per blocker          -> blockers = exactly [that reason];
--                                   delete_course refuses with it; course
--                                   survives; every row count unchanged.
--                                   Each case first asserts blockers = []
--                                   before seeding its row (the control).
--     published, entitlements, enrolments, invites, recordings,
--     final_comments, attempts, opens, signups, pending_claims
--   an EXPIRED pending claim     -> not a blocker
--   wrong confirm title          -> title_mismatch; course survives
--   clean draft (title padded)   -> ok; its course, lesson, version, run,
--                                   call and editor rows are gone; every
--                                   learner-table count unchanged
--
-- The recordings and final_comments rows hang off an enrolment in a
-- SEPARATE course (X), so the test course itself gets exactly one blocker
-- row; a FK only needs the enrolment to exist.
-- ============================================================

BEGIN;

CREATE FUNCTION pg_temp.counts() RETURNS JSONB LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'courses', (SELECT count(*) FROM courses),
    'lessons', (SELECT count(*) FROM lessons),
    'lesson_versions', (SELECT count(*) FROM lesson_versions),
    'course_editors', (SELECT count(*) FROM course_editors),
    'course_runs', (SELECT count(*) FROM course_runs),
    'run_calls', (SELECT count(*) FROM run_calls),
    'course_entitlements', (SELECT count(*) FROM course_entitlements),
    'run_enrolments', (SELECT count(*) FROM run_enrolments),
    'run_invites', (SELECT count(*) FROM run_invites),
    'voice_submissions', (SELECT count(*) FROM voice_submissions),
    'run_final_comments', (SELECT count(*) FROM run_final_comments),
    'lesson_attempts', (SELECT count(*) FROM lesson_attempts),
    'lesson_opens', (SELECT count(*) FROM lesson_opens),
    'signup_acquisitions', (SELECT count(*) FROM signup_acquisitions),
    'pending_claims', (SELECT count(*) FROM pending_claims));
$$;

-- A cohort course with the full own structure, E as its editor.
CREATE FUNCTION pg_temp.mk_course(p_tag TEXT, p_editor UUID,
  OUT course_id UUID, OUT lesson_id UUID, OUT version_id UUID, OUT run_id UUID)
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO courses (slug, title, level, status, format)
  VALUES ('verify-' || p_tag, 'Verify ' || p_tag, 'A2', 'draft', 'cohort')
  RETURNING id INTO course_id;
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES (course_id, p_editor, p_editor);
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, in_free_sample, week)
  VALUES (course_id, 1, 'L1', 'l1', 'entitled', false, 1)
  RETURNING id INTO lesson_id;
  INSERT INTO lesson_versions (lesson_id, document, source)
  VALUES (lesson_id, '[]'::jsonb, 'editor')
  RETURNING id INTO version_id;
  UPDATE lessons SET published_version_id = version_id WHERE id = lesson_id;
  INSERT INTO course_runs (course_id, starts_at) VALUES (course_id, now() + interval '30 days')
  RETURNING id INTO run_id;
  INSERT INTO run_calls (run_id, starts_at, meet_url) VALUES (run_id, now() + interval '31 days', 'https://meet.example/x');
END;
$$;

-- Call one of 068's functions as p_user (an authenticated JWT).
CREATE FUNCTION pg_temp.as_user(p_user UUID, p_fn TEXT, p_course UUID, p_title TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v JSONB;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  IF p_fn = 'blockers' THEN
    v := public.course_delete_blockers(p_course);
  ELSE
    v := public.delete_course(p_course, p_title);
  END IF;
  PERFORM set_config('role', 'postgres', true);
  RETURN v;
END;
$$;

CREATE FUNCTION pg_temp.hex64() RETURNS TEXT LANGUAGE sql AS $$
  SELECT encode(sha256(gen_random_uuid()::text::bytea), 'hex');
$$;

DO $$
DECLARE
  v_e   UUID := gen_random_uuid();   -- editor of every test course
  v_n   UUID := gen_random_uuid();   -- signed in, edits nothing
  v_l   UUID := gen_random_uuid();   -- learner
  v_tag TEXT := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_x   RECORD;                      -- course X: holds the foreign enrolment
  v_x_enrol UUID;
  v_c   RECORD;
  v_res JSONB;
  v_before JSONB;
  v_after  JSONB;
  v_reason TEXT;
BEGIN
  INSERT INTO auth.users (id, aud, role, email)
  VALUES (v_e, 'authenticated', 'authenticated', 'e-' || v_tag || '@verify.test'),
         (v_n, 'authenticated', 'authenticated', 'n-' || v_tag || '@verify.test'),
         (v_l, 'authenticated', 'authenticated', 'l-' || v_tag || '@verify.test');

  SELECT * INTO v_x FROM pg_temp.mk_course(v_tag || '-x', v_e);
  INSERT INTO run_enrolments (run_id, user_id, tier) VALUES (v_x.run_id, v_l, 'basic')
  RETURNING id INTO v_x_enrol;

  -- anon: no EXECUTE.
  IF has_function_privilege('anon', 'course_delete_blockers(uuid)', 'execute')
     OR has_function_privilege('anon', 'delete_course(uuid,text)', 'execute') THEN
    RAISE EXCEPTION 'AUTH-018 FAIL: anon has EXECUTE';
  END IF;
  IF NOT has_function_privilege('authenticated', 'course_delete_blockers(uuid)', 'execute')
     OR NOT has_function_privilege('authenticated', 'delete_course(uuid,text)', 'execute') THEN
    RAISE EXCEPTION 'AUTH-018 FAIL: authenticated lacks EXECUTE';
  END IF;
  RAISE NOTICE 'AUTH-018 PASS anon EXECUTE: f/f, authenticated EXECUTE: t/t';

  -- N: forbidden from both, course survives.
  SELECT * INTO v_c FROM pg_temp.mk_course(v_tag || '-n', v_e);
  v_before := pg_temp.counts();
  v_res := pg_temp.as_user(v_n, 'blockers', v_c.course_id);
  IF v_res <> '{"ok": false, "error": "forbidden"}'::jsonb THEN
    RAISE EXCEPTION 'AUTH-018 FAIL: N blockers got %', v_res;
  END IF;
  v_res := pg_temp.as_user(v_n, 'delete', v_c.course_id, 'Verify ' || v_tag || '-n');
  v_after := pg_temp.counts();
  IF v_res <> '{"ok": false, "error": "forbidden"}'::jsonb OR v_after <> v_before
     OR NOT EXISTS (SELECT 1 FROM courses WHERE id = v_c.course_id) THEN
    RAISE EXCEPTION 'AUTH-018 FAIL: N delete got %, counts % -> %', v_res, v_before, v_after;
  END IF;
  RAISE NOTICE 'AUTH-018 PASS non-editor: % ; counts before %', v_res, v_before;
  RAISE NOTICE 'AUTH-018        counts after  %', v_after;

  -- One row per blocker.
  FOREACH v_reason IN ARRAY ARRAY['published', 'entitlements', 'enrolments', 'invites', 'recordings',
                                  'final_comments', 'attempts', 'opens', 'signups', 'pending_claims']
  LOOP
    SELECT * INTO v_c FROM pg_temp.mk_course(v_tag || '-' || replace(v_reason, '_', '-'), v_e);

    -- Control: the bare structure has no blocker.
    v_res := pg_temp.as_user(v_e, 'blockers', v_c.course_id);
    IF v_res <> '{"ok": true, "blockers": []}'::jsonb THEN
      RAISE EXCEPTION 'AUTH-018 FAIL: % control got %', v_reason, v_res;
    END IF;

    CASE v_reason
      WHEN 'published' THEN
        UPDATE courses SET status = 'published', subtitle = 's', cover_image_url = 'https://x.test/c.png'
        WHERE id = v_c.course_id;
      WHEN 'entitlements' THEN
        INSERT INTO course_entitlements (user_id, course_id, source) VALUES (v_l, v_c.course_id, 'grant');
      WHEN 'enrolments' THEN
        INSERT INTO run_enrolments (run_id, user_id, tier) VALUES (v_c.run_id, v_l, 'basic');
      WHEN 'invites' THEN
        INSERT INTO run_invites (run_id, tier, token_hash, invitee_name, invitee_contact, expires_at)
        VALUES (v_c.run_id, 'basic', pg_temp.hex64(), 'Verify', '@verify_user', now() + interval '7 days');
      WHEN 'recordings' THEN
        INSERT INTO voice_submissions (id, enrolment_id, user_id, course_id, lesson_id, block_id,
                                       lesson_version_id, object_name, content_type)
        VALUES (gen_random_uuid(), v_x_enrol, v_l, v_c.course_id, v_c.lesson_id, 'b1',
                v_c.version_id, 'verify/' || gen_random_uuid(), 'audio/webm');
      WHEN 'final_comments' THEN
        INSERT INTO run_final_comments (enrolment_id, user_id, course_id, run_id, body)
        VALUES (v_x_enrol, v_l, v_c.course_id, v_c.run_id, '[]'::jsonb);
      WHEN 'attempts' THEN
        INSERT INTO lesson_attempts (id, user_id, lesson_version_id, block_id, earned, possible)
        VALUES (gen_random_uuid(), v_l, v_c.version_id, 'b1', 1, 1);
      WHEN 'opens' THEN
        INSERT INTO lesson_opens (user_id, lesson_id) VALUES (v_l, v_c.lesson_id);
      WHEN 'signups' THEN
        INSERT INTO signup_acquisitions (user_id, course_id, source) VALUES (v_l, v_c.course_id, 'direct');
      WHEN 'pending_claims' THEN
        -- Negative control first: an expired claim does not block.
        INSERT INTO pending_claims (token_hash, payload, expires_at)
        VALUES (pg_temp.hex64(), jsonb_build_array(jsonb_build_object('lesson_version_id', v_c.version_id)),
                now() - interval '1 minute');
        v_res := pg_temp.as_user(v_e, 'blockers', v_c.course_id);
        IF v_res <> '{"ok": true, "blockers": []}'::jsonb THEN
          RAISE EXCEPTION 'AUTH-018 FAIL: expired pending claim blocked: %', v_res;
        END IF;
        RAISE NOTICE 'AUTH-018 PASS expired pending claim: %', v_res;
        INSERT INTO pending_claims (token_hash, payload, expires_at)
        VALUES (pg_temp.hex64(), jsonb_build_array(jsonb_build_object('lesson_version_id', v_c.version_id)),
                now() + interval '1 hour');
    END CASE;

    v_res := pg_temp.as_user(v_e, 'blockers', v_c.course_id);
    IF v_res <> jsonb_build_object('ok', true, 'blockers', jsonb_build_array(v_reason)) THEN
      RAISE EXCEPTION 'AUTH-018 FAIL: % blockers got %', v_reason, v_res;
    END IF;

    v_before := pg_temp.counts();
    v_res := pg_temp.as_user(v_e, 'delete', v_c.course_id, 'Verify ' || v_tag || '-' || replace(v_reason, '_', '-'));
    v_after := pg_temp.counts();
    IF v_res <> jsonb_build_object('ok', false, 'error', 'not_deletable', 'blockers', jsonb_build_array(v_reason))
       OR v_after <> v_before
       OR NOT EXISTS (SELECT 1 FROM courses WHERE id = v_c.course_id) THEN
      RAISE EXCEPTION 'AUTH-018 FAIL: % delete got %, counts % -> %', v_reason, v_res, v_before, v_after;
    END IF;
    RAISE NOTICE 'AUTH-018 PASS blocker %: %, course survives, counts unchanged', v_reason, v_res;
  END LOOP;
  RAISE NOTICE 'AUTH-018        counts after the blocker cases %', pg_temp.counts();

  -- Wrong confirm title.
  SELECT * INTO v_c FROM pg_temp.mk_course(v_tag || '-clean', v_e);
  v_before := pg_temp.counts();
  v_res := pg_temp.as_user(v_e, 'delete', v_c.course_id, 'verify ' || v_tag || '-clean');
  v_after := pg_temp.counts();
  IF v_res <> '{"ok": false, "error": "title_mismatch"}'::jsonb OR v_after <> v_before THEN
    RAISE EXCEPTION 'AUTH-018 FAIL: wrong title got %, counts % -> %', v_res, v_before, v_after;
  END IF;
  RAISE NOTICE 'AUTH-018 PASS wrong title (case differs): %', v_res;

  -- Clean draft deletes.
  v_before := pg_temp.counts();
  v_res := pg_temp.as_user(v_e, 'delete', v_c.course_id, '  Verify ' || v_tag || '-clean ');
  v_after := pg_temp.counts();
  IF v_res <> '{"ok": true}'::jsonb THEN
    RAISE EXCEPTION 'AUTH-018 FAIL: clean delete got %', v_res;
  END IF;
  IF EXISTS (SELECT 1 FROM courses WHERE id = v_c.course_id)
     OR EXISTS (SELECT 1 FROM lessons WHERE id = v_c.lesson_id)
     OR EXISTS (SELECT 1 FROM lesson_versions WHERE id = v_c.version_id)
     OR EXISTS (SELECT 1 FROM course_runs WHERE id = v_c.run_id)
     OR EXISTS (SELECT 1 FROM run_calls WHERE run_id = v_c.run_id)
     OR EXISTS (SELECT 1 FROM course_editors WHERE course_id = v_c.course_id) THEN
    RAISE EXCEPTION 'AUTH-018 FAIL: clean delete left structure behind';
  END IF;
  IF (v_before->>'courses')::int - (v_after->>'courses')::int <> 1
     OR (v_before->>'lessons')::int - (v_after->>'lessons')::int <> 1
     OR (v_before->>'lesson_versions')::int - (v_after->>'lesson_versions')::int <> 1
     OR (v_before->>'course_editors')::int - (v_after->>'course_editors')::int <> 1
     OR (v_before->>'course_runs')::int - (v_after->>'course_runs')::int <> 1
     OR (v_before->>'run_calls')::int - (v_after->>'run_calls')::int <> 1
     OR (v_before - ARRAY['courses','lessons','lesson_versions','course_editors','course_runs','run_calls'])
        <> (v_after - ARRAY['courses','lessons','lesson_versions','course_editors','course_runs','run_calls']) THEN
    RAISE EXCEPTION 'AUTH-018 FAIL: clean delete counts % -> %', v_before, v_after;
  END IF;
  RAISE NOTICE 'AUTH-018 PASS clean draft: %', v_res;
  RAISE NOTICE 'AUTH-018        counts before %', v_before;
  RAISE NOTICE 'AUTH-018        counts after  %', v_after;

  RAISE NOTICE 'AUTH-018 PASS all cases; rolling back';
END;
$$;

ROLLBACK;
