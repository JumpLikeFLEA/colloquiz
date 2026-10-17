-- ============================================================
-- supabase/verify/086_calendar_feed.sql
--
-- COH-016 full protocol for migration 086 (needs 085 and its prerequisites
-- applied). NOT a migration: run after 086 is applied, as postgres. Seeds its
-- own data and ROLLS BACK. A failed assertion aborts with "COH-016 FAIL: ...".
-- Every denial is paired with a positive control proving the rows it would
-- have hidden exist.
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

CREATE FUNCTION pg_temp.as_user_err(p_user UUID, p_sql TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  EXECUTE p_sql INTO v;
  PERFORM set_config('role', 'postgres', true);
  RETURN COALESCE(v, 'null');
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
    RAISE EXCEPTION 'COH-016 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

-- What an anonymous caller gets for a token, summarised as
-- "role:kind:count,..." or 'null' when the feed answers NULL.
CREATE FUNCTION pg_temp.feed(p_token TEXT)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT COALESCE(pg_temp.as_anon(format($q$
    SELECT CASE WHEN f IS NULL THEN 'null'
                ELSE COALESCE((SELECT string_agg(role || ':' || kind || ':' || n, ',' ORDER BY role, kind)
                               FROM (SELECT e->>'role' AS role, e->>'kind' AS kind, count(*) AS n
                                     FROM jsonb_array_elements(f) e GROUP BY 1, 2) s), 'empty') END
    FROM (SELECT public.calendar_feed(%L) AS f) x $q$, p_token)), 'null');
$$;

DO $$
DECLARE
  a  UUID := gen_random_uuid();  -- teacher: edits CA (run RA), owns group G
  b  UUID := gen_random_uuid();  -- extended learner of RA, member of G
  c  UUID := gen_random_uuid();  -- learner of RB (another course), no teacher
  x  UUID := gen_random_uuid();  -- nobody's
  ca UUID; cb UUID; la UUID; lb UUID; ra UUID; rb UUID; g UUID; v_ver UUID;
  tb TEXT; tb2 TEXT; tc TEXT; ta TEXT; tx TEXT;
  v_doc JSONB;
  v_before TEXT; v_after TEXT;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (a, 'authenticated', 'authenticated', 'a-' || a || '@verify.test'),
    (b, 'authenticated', 'authenticated', 'b-' || b || '@verify.test'),
    (c, 'authenticated', 'authenticated', 'c-' || c || '@verify.test'),
    (x, 'authenticated', 'authenticated', 'x-' || x || '@verify.test');

  v_doc := jsonb_build_array(
    jsonb_build_object('id', 'th1', 'kind', 'theory', 'type', 'paragraph'),
    jsonb_build_object('id', 'ex1', 'kind', 'practice', 'type', 'selection',
      'payload', jsonb_build_object('prompt', 'Pick')));
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v86-a', 'CA', 'A2', 'published', 'cohort', 's', 'c') RETURNING id INTO ca;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v86-b', 'CB', 'A2', 'published', 'cohort', 's', 'c') RETURNING id INTO cb;
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES (ca, a, a);
  INSERT INTO author_seats (user_id, kind, public_name) VALUES (a, 'teacher', 'A');
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week) VALUES (ca, 1, 'LA', 'la', 'entitled', 1) RETURNING id INTO la;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week) VALUES (cb, 1, 'LB', 'lb', 'entitled', 1) RETURNING id INTO lb;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (la, v_doc, 'editor') RETURNING id INTO v_ver;
  UPDATE lessons SET published_version_id = v_ver WHERE id = la;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (lb, v_doc, 'editor') RETURNING id INTO v_ver;
  UPDATE lessons SET published_version_id = v_ver WHERE id = lb;
  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (ca, 'RA', now() - interval '2 days', now() + interval '26 days') RETURNING id INTO ra;
  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (cb, 'RB', now() - interval '2 days', now() + interval '26 days') RETURNING id INTO rb;
  INSERT INTO run_enrolments (run_id, user_id, tier) VALUES (ra, b, 'extended'), (rb, c, 'basic');
  INSERT INTO run_calls (run_id, starts_at, meet_url, title) VALUES (ra, now() + interval '3 days', 'https://meet.example/ra', 'Call A');
  INSERT INTO calendar_events (run_id, title, starts_at) VALUES (ra, 'Event A', now() + interval '4 days'), (rb, 'Event B', now() + interval '4 days');
  INSERT INTO teacher_student_links (teacher_id, student_id, source) VALUES (a, b, 'join_link');
  INSERT INTO teacher_groups (teacher_id, name) VALUES (a, 'G') RETURNING id INTO g;
  INSERT INTO teacher_group_members (group_id, teacher_id, student_id) VALUES (g, a, b);
  INSERT INTO calendar_events (group_id, teacher_id, title, starts_at) VALUES (g, a, 'Group event', now() + interval '5 days');

  -- 0. seed sanity ------------------------------------------------------------
  PERFORM pg_temp.check_eq('seed: b has learner rows through my_calendar (positive control for every denial below)',
    pg_temp.as_user(b, $q$ SELECT count(*)::text FROM public.my_calendar('learner') $q$), '6');
  PERFORM pg_temp.check_eq('seed: a has teacher rows',
    pg_temp.as_user(a, $q$ SELECT (count(*) > 0)::text FROM public.my_calendar('teacher') $q$), 'true');
  PERFORM pg_temp.check_eq('seed: no token exists for anyone',
    (SELECT count(*)::text FROM calendar_feed_tokens WHERE user_id IN (a, b, c, x)), '0');

  -- 1. the table is closed -----------------------------------------------------
  PERFORM pg_temp.check_eq('authenticated cannot read the table',
    pg_temp.as_user_err(b, $q$ SELECT count(*)::text FROM public.calendar_feed_tokens $q$), 'ERR:42501');
  PERFORM pg_temp.check_eq('anon cannot read the table',
    pg_temp.as_anon($q$ SELECT count(*)::text FROM public.calendar_feed_tokens $q$), 'ERR:42501');
  PERFORM pg_temp.check_eq('authenticated cannot write the table',
    pg_temp.as_user_err(b, format($q$ INSERT INTO public.calendar_feed_tokens (user_id, token_hash) VALUES (%L, %L) RETURNING 'x' $q$, b, repeat('a', 64))), 'ERR:42501');

  -- 2. who may call what -------------------------------------------------------
  PERFORM pg_temp.check_eq('anon cannot create a token',
    pg_temp.as_anon($q$ SELECT public.rotate_calendar_feed_token() $q$), 'ERR:42501');
  PERFORM pg_temp.check_eq('anon cannot revoke or read the status',
    pg_temp.as_anon($q$ SELECT public.revoke_calendar_feed_token()::text $q$) || '|' ||
    pg_temp.as_anon($q$ SELECT count(*)::text FROM public.calendar_feed_status() $q$), 'ERR:42501|ERR:42501');
  PERFORM pg_temp.check_eq('anon CAN call the feed (the token is the credential); an unknown token answers null',
    pg_temp.feed(repeat('0', 64)), 'null');
  PERFORM pg_temp.check_eq('...authenticated may call it too (positive control for the grant below)',
    (SELECT has_function_privilege('anon', 'public.calendar_feed(text)', 'EXECUTE')::text || '/' ||
            has_function_privilege('authenticated', 'public.calendar_feed(text)', 'EXECUTE')::text), 'true/true');

  -- 3. creating a token --------------------------------------------------------
  PERFORM pg_temp.check_eq('b has no status before',
    pg_temp.as_user(b, $q$ SELECT count(*)::text FROM public.calendar_feed_status() $q$), '0');
  tb := pg_temp.as_user(b, $q$ SELECT public.rotate_calendar_feed_token() $q$);
  PERFORM pg_temp.check_eq('the token is 64 lower-case hex characters',
    (tb ~ '^[0-9a-f]{64}$')::text, 'true');
  PERFORM pg_temp.check_eq('b has a status row after, with a date',
    pg_temp.as_user(b, $q$ SELECT has_token::text || '/' || (created_at IS NOT NULL)::text FROM public.calendar_feed_status() $q$), 'true/true');
  PERFORM pg_temp.check_eq('only the hash is stored: one row, equal to sha256(token), not equal to the token',
    (SELECT count(*)::text || '/' || bool_and(token_hash = encode(sha256(convert_to(tb, 'UTF8')), 'hex'))::text || '/' || bool_and(token_hash <> tb)::text
     FROM calendar_feed_tokens WHERE user_id = b), '1/true/true');
  PERFORM pg_temp.check_eq('another user does not see b''s status (positive control: b does)',
    pg_temp.as_user(a, $q$ SELECT count(*)::text FROM public.calendar_feed_status() $q$) || '|' ||
    pg_temp.as_user(b, $q$ SELECT count(*)::text FROM public.calendar_feed_status() $q$), '0|1');

  -- 4. what a token returns ----------------------------------------------------
  PERFORM pg_temp.check_eq('b''s token returns b''s learner rows, with the call (extended) and the group event; no teacher rows',
    pg_temp.feed(tb), 'learner:call:1,learner:event:2,learner:run_end:1,learner:run_start:1,learner:week_open:1');
  tc := pg_temp.as_user(c, $q$ SELECT public.rotate_calendar_feed_token() $q$);
  ta := pg_temp.as_user(a, $q$ SELECT public.rotate_calendar_feed_token() $q$);
  tx := pg_temp.as_user(x, $q$ SELECT public.rotate_calendar_feed_token() $q$);
  PERFORM pg_temp.check_eq('c''s token returns c''s rows only: RB''s dates and event, no call (basic), nothing of RA',
    pg_temp.feed(tc), 'learner:event:1,learner:run_end:1,learner:run_start:1,learner:week_open:1');
  PERFORM pg_temp.check_eq('...no title of another user''s course in either feed (positive control: each feed holds its own titles)',
    pg_temp.as_anon(format($q$ SELECT (SELECT count(*) FROM jsonb_array_elements(public.calendar_feed(%L)) e WHERE e->>'course_title' = 'CA')::text || '/' ||
                                    (SELECT count(*) FROM jsonb_array_elements(public.calendar_feed(%L)) e WHERE e->>'course_title' = 'CB')::text $q$, tb, tc))
    || '|' ||
    pg_temp.as_anon(format($q$ SELECT (SELECT count(*) FROM jsonb_array_elements(public.calendar_feed(%L)) e WHERE e->>'course_title' = 'CB')::text $q$, tb)),
    '5/4|0');
  PERFORM pg_temp.check_eq('a''s token returns a''s teacher rows (run, call, both run events... and the group event), and no learner rows',
    pg_temp.feed(ta), 'teacher:call:1,teacher:event:2,teacher:run_end:1,teacher:run_start:1,teacher:week_open:1');
  PERFORM pg_temp.check_eq('a user with a token and no dates gets an empty calendar, not null (x)',
    pg_temp.feed(tx), 'empty');
  PERFORM pg_temp.check_eq('a feed row carries no address, no group id for a learner, and the role tag',
    pg_temp.as_anon(format($q$ SELECT count(*) FILTER (WHERE e->>'group_id' IS NOT NULL)::text || '/' || count(*) FILTER (WHERE e ? 'role')::text
                               FROM jsonb_array_elements(public.calendar_feed(%L)) e $q$, tb)), '0/6');
  PERFORM pg_temp.check_eq('malformed tokens answer null: short, upper-case, with spaces, with a quote',
    pg_temp.feed(substr(tb, 1, 63)) || '|' || pg_temp.feed(upper(tb)) || '|' || pg_temp.feed(tb || ' ') || '|' || pg_temp.feed(tb || ''''),
    'null|null|null|null');

  -- 5. the claims are put back ---------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_before := current_setting('request.jwt.claims', true);
  PERFORM set_config('role', 'anon', true);
  PERFORM public.calendar_feed(tb);
  PERFORM set_config('role', 'postgres', true);
  v_after := current_setting('request.jwt.claims', true);
  PERFORM pg_temp.check_eq('after the feed answers, the caller''s own claims are back (no impersonation leaks out)',
    v_after, v_before);
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM pg_temp.check_eq('...and a caller with a different identity does not inherit the token owner''s',
    pg_temp.as_user(x, format($q$ SELECT count(*)::text FROM public.my_calendar('learner') WHERE (SELECT auth.uid()) = %L AND course_title = 'CA' $q$, x)), '0');

  -- 6. replacing a token -----------------------------------------------------------
  tb2 := pg_temp.as_user(b, $q$ SELECT public.rotate_calendar_feed_token() $q$);
  PERFORM pg_temp.check_eq('a new token is different, and there is still one row',
    (tb2 <> tb)::text || '/' || (SELECT count(*)::text FROM calendar_feed_tokens WHERE user_id = b), 'true/1');
  PERFORM pg_temp.check_eq('the old token now answers null; the new one returns the rows (positive control)',
    pg_temp.feed(tb) || '|' || (pg_temp.feed(tb2) <> 'null')::text, 'null|true');
  PERFORM pg_temp.check_eq('replacing b''s token did not touch c''s',
    (pg_temp.feed(tc) <> 'null')::text, 'true');

  -- 7. turning it off ----------------------------------------------------------------
  PERFORM pg_temp.check_eq('revoke returns true the first time, false the second',
    pg_temp.as_user(b, $q$ SELECT public.revoke_calendar_feed_token()::text $q$) || '/' ||
    pg_temp.as_user(b, $q$ SELECT public.revoke_calendar_feed_token()::text $q$), 'true/false');
  PERFORM pg_temp.check_eq('the revoked token answers null and the status is empty; c''s feed still works (positive control)',
    pg_temp.feed(tb2) || '|' || pg_temp.as_user(b, $q$ SELECT count(*)::text FROM public.calendar_feed_status() $q$) || '|' || (pg_temp.feed(tc) <> 'null')::text,
    'null|0|true');
  PERFORM pg_temp.check_eq('a user can only revoke their own: x revoking leaves c''s token',
    pg_temp.as_user(x, $q$ SELECT public.revoke_calendar_feed_token()::text $q$) || '|' ||
    (SELECT count(*)::text FROM calendar_feed_tokens WHERE user_id = c), 'true|1');

  -- 8. account deletion removes the token --------------------------------------------
  PERFORM pg_temp.check_eq('seed: c has a token',
    (SELECT count(*)::text FROM calendar_feed_tokens WHERE user_id = c), '1');
  PERFORM pg_temp.check_eq('c deletes the account: ok',
    pg_temp.as_user(c, $q$ SELECT public.delete_my_account()::text $q$)::jsonb->>'ok', 'true');
  PERFORM pg_temp.check_eq('...c''s token row is gone and the address answers null; a''s still works (positive control)',
    (SELECT count(*)::text FROM calendar_feed_tokens WHERE user_id = c) || '|' || pg_temp.feed(tc) || '|' || (pg_temp.feed(ta) <> 'null')::text,
    '0|null|true');

  RAISE NOTICE 'COH-016 PASS';
END;
$$;

ROLLBACK;
