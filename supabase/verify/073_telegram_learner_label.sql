-- ============================================================
-- supabase/verify/073_telegram_learner_label.sql
--
-- AUTH-019 full protocol for migration 073 (needs 075 applied too: the
-- learner_roster checked here is 075's re-emit of 073's). NOT a migration:
-- run after 073 is applied, as postgres. Seeds its own data and ROLLS BACK.
-- A failed assertion aborts with "AUTH-019 FAIL: ...". Every negative check
-- is paired with a positive control that proves the rows it would have
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
    RAISE EXCEPTION 'AUTH-019 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

DO $$
DECLARE
  ea   UUID := gen_random_uuid();  -- editor of course A only
  eb   UUID := gen_random_uuid();  -- editor of course B only
  nb   UUID := gen_random_uuid();  -- not an editor of anything
  tg   UUID := gen_random_uuid();  -- Telegram-only learner of A (no email)
  em   UUID := gen_random_uuid();  -- email learner of A
  bo   UUID := gen_random_uuid();  -- email AND a Telegram identity, learner of A
  tn   UUID := gen_random_uuid();  -- Telegram identity without a username, learner of A
  bare UUID := gen_random_uuid();  -- no email, no identity, learner of A
  tgb  UUID := gen_random_uuid();  -- Telegram-only learner who only touched B
  v_a UUID; v_b UUID; v_la UUID; v_lb UUID; v_va UUID; v_vb UUID; v_ra UUID; v_rb UUID;
  v_doc JSONB := '[{"id":"v1","kind":"task","type":"voice","prompt":"Say hi","maxSeconds":60}]'::jsonb;
  v_fn TEXT; v_who UUID; v_want TEXT; v_got TEXT; v_denied BOOLEAN;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (ea, 'authenticated', 'authenticated', 'ea-' || ea || '@verify.test'),
    (eb, 'authenticated', 'authenticated', 'eb-' || eb || '@verify.test'),
    (nb, 'authenticated', 'authenticated', 'nb-' || nb || '@verify.test'),
    (tg,   'authenticated', 'authenticated', NULL),
    (em,   'authenticated', 'authenticated', 'em-' || em || '@verify.test'),
    (bo,   'authenticated', 'authenticated', 'bo-' || bo || '@verify.test'),
    (tn,   'authenticated', 'authenticated', NULL),
    (bare, 'authenticated', 'authenticated', NULL),
    (tgb,  'authenticated', 'authenticated', NULL);
  INSERT INTO auth.identities (provider_id, user_id, provider, identity_data) VALUES
    ('v73-' || tg,  tg,  'custom:telegram', '{"preferred_username":"tg_user"}'),
    ('v73-' || bo,  bo,  'custom:telegram', '{"preferred_username":"bo_user"}'),
    ('v73-' || tn,  tn,  'custom:telegram', '{"first_name":"No username"}'),
    ('v73-' || tgb, tgb, 'custom:telegram', '{"preferred_username":"tgb_user"}');

  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v73-a', 'Course A', 'A2', 'published', 'cohort', 's', 'c') RETURNING id INTO v_a;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
  VALUES ('v73-b', 'Course B', 'A2', 'published', 'cohort', 's', 'c') RETURNING id INTO v_b;
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES (v_a, ea, ea), (v_b, eb, eb);

  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week)
  VALUES (v_a, 1, 'LA', 'la', 'entitled', 1) RETURNING id INTO v_la;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week)
  VALUES (v_b, 1, 'LB', 'lb', 'entitled', 1) RETURNING id INTO v_lb;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_la, v_doc, 'editor') RETURNING id INTO v_va;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_lb, v_doc, 'editor') RETURNING id INTO v_vb;
  UPDATE lessons SET published_version_id = v_va WHERE id = v_la;
  UPDATE lessons SET published_version_id = v_vb WHERE id = v_lb;

  INSERT INTO course_runs (course_id, title, starts_at) VALUES (v_a, 'RA', now() + interval '1 day') RETURNING id INTO v_ra;
  INSERT INTO course_runs (course_id, title, starts_at) VALUES (v_b, 'RB', now() + interval '1 day') RETURNING id INTO v_rb;
  INSERT INTO run_enrolments (run_id, user_id, tier) VALUES
    (v_ra, tg, 'basic'), (v_ra, em, 'basic'), (v_ra, bo, 'basic'), (v_ra, tn, 'basic'), (v_ra, bare, 'basic'),
    (v_rb, tgb, 'basic');

  -- 0. precondition: the seed is what the checks below assume --------------
  PERFORM pg_temp.check_eq('seed: 5 enrolments in A, 1 in B',
    (SELECT count(*) FILTER (WHERE run_id = v_ra) || '/' || count(*) FILTER (WHERE run_id = v_rb)
       FROM run_enrolments WHERE run_id IN (v_ra, v_rb)), '5/1');
  PERFORM pg_temp.check_eq('seed: tg has no email',
    (SELECT (email IS NULL)::text FROM auth.users WHERE id = tg), 'true');

  -- 1. the label, in every RPC that returns it, for each kind of learner ---
  -- (function, learner, expected learner_email) as the editor of A.
  FOR v_fn, v_who, v_want IN
    SELECT f, w, x FROM (VALUES
      ('review_queue',          tg,   '@tg_user'),
      ('review_queue',          em,   'em-' || em || '@verify.test'),
      ('review_queue',          bo,   'bo-' || bo || '@verify.test'),
      ('review_queue',          tn,   ''),
      ('review_queue',          bare, ''),
      ('review_final_comments', tg,   '@tg_user'),
      ('review_final_comments', em,   'em-' || em || '@verify.test'),
      ('review_final_comments', bo,   'bo-' || bo || '@verify.test'),
      ('review_final_comments', tn,   ''),
      ('review_final_comments', bare, ''),
      ('learner_roster',        tg,   '@tg_user'),
      ('learner_roster',        em,   'em-' || em || '@verify.test'),
      ('learner_roster',        bo,   'bo-' || bo || '@verify.test'),
      ('learner_roster',        tn,   ''),
      ('learner_roster',        bare, '')
    ) AS t(f, w, x)
  LOOP
    PERFORM pg_temp.check_eq(
      format('editor of A: %s label of %s', v_fn, left(v_who::text, 8)),
      pg_temp.as_user(ea, format($q$ SELECT string_agg(DISTINCT learner_email, ',') FROM public.%I() WHERE user_id = %L $q$, v_fn, v_who)),
      v_want);
  END LOOP;
  -- A learner with both an email and a Telegram identity shows the email,
  -- never "@bo_user" (label order: email, then @username).
  PERFORM pg_temp.check_eq('email wins over the Telegram identity',
    pg_temp.as_user(ea, format($q$ SELECT count(*)::text FROM public.learner_roster() WHERE user_id = %L AND learner_email LIKE '@%%' $q$, bo)), '0');

  -- 2. editor of A does not see the learner who only touched B -------------
  -- Positive control first: the editor of B sees that same learner, with the username.
  FOREACH v_fn IN ARRAY ARRAY['review_queue', 'review_final_comments', 'learner_roster'] LOOP
    PERFORM pg_temp.check_eq(
      format('editor of B (positive control): %s label of the B learner', v_fn),
      pg_temp.as_user(eb, format($q$ SELECT string_agg(DISTINCT learner_email, ',') FROM public.%I() WHERE user_id = %L $q$, v_fn, tgb)),
      '@tgb_user');
    PERFORM pg_temp.check_eq(
      format('editor of A: %s has no row for the B-only learner', v_fn),
      pg_temp.as_user(ea, format($q$ SELECT count(*)::text FROM public.%I() WHERE user_id = %L $q$, v_fn, tgb)), '0');
    PERFORM pg_temp.check_eq(
      format('editor of A: %s never carries "@tgb_user"', v_fn),
      pg_temp.as_user(ea, format($q$ SELECT count(*)::text FROM public.%I() WHERE learner_email = '@tgb_user' $q$, v_fn)), '0');
    PERFORM pg_temp.check_eq(
      format('editor of B: %s has no row for a learner of A', v_fn),
      pg_temp.as_user(eb, format($q$ SELECT count(*)::text FROM public.%I() WHERE user_id = %L $q$, v_fn, tg)), '0');
  END LOOP;

  -- 3. a non-editor gets zero rows (the same calls return rows for an editor)
  FOREACH v_fn IN ARRAY ARRAY['review_queue', 'review_final_comments', 'learner_roster'] LOOP
    PERFORM pg_temp.check_eq(
      format('editor of A (positive control): %s has rows', v_fn),
      pg_temp.as_user(ea, format($q$ SELECT (count(*) >= 5)::text FROM public.%I() $q$, v_fn)), 'true');
    PERFORM pg_temp.check_eq(
      format('non-editor: %s returns zero rows', v_fn),
      pg_temp.as_user(nb, format($q$ SELECT count(*)::text FROM public.%I() $q$, v_fn)), '0');
  END LOOP;

  -- 4. the helper is not a lookup: no caller role may execute it ------------
  v_denied := FALSE;
  BEGIN
    PERFORM pg_temp.as_user(ea, format($q$ SELECT public.learner_contact_label(%L) $q$, tg));
  EXCEPTION WHEN insufficient_privilege THEN v_denied := TRUE;
  END;
  PERFORM set_config('role', 'postgres', true);
  PERFORM pg_temp.check_eq('authenticated cannot call learner_contact_label', v_denied::text, 'true');
  v_denied := FALSE;
  BEGIN
    PERFORM pg_temp.as_anon(format($q$ SELECT public.learner_contact_label(%L) $q$, tg));
  EXCEPTION WHEN insufficient_privilege THEN v_denied := TRUE;
  END;
  PERFORM set_config('role', 'postgres', true);
  PERFORM pg_temp.check_eq('anon cannot call learner_contact_label', v_denied::text, 'true');
  -- Positive control: the definer can, and gets the username.
  PERFORM pg_temp.check_eq('postgres (definer owner) gets the username',
    public.learner_contact_label(tg), '@tg_user');

  -- 5. 075's roster body survived 073: lessons_completed counts completion --
  PERFORM pg_temp.check_eq('learner_roster is the 075 body (reads lesson_completion)',
    (SELECT (pg_get_functiondef(p.oid) LIKE '%lesson_completion(%')::text
       FROM pg_proc p WHERE p.proname = 'learner_roster' AND p.pronamespace = 'public'::regnamespace), 'true');

  RAISE NOTICE 'AUTH-019 PASS';
END;
$$;

ROLLBACK;
