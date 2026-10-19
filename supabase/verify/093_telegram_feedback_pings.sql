-- ============================================================
-- supabase/verify/093_telegram_feedback_pings.sql
--
-- COH-011 full protocol for migration 093 (needs 060, 061 and 090 applied).
-- NOT a migration: run after 093 is applied, as postgres. Seeds its own data
-- and ROLLS BACK. A failed assertion aborts with "COH-011 FAIL: ...". Every
-- denial is paired with a positive control proving the rows it would have
-- hidden exist.
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
    RAISE EXCEPTION 'COH-011 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

-- SQL that claims a ping and returns the answer's p_key (built here, while still
-- postgres: the role switch takes away USAGE on pg_temp).
CREATE FUNCTION pg_temp.claim_sql(p_kind TEXT, p_id UUID, p_key TEXT)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT format('SELECT (public.telegram_feedback_ping_claim(%L, %L::uuid))->>%L', p_kind, p_id, p_key)
$$;

-- SQL that saves voice feedback / a final comment as an editor.
CREATE FUNCTION pg_temp.save_voice_sql(p_sub UUID, p_text TEXT, p_publish BOOLEAN)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT format('SELECT (public.save_voice_feedback(%L::uuid, %L::jsonb, %L::boolean))->>''ok''',
    p_sub,
    jsonb_build_object('paragraphs',
      jsonb_build_array(jsonb_build_object('runs', jsonb_build_array(jsonb_build_object('text', p_text)))))::text,
    p_publish)
$$;
CREATE FUNCTION pg_temp.save_final_sql(p_en UUID, p_text TEXT, p_publish BOOLEAN)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT format('SELECT (public.save_final_comment(%L::uuid, %L::jsonb, %L::boolean))->>''ok''',
    p_en,
    jsonb_build_object('paragraphs',
      jsonb_build_array(jsonb_build_object('runs', jsonb_build_array(jsonb_build_object('text', p_text)))))::text,
    p_publish)
$$;

DO $$
DECLARE
  ed UUID := gen_random_uuid();   -- editor of the course
  a  UUID := gen_random_uuid();   -- learner who never linked the bot
  b  UUID := gen_random_uuid();   -- learner who linked it (ru)
  c  UUID := gen_random_uuid();   -- learner who linked it, then stopped
  d  UUID := gen_random_uuid();   -- linked (en); deletes their account at the end
  v_c UUID; v_l UUID; v_v UUID; v_run UUID;
  ea UUID; eb UUID; ec UUID; en_d UUID;
  sa UUID := gen_random_uuid(); sb UUID := gen_random_uuid();
  sc UUID := gen_random_uuid(); sd UUID := gen_random_uuid();
  r TEXT;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (ed, 'authenticated', 'authenticated', 'ed-' || ed || '@verify.test'),
    (a,  'authenticated', 'authenticated', 'a-'  || a  || '@verify.test'),
    (b,  'authenticated', 'authenticated', 'b-'  || b  || '@verify.test'),
    (c,  'authenticated', 'authenticated', 'c-'  || c  || '@verify.test'),
    (d,  'authenticated', 'authenticated', 'd-'  || d  || '@verify.test');

  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url)
    VALUES ('v93-c', 'Verify Course', 'A2', 'published', 'cohort', 's', 'c') RETURNING id INTO v_c;
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES (v_c, ed, ed);
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week)
    VALUES (v_c, 1, 'Verify Lesson', 'v93-l', 'entitled', 1) RETURNING id INTO v_l;
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (v_l, '[]'::jsonb, 'editor') RETURNING id INTO v_v;
  UPDATE lessons SET published_version_id = v_v WHERE id = v_l;
  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (v_c, 'R', now() - interval '2 days', now() + interval '26 days') RETURNING id INTO v_run;
  INSERT INTO run_enrolments (run_id, user_id, tier) VALUES (v_run, a, 'basic') RETURNING id INTO ea;
  INSERT INTO run_enrolments (run_id, user_id, tier) VALUES (v_run, b, 'basic') RETURNING id INTO eb;
  INSERT INTO run_enrolments (run_id, user_id, tier) VALUES (v_run, c, 'basic') RETURNING id INTO ec;
  INSERT INTO run_enrolments (run_id, user_id, tier) VALUES (v_run, d, 'basic') RETURNING id INTO en_d;
  INSERT INTO voice_submissions (id, enrolment_id, user_id, course_id, lesson_id, block_id,
                                 lesson_version_id, object_name, content_type) VALUES
    (sa, ea,   a, v_c, v_l, 'b1', v_v, 'verify/' || gen_random_uuid(), 'audio/webm'),
    (sb, eb,   b, v_c, v_l, 'b1', v_v, 'verify/' || gen_random_uuid(), 'audio/webm'),
    (sc, ec,   c, v_c, v_l, 'b1', v_v, 'verify/' || gen_random_uuid(), 'audio/webm'),
    (sd, en_d, d, v_c, v_l, 'b1', v_v, 'verify/' || gen_random_uuid(), 'audio/webm');
  INSERT INTO telegram_links (user_id, chat_id, lang) VALUES (b, 9300001, 'ru'), (d, 9300003, 'en');
  INSERT INTO telegram_links (user_id, chat_id, lang, stopped_at) VALUES (c, 9300002, 'en', now());

  -- 0. seed sanity -------------------------------------------------------------
  PERFORM pg_temp.check_eq('seed: 4 submissions, 2 active links, 1 stopped link, empty logs',
    (SELECT count(*)::text FROM voice_submissions WHERE course_id = v_c) || '/' ||
    (SELECT count(*)::text FROM telegram_links WHERE user_id IN (a, b, c, d) AND stopped_at IS NULL) || '/' ||
    (SELECT count(*)::text FROM telegram_links WHERE user_id IN (a, b, c, d) AND stopped_at IS NOT NULL) || '/' ||
    (SELECT count(*)::text FROM telegram_voice_feedback_pings) || '/' ||
    (SELECT count(*)::text FROM telegram_final_comment_pings), '4/2/1/0/0');

  -- 1. the tables and the function are closed ----------------------------------------
  PERFORM pg_temp.check_eq('authenticated and anon cannot read or write either log',
    pg_temp.as_user(b, $q$ SELECT count(*)::text FROM public.telegram_voice_feedback_pings $q$) || '|' ||
    pg_temp.as_anon($q$ SELECT count(*)::text FROM public.telegram_voice_feedback_pings $q$) || '|' ||
    pg_temp.as_user(b, $q$ SELECT count(*)::text FROM public.telegram_final_comment_pings $q$) || '|' ||
    pg_temp.as_user(ed, $q$ INSERT INTO public.telegram_voice_feedback_pings (submission_id, sent) VALUES (gen_random_uuid(), true) RETURNING 'x' $q$),
    'ERR:42501|ERR:42501|ERR:42501|ERR:42501');
  PERFORM pg_temp.check_eq('authenticated (even the editor) and anon cannot call the claim',
    pg_temp.as_user(ed, pg_temp.claim_sql('voice', sb, 'claimed')) || '|' ||
    pg_temp.as_anon(pg_temp.claim_sql('voice', sb, 'claimed')), 'ERR:42501|ERR:42501');
  PERFORM pg_temp.check_eq('...service_role may (positive control for the denials above)',
    has_function_privilege('service_role', 'public.telegram_feedback_ping_claim(text, uuid)', 'EXECUTE')::text, 'true');
  PERFORM pg_temp.check_eq('an unknown kind and an unknown id answer no_target',
    pg_temp.as_service(pg_temp.claim_sql('other', sb, 'reason')) || '|' ||
    pg_temp.as_service(pg_temp.claim_sql('voice', gen_random_uuid(), 'reason')) || '|' ||
    pg_temp.as_service(pg_temp.claim_sql('final', gen_random_uuid(), 'reason')), 'no_target|no_target|no_target');

  -- 2. a draft is not announced and not logged ---------------------------------------
  PERFORM pg_temp.check_eq('editor saves a draft for b: ok',
    pg_temp.as_user(ed, pg_temp.save_voice_sql(sb, 'draft', false)), 'true');
  PERFORM pg_temp.check_eq('seed: b has exactly one feedback row and it is unpublished',
    (SELECT count(*)::text || '/' || count(*) FILTER (WHERE published_at IS NULL)::text
     FROM voice_feedback WHERE submission_id = sb), '1/1');
  PERFORM pg_temp.check_eq('a draft: not_published, and nothing is logged',
    pg_temp.as_service(pg_temp.claim_sql('voice', sb, 'reason')) || '|' ||
    (SELECT count(*)::text FROM telegram_voice_feedback_pings), 'not_published|0');

  -- 3. a linked learner is announced once ---------------------------------------------
  PERFORM pg_temp.check_eq('editor publishes for b: ok',
    pg_temp.as_user(ed, pg_temp.save_voice_sql(sb, 'Well done', true)), 'true');
  r := pg_temp.as_service(format($q$ SELECT public.telegram_feedback_ping_claim('voice', %L::uuid)::text $q$, sb));
  PERFORM pg_temp.check_eq('published and linked: claimed, naming the learner, language, course and lesson',
    (r::jsonb->>'claimed') || '|' || (r::jsonb->>'recipient_id' = b::text)::text || '|' || (r::jsonb->>'lang') || '|' ||
    (r::jsonb->>'course_slug') || '|' || (r::jsonb->>'lesson_slug') || '|' || (r::jsonb->>'lesson_title'),
    'true|true|ru|v93-c|v93-l|Verify Lesson');
  PERFORM pg_temp.check_eq('...and logs exactly one row, sent = true',
    (SELECT count(*)::text || '/' || bool_and(sent)::text FROM telegram_voice_feedback_pings WHERE submission_id = sb), '1/true');

  -- 4. a republish or an edit sends nothing twice ---------------------------------------
  PERFORM pg_temp.check_eq('a second claim for the same feedback: already_handled',
    pg_temp.as_service(pg_temp.claim_sql('voice', sb, 'reason')), 'already_handled');
  PERFORM pg_temp.check_eq('editor publishes again with new text: ok',
    pg_temp.as_user(ed, pg_temp.save_voice_sql(sb, 'Edited', true)), 'true');
  PERFORM pg_temp.check_eq('...the claim after the edit: already_handled, still one log row',
    pg_temp.as_service(pg_temp.claim_sql('voice', sb, 'reason')) || '|' ||
    (SELECT count(*)::text FROM telegram_voice_feedback_pings WHERE submission_id = sb), 'already_handled|1');

  -- 5. an unlinked learner gets nothing, now or after linking later ---------------------
  PERFORM pg_temp.check_eq('editor publishes for a (never linked): ok',
    pg_temp.as_user(ed, pg_temp.save_voice_sql(sa, 'For a', true)), 'true');
  -- (the claim runs in its own statement: a subquery in the same expression would read
  -- the snapshot from before the claim's insert)
  r := pg_temp.as_service(pg_temp.claim_sql('voice', sa, 'reason'));
  PERFORM pg_temp.check_eq('a never linked: not_linked, logged with sent = false',
    r || '|' || (SELECT sent::text FROM telegram_voice_feedback_pings WHERE submission_id = sa), 'not_linked|false');
  INSERT INTO telegram_links (user_id, chat_id, lang) VALUES (a, 9300004, 'en');
  PERFORM pg_temp.check_eq('a links the bot afterwards: a claim for the old feedback still sends nothing',
    pg_temp.as_service(pg_temp.claim_sql('voice', sa, 'reason')), 'already_handled');

  -- 6. a stopped link gets nothing --------------------------------------------------------
  PERFORM pg_temp.check_eq('editor publishes for c (stopped link): ok',
    pg_temp.as_user(ed, pg_temp.save_voice_sql(sc, 'For c', true)), 'true');
  r := pg_temp.as_service(pg_temp.claim_sql('voice', sc, 'reason'));
  PERFORM pg_temp.check_eq('c stopped the bot: not_linked, logged with sent = false',
    r || '|' || (SELECT sent::text FROM telegram_voice_feedback_pings WHERE submission_id = sc), 'not_linked|false');

  -- 7. the final comment: same rules, and a link to the run -------------------------------
  PERFORM pg_temp.check_eq('editor saves a final comment draft for b: ok',
    pg_temp.as_user(ed, pg_temp.save_final_sql(eb, 'draft', false)), 'true');
  PERFORM pg_temp.check_eq('a draft comment: not_published, nothing logged',
    pg_temp.as_service(pg_temp.claim_sql('final', eb, 'reason')) || '|' ||
    (SELECT count(*)::text FROM telegram_final_comment_pings), 'not_published|0');
  PERFORM pg_temp.check_eq('editor publishes the final comment for b: ok',
    pg_temp.as_user(ed, pg_temp.save_final_sql(eb, 'All the best', true)), 'true');
  r := pg_temp.as_service(format($q$ SELECT public.telegram_feedback_ping_claim('final', %L::uuid)::text $q$, eb));
  PERFORM pg_temp.check_eq('published and linked: claimed with the language, course title and run',
    (r::jsonb->>'claimed') || '|' || (r::jsonb->>'recipient_id' = b::text)::text || '|' || (r::jsonb->>'lang') || '|' ||
    (r::jsonb->>'course_title') || '|' || (r::jsonb->>'run_id' = v_run::text)::text, 'true|true|ru|Verify Course|true');
  PERFORM pg_temp.check_eq('a second claim, and one after an edit: already_handled; one log row',
    pg_temp.as_service(pg_temp.claim_sql('final', eb, 'reason')) || '|' ||
    pg_temp.as_user(ed, pg_temp.save_final_sql(eb, 'Edited', true)) || '|' ||
    pg_temp.as_service(pg_temp.claim_sql('final', eb, 'reason')) || '|' ||
    (SELECT count(*)::text FROM telegram_final_comment_pings WHERE enrolment_id = eb),
    'already_handled|true|already_handled|1');
  PERFORM pg_temp.check_eq('editor publishes the final comment for c (stopped link): ok',
    pg_temp.as_user(ed, pg_temp.save_final_sql(ec, 'For c', true)), 'true');
  r := pg_temp.as_service(pg_temp.claim_sql('final', ec, 'reason'));
  PERFORM pg_temp.check_eq('the final comment of a learner with a stopped link: not_linked, sent = false',
    r || '|' || (SELECT sent::text FROM telegram_final_comment_pings WHERE enrolment_id = ec), 'not_linked|false');

  -- 8. one handled publication per feedback: the key is the feedback itself -----------------
  PERFORM pg_temp.check_eq('a duplicate log row is refused by the primary key',
    pg_temp.as_role('postgres', NULL,
      format($q$ INSERT INTO public.telegram_voice_feedback_pings (submission_id, sent) VALUES (%L, true) RETURNING 'x' $q$, sb)),
    'ERR:23505');

  -- 9. account deletion removes the logs with the feedback ----------------------------------
  PERFORM pg_temp.check_eq('d: voice feedback and a final comment published and both claimed',
    pg_temp.as_user(ed, pg_temp.save_voice_sql(sd, 'For d', true)) || '|' ||
    pg_temp.as_service(pg_temp.claim_sql('voice', sd, 'claimed')) || '|' ||
    pg_temp.as_user(ed, pg_temp.save_final_sql(en_d, 'For d', true)) || '|' ||
    pg_temp.as_service(pg_temp.claim_sql('final', en_d, 'claimed')), 'true|true|true|true');
  PERFORM pg_temp.check_eq('seed: logs before the deletion (d 1 of 4 voice, 1 of 3 final)',
    (SELECT count(*) FILTER (WHERE submission_id = sd)::text || '/' || count(*)::text FROM telegram_voice_feedback_pings) || '|' ||
    (SELECT count(*) FILTER (WHERE enrolment_id = en_d)::text || '/' || count(*)::text FROM telegram_final_comment_pings),
    '1/4|1/3');
  PERFORM pg_temp.check_eq('d deletes the account: ok',
    (pg_temp.as_user(d, $q$ SELECT public.delete_my_account()::text $q$)::jsonb)->>'ok', 'true');
  PERFORM pg_temp.check_eq('...d''s two log rows are gone; everyone else''s remain (positive control)',
    (SELECT count(*) FILTER (WHERE submission_id = sd)::text || '/' || count(*)::text FROM telegram_voice_feedback_pings) || '|' ||
    (SELECT count(*) FILTER (WHERE enrolment_id = en_d)::text || '/' || count(*)::text FROM telegram_final_comment_pings),
    '0/3|0/2');

  RAISE NOTICE 'COH-011 PASS';
END;
$$;

ROLLBACK;
