-- ============================================================
-- supabase/verify/112_notebook.sql
--
-- PROG-012 full protocol for migration 112 (needs everything through 111). NOT a migration:
-- run after 112 is applied, as postgres. Seeds its own data and ROLLS BACK. A failed assertion
-- aborts with "PROG-012 FAIL: ...". Every denial has a positive control beside it.
-- (SQL-against-parseStoredAnalysis parity is scripts/notebook-parity-local-run.ts.)
--
-- Learners: a (teacher matrix), b (another learner), m (merged phrase, own notes), f (forced
-- failure), p (purge), r (replace), h (hide), e (cohort enrolee, capped send), d (erased),
-- g (to try), n (signed in, nothing).
-- Teachers: te (edits CS, linked to a), tw (whole CX assigned), t1 (X2 only assigned),
-- tn (edits CS, not linked), tb (edits CS, linked to b only), tq (link and assignment, but
-- neither an editor nor seated).
-- ============================================================
BEGIN;

CREATE FUNCTION pg_temp.as_role(p_role TEXT, p_user UUID, p_sql TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims', json_strip_nulls(json_build_object('sub', p_user, 'role', p_role))::text, true);
  PERFORM set_config('role', p_role, true);
  EXECUTE p_sql INTO v;
  PERFORM set_config('role', 'postgres', true);
  RETURN v;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('role', 'postgres', true);
  RETURN 'ERR:' || SQLSTATE;
END;
$$;

CREATE FUNCTION pg_temp.as_user(p_user UUID, p_sql TEXT)
RETURNS TEXT LANGUAGE sql AS $$ SELECT pg_temp.as_role('authenticated', p_user, p_sql) $$;

CREATE TEMP TABLE pg_temp.tally (n INTEGER NOT NULL);
INSERT INTO pg_temp.tally VALUES (0);

CREATE FUNCTION pg_temp.check_eq(p_label TEXT, p_got TEXT, p_want TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE pg_temp.tally SET n = n + 1;
  RAISE NOTICE '% -> got % (want %)', p_label, p_got, p_want;
  IF p_got IS DISTINCT FROM p_want THEN
    RAISE EXCEPTION 'PROG-012 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

CREATE FUNCTION pg_temp.send(p_user UUID, p_lesson UUID, p_sub UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_name TEXT := (SELECT course_id FROM lessons WHERE id = p_lesson)::text || '/' || p_user::text || '/' || p_sub::text || '.webm';
BEGIN
  INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
  VALUES ('voice-recordings', v_name, p_user::text, '{"mimetype":"audio/webm","size":1234}'::jsonb);
  RETURN pg_temp.as_user(p_user, format(
    $q$ SELECT CASE WHEN r->>'ok' = 'true' THEN 'ok:' || (r->>'analysed') ELSE r->>'error' END
        FROM (SELECT public.submit_voice_recording(%L, %L, 'vt1', %L) AS r) x $q$, p_sub, p_lesson, v_name));
END;
$$;

-- A stored result whose said and fix quotes occur in the transcript below.
CREATE FUNCTION pg_temp.res(p_kind TEXT)
RETURNS JSONB LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'v', 1, 'kind', p_kind, 'summary', 'Sum ' || p_kind, 'howItSounds', 'ok',
    'goal', CASE WHEN p_kind = 'first' THEN 'A goal' END,
    'nextStep', CASE WHEN p_kind <> 'first' THEN 'A step' END,
    'expressionsUsed', '[{"expression":"be about to","quote":"was about to","exact":false,"span":{"start":2,"end":14}}]'::jsonb,
    'errors', '[{"quote":"I have went","correction":"I went","category":"grammar","explanation":"Past.","span":{"start":25,"end":36}}]'::jsonb,
    'mainError', 0)
$$;

CREATE FUNCTION pg_temp.finish(p_sub UUID, p_result JSONB, p_kind TEXT, p_base UUID DEFAULT NULL)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT pg_temp.as_role('service_role', NULL, format(
    $q$ SELECT public.voice_analysis_finish(%L, 'I was about to leave and I have went home', %L::jsonb, %L, 'v0', 'm', '{}'::jsonb, %L)::text $q$,
    p_sub, p_result, p_kind, p_base));
$$;

-- entries/summaries of one take
CREATE FUNCTION pg_temp.cnt(p_sub UUID)
RETURNS TEXT LANGUAGE sql AS $$
  SELECT (SELECT count(*) FROM notebook_entries WHERE submission_id = p_sub)::text || '/' ||
         (SELECT count(*) FROM notebook_summaries WHERE submission_id = p_sub)::text
$$;

-- What a teacher's reader returns: entries per lesson, then summaries per lesson and kind.
CREATE FUNCTION pg_temp.view(p_user UUID, p_student UUID, p_role TEXT DEFAULT 'authenticated')
RETURNS TEXT LANGUAGE sql AS $$
  SELECT pg_temp.as_role(p_role, p_user, format(
    $q$ SELECT COALESCE((SELECT string_agg(t, ',' ORDER BY t) FROM (
                 SELECT x->>'lesson_title' || ':' || count(*) t FROM jsonb_array_elements(nb->'entries') x GROUP BY x->>'lesson_title') a), '-')
            || ' | ' ||
               COALESCE((SELECT string_agg(x->>'lesson_title' || ':' || (x->>'kind'), ',' ORDER BY x->>'lesson_title')
                 FROM jsonb_array_elements(nb->'summaries') x), '-')
        FROM (SELECT public.linked_student_notebook(%L) nb) q $q$, p_student));
$$;

-- A read with its own snapshot, for a cell that writes first.
CREATE FUNCTION pg_temp.q(p_sql TEXT, VARIADIC p_args UUID[])
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  EXECUTE format(p_sql, VARIADIC p_args) INTO v;
  RETURN v;
END;
$$;

DO $$
DECLARE
  a UUID := gen_random_uuid(); b UUID := gen_random_uuid(); m UUID := gen_random_uuid();
  f UUID := gen_random_uuid(); p UUID := gen_random_uuid(); r UUID := gen_random_uuid();
  h UUID := gen_random_uuid(); e UUID := gen_random_uuid(); d UUID := gen_random_uuid();
  g UUID := gen_random_uuid(); n UUID := gen_random_uuid();
  te UUID := gen_random_uuid(); tw UUID := gen_random_uuid(); t1 UUID := gen_random_uuid();
  tn UUID := gen_random_uuid(); tb UUID := gen_random_uuid(); tq UUID := gen_random_uuid();
  cs UUID; cx UUID; cz UUID; cd UUID; cc UUID;
  l1 UUID; l2 UUID; l3 UUID; x1 UUID; x2 UUID; z1 UUID; d1 UUID; c1 UUID; c2 UUID;
  rc UUID; hw UUID; hq UUID; hc UUID;
  s1 UUID := gen_random_uuid(); s2 UUID := gen_random_uuid(); s3 UUID := gen_random_uuid();
  sx1 UUID := gen_random_uuid(); sx2 UUID := gen_random_uuid(); sb UUID := gen_random_uuid();
  m1 UUID := gen_random_uuid(); m2 UUID := gen_random_uuid(); sf UUID := gen_random_uuid();
  p1 UUID := gen_random_uuid(); p2 UUID := gen_random_uuid();
  r1 UUID := gen_random_uuid(); r2 UUID := gen_random_uuid(); r3 UUID := gen_random_uuid();
  h1 UUID := gen_random_uuid(); h2 UUID := gen_random_uuid(); sd UUID := gen_random_uuid();
  e1 UUID := gen_random_uuid(); e2 UUID := gen_random_uuid(); e3 UUID := gen_random_uuid(); e4 UUID := gen_random_uuid();
  eo UUID := gen_random_uuid(); sg UUID := gen_random_uuid();
  v_id UUID; v_own UUID; v_t TEXT; v_obj TEXT; nv UUID;
  doc JSONB  := '[{"id":"vt1","kind":"task","type":"voice","prompt":{"paragraphs":[{"runs":[{"text":"Say it"}]}]},"maxSeconds":60}]';
  docb JSONB := '[{"id":"vt1","kind":"task","type":"voice","prompt":{"paragraphs":[{"runs":[{"text":"Say it"}]}]},"maxSeconds":60,"compare":"before"}]';
BEGIN
  INSERT INTO auth.users (id, aud, role, email)
  SELECT x, 'authenticated', 'authenticated', 'v112-' || x || '@verify.test'
  FROM unnest(ARRAY[a,b,m,f,p,r,h,e,d,g,n,te,tw,t1,tn,tb,tq]) x;

  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url) VALUES
    ('v112-cs', 'CS', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO cs;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url) VALUES
    ('v112-cx', 'CX', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO cx;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url) VALUES
    ('v112-cz', 'CZ', 'A2', 'published', 'self_paced', 's', 'c') RETURNING id INTO cz;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url) VALUES
    ('v112-cd', 'CD', 'A2', 'draft', 'self_paced', 's', 'c') RETURNING id INTO cd;
  INSERT INTO courses (slug, title, level, status, format, subtitle, cover_image_url) VALUES
    ('v112-cc', 'CC', 'A2', 'published', 'cohort', 's', 'c') RETURNING id INTO cc;
  INSERT INTO course_editors (course_id, user_id, granted_by)
    VALUES (cs, te, te), (cs, tn, tn), (cs, tb, tb), (cz, tw, tw), (cz, t1, t1);
  INSERT INTO author_seats (user_id, kind, public_name, granted_by) VALUES (te, 'teacher', 'Te', te);

  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cs, 1, 'L1', 'l1', 'anyone') RETURNING id INTO l1;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cs, 2, 'L2', 'l2', 'anyone') RETURNING id INTO l2;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cs, 3, 'L3', 'l3', 'anyone') RETURNING id INTO l3;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cx, 1, 'X1', 'x1', 'anyone') RETURNING id INTO x1;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cx, 2, 'X2', 'x2', 'anyone') RETURNING id INTO x2;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cz, 1, 'Z1', 'z1', 'anyone') RETURNING id INTO z1;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cd, 1, 'D1', 'd1', 'anyone') RETURNING id INTO d1;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level) VALUES (cc, 1, 'C1', 'c1', 'anyone') RETURNING id INTO c1;
  INSERT INTO lessons (course_id, ordinal, title, slug, access_level, week) VALUES (cc, 2, 'C2', 'c2', 'entitled', 1) RETURNING id INTO c2;
  INSERT INTO lesson_versions (lesson_id, document, source)
  SELECT x, CASE WHEN x IN (l1, x1) THEN docb ELSE doc END, 'editor' FROM unnest(ARRAY[l1,l2,l3,x1,x2,z1,d1,c1,c2]) x;
  UPDATE lessons l SET published_version_id = v.id FROM lesson_versions v
   WHERE v.lesson_id = l.id AND l.id = ANY(ARRAY[l1,l2,l3,x1,x2,z1,d1,c1,c2]);

  INSERT INTO course_runs (course_id, title, starts_at, ends_at)
    VALUES (cc, 'RC', now() - interval '2 days', now() + interval '26 days') RETURNING id INTO rc;
  INSERT INTO run_enrolments (run_id, user_id, tier) VALUES (rc, e, 'basic');

  INSERT INTO teacher_student_links (teacher_id, student_id, source) VALUES
    (te, a, 'join_link'), (tw, a, 'join_link'), (t1, a, 'join_link'), (tq, a, 'join_link'), (tb, b, 'join_link');
  INSERT INTO homework_assignments (teacher_id, course_id, lesson_id) VALUES (tw, cx, NULL) RETURNING id INTO hc;
  INSERT INTO homework_targets (assignment_id, teacher_id, student_id) VALUES (hc, tw, a);
  INSERT INTO homework_assignments (teacher_id, course_id, lesson_id) VALUES (t1, cx, x2) RETURNING id INTO hw;
  INSERT INTO homework_targets (assignment_id, teacher_id, student_id) VALUES (hw, t1, a);
  INSERT INTO homework_assignments (teacher_id, course_id, lesson_id) VALUES (tq, cx, NULL) RETURNING id INTO hq;
  INSERT INTO homework_targets (assignment_id, teacher_id, student_id) VALUES (hq, tq, a);

  PERFORM pg_temp.check_eq('seed: courses/published lessons/users/links/targets',
    (SELECT count(*) FROM courses WHERE slug LIKE 'v112-%')::text || '/' ||
    (SELECT count(*) FROM lessons WHERE course_id IN (cs,cx,cz,cd,cc) AND published_version_id IS NOT NULL)::text || '/' ||
    (SELECT count(*) FROM auth.users WHERE email LIKE 'v112-%@verify.test')::text || '/' ||
    (SELECT count(*) FROM teacher_student_links WHERE student_id IN (a, b))::text || '/' ||
    (SELECT count(*) FROM homework_targets WHERE student_id = a)::text, '5/9/17/5/3');

  -- ── 0. Static facts ─────────────────────────────────────────────────────
  FOR v_t IN SELECT unnest(ARRAY['notebook_entries', 'notebook_summaries']) LOOP
    PERFORM pg_temp.check_eq(v_t || ': RLS on; authenticated SELECT [positive control] / INSERT / UPDATE / DELETE / TRUNCATE; anon SELECT',
      (SELECT relrowsecurity::text FROM pg_class WHERE oid = ('public.' || v_t)::regclass) || ' ' ||
      has_table_privilege('authenticated', 'public.' || v_t, 'SELECT')::text || '/' ||
      has_table_privilege('authenticated', 'public.' || v_t, 'INSERT')::text || '/' ||
      has_table_privilege('authenticated', 'public.' || v_t, 'UPDATE')::text || '/' ||
      has_table_privilege('authenticated', 'public.' || v_t, 'DELETE')::text || '/' ||
      has_table_privilege('authenticated', 'public.' || v_t, 'TRUNCATE')::text || '/' ||
      has_table_privilege('anon', 'public.' || v_t, 'SELECT')::text, 'true true/false/false/false/false/false');
  END LOOP;
  FOR v_t IN SELECT unnest(ARRAY['notebook_add_note(text,text,uuid)', 'notebook_edit_note(uuid,text,text)',
      'notebook_delete_entry(uuid)', 'notebook_delete_summary(uuid)', 'my_notebook()',
      'linked_student_notebook(uuid)', 'notebook_try_gate()']) LOOP
    PERFORM pg_temp.check_eq(v_t || ': authenticated yes [positive control], anon no',
      has_function_privilege('authenticated', 'public.' || v_t, 'EXECUTE')::text || '/' ||
      has_function_privilege('anon', 'public.' || v_t, 'EXECUTE')::text, 'true/false');
  END LOOP;
  FOR v_t IN SELECT unnest(ARRAY['_notebook_copy(uuid)', '_notebook_copy_missing()', 'notebook_enforce_note_cap()',
      'voice_analysis_finish(uuid,text,jsonb,text,text,text,jsonb,uuid)', 'voice_analysis_sweep(interval)']) LOOP
    PERFORM pg_temp.check_eq(v_t || ': no client role',
      has_function_privilege('authenticated', 'public.' || v_t, 'EXECUTE')::text || '/' ||
      has_function_privilege('anon', 'public.' || v_t, 'EXECUTE')::text, 'false/false');
  END LOOP;
  PERFORM pg_temp.check_eq('finish / sweep: service_role yes [positive control]',
    has_function_privilege('service_role', 'public.voice_analysis_finish(uuid,text,jsonb,text,text,text,jsonb,uuid)', 'EXECUTE')::text || '/' ||
    has_function_privilege('service_role', 'public.voice_analysis_sweep(interval)', 'EXECUTE')::text, 'true/true');
  PERFORM pg_temp.check_eq('voice_analyses: transcript readable [positive control], notebook_copied_at not',
    has_column_privilege('authenticated', 'public.voice_analyses', 'transcript', 'SELECT')::text || '/' ||
    has_column_privilege('authenticated', 'public.voice_analyses', 'notebook_copied_at', 'SELECT')::text, 'true/false');

  -- ── 1. Copy on completion ───────────────────────────────────────────────
  PERFORM pg_temp.check_eq('a sends 5 takes', pg_temp.send(a, l1, s1) || pg_temp.send(a, l2, s2) || pg_temp.send(a, l3, s3)
    || pg_temp.send(a, x1, sx1) || pg_temp.send(a, x2, sx2), 'ok:trueok:trueok:trueok:trueok:true');
  PERFORM pg_temp.check_eq('b sends', pg_temp.send(b, l1, sb), 'ok:true');
  PERFORM pg_temp.check_eq('before finish: entries/summaries of s1', pg_temp.cnt(s1), '0/0');
  PERFORM pg_temp.check_eq('finish s1 (first)', pg_temp.finish(s1, pg_temp.res('first'), 'first'), 'true');
  PERFORM pg_temp.check_eq('after finish', pg_temp.cnt(s1), '2/1');
  PERFORM pg_temp.check_eq('finish s1 again answers false', pg_temp.finish(s1, pg_temp.res('first'), 'first'), 'false');
  PERFORM pg_temp.check_eq('after the second finish', pg_temp.cnt(s1), '2/1');
  PERFORM pg_temp.check_eq('the copy itself, run again, copies nothing', _notebook_copy(s1)::text || ' ' || pg_temp.cnt(s1), 'false 2/1');
  PERFORM pg_temp.check_eq('the said row',
    (SELECT concat_ws('|', user_id = a, course_id = cs, lesson_id = l1, course_title, lesson_title, phrase, phrase_key, quote, exact, correction,
                      created_at = (SELECT submitted_at FROM voice_submissions WHERE id = s1))
     FROM notebook_entries WHERE submission_id = s1 AND kind = 'said'), 't|t|t|CS|L1|be about to|be about to|was about to|f|t');
  PERFORM pg_temp.check_eq('the fix row',
    (SELECT concat_ws('|', quote, correction, phrase IS NULL) FROM notebook_entries WHERE submission_id = s1 AND kind = 'fix'), 'I have went|I went|t');
  PERFORM pg_temp.check_eq('the summary row',
    (SELECT concat_ws('|', kind, summary, goal, next_step IS NULL, baseline_lesson_id IS NULL) FROM notebook_summaries WHERE submission_id = s1), 'first|Sum first|A goal|t|t');
  PERFORM pg_temp.check_eq('finish s2 (final, baseline s1), s3 (final, no baseline), x1, x2 (final, baseline x1), b',
    pg_temp.finish(s2, pg_temp.res('final'), 'final', s1) || pg_temp.finish(s3, pg_temp.res('final'), 'final')
    || pg_temp.finish(sx1, pg_temp.res('first'), 'first') || pg_temp.finish(sx2, pg_temp.res('final'), 'final', sx1)
    || pg_temp.finish(sb, pg_temp.res('first'), 'first'), 'truetruetruetruetrue');
  PERFORM pg_temp.check_eq('baselines stored: s2 = L1, s3 none, x2 = X1',
    (SELECT string_agg(COALESCE(l.title, 'none'), ',' ORDER BY s.lesson_title) FROM notebook_summaries s
     LEFT JOIN lessons l ON l.id = s.baseline_lesson_id WHERE s.user_id = a AND s.kind = 'final'), 'L1,none,X1');
  PERFORM pg_temp.check_eq('a final keeps its next step and no goal',
    (SELECT concat_ws('|', next_step, goal IS NULL) FROM notebook_summaries WHERE submission_id = s2), 'A step|t');
  PERFORM pg_temp.check_eq('a reads 10 entries and 5 summaries [positive control]; b 2 and 1; n none',
    pg_temp.as_user(a, $q$ SELECT jsonb_array_length(public.my_notebook()->'entries') || '/' || jsonb_array_length(public.my_notebook()->'summaries') $q$) || ' ' ||
    pg_temp.as_user(b, $q$ SELECT jsonb_array_length(public.my_notebook()->'entries') || '/' || jsonb_array_length(public.my_notebook()->'summaries') $q$) || ' ' ||
    pg_temp.as_user(n, $q$ SELECT jsonb_array_length(public.my_notebook()->'entries') || '/' || jsonb_array_length(public.my_notebook()->'summaries') $q$), '10/5 2/1 0/0');
  PERFORM pg_temp.check_eq('direct select: a sees own 10 [positive control], b cannot see a''s, te (editor, linked) cannot',
    pg_temp.as_user(a, 'SELECT count(*)::text FROM public.notebook_entries') || '/' ||
    pg_temp.as_user(b, format('SELECT count(*)::text FROM public.notebook_entries WHERE user_id = %L', a)) || '/' ||
    pg_temp.as_user(te, 'SELECT count(*)::text FROM public.notebook_entries'), '10/0/0');
  PERFORM pg_temp.check_eq('anon: select and my_notebook refused',
    pg_temp.as_role('anon', NULL, 'SELECT count(*)::text FROM public.notebook_entries') || '/' ||
    pg_temp.as_role('anon', NULL, 'SELECT public.my_notebook()::text'), 'ERR:42501/ERR:42501');

  -- ── 2. Client writes and own notes ──────────────────────────────────────
  PERFORM pg_temp.check_eq('client INSERT said / fix / own / summary, UPDATE, DELETE on own rows: all refused',
    pg_temp.as_user(a, format($q$ INSERT INTO public.notebook_entries (user_id, kind, submission_id, phrase, quote, exact) VALUES (%L, 'said', %L, 'x', 'x', true) RETURNING 'in' $q$, a, s1)) || ' ' ||
    pg_temp.as_user(a, format($q$ INSERT INTO public.notebook_entries (user_id, kind, submission_id, quote, correction) VALUES (%L, 'fix', %L, 'x', 'y') RETURNING 'in' $q$, a, s1)) || ' ' ||
    pg_temp.as_user(a, format($q$ INSERT INTO public.notebook_entries (user_id, kind, phrase) VALUES (%L, 'own', 'x') RETURNING 'in' $q$, a)) || ' ' ||
    pg_temp.as_user(a, format($q$ INSERT INTO public.notebook_summaries (submission_id, user_id, kind, summary, taken_at) VALUES (%L, %L, 'first', 'x', now()) RETURNING 'in' $q$, s1, a)) || ' ' ||
    pg_temp.as_user(a, $q$ UPDATE public.notebook_entries SET quote = 'x' RETURNING 'up' $q$) || ' ' ||
    pg_temp.as_user(a, $q$ DELETE FROM public.notebook_entries RETURNING 'del' $q$),
    'ERR:42501 ERR:42501 ERR:42501 ERR:42501 ERR:42501 ERR:42501');

  PERFORM pg_temp.check_eq('m adds a note from a readable lesson [positive control]',
    pg_temp.as_user(m, format($q$ SELECT public.notebook_add_note('  On second thought ', '  a note ', %L)->>'ok' $q$, l1)), 'true');
  SELECT id INTO v_own FROM notebook_entries WHERE user_id = m;
  PERFORM pg_temp.check_eq('stored trimmed, with the lesson and titles',
    (SELECT concat_ws('|', kind, phrase, note, course_id = cs, lesson_id = l1, course_title, lesson_title, submission_id IS NULL) FROM notebook_entries WHERE id = v_own),
    'own|On second thought|a note|t|t|CS|L1|t');
  PERFORM pg_temp.check_eq('no lesson: ok; a draft lesson and an unknown one: not_readable; nothing stored for those',
    pg_temp.as_user(m, $q$ SELECT public.notebook_add_note('p')->>'ok' $q$) || '/' ||
    pg_temp.as_user(m, format($q$ SELECT public.notebook_add_note('p', NULL, %L)->>'error' $q$, d1)) || '/' ||
    pg_temp.as_user(m, format($q$ SELECT public.notebook_add_note('p', NULL, %L)->>'error' $q$, gen_random_uuid())) || '/' ||
    pg_temp.q('SELECT count(*) FROM notebook_entries WHERE user_id = %L', m), 'true/not_readable/not_readable/2');
  PERFORM pg_temp.check_eq('limits: blank, 201, note 501 refused; 200 and 500 accepted [positive control]',
    pg_temp.as_user(m, $q$ SELECT public.notebook_add_note(E' \n\t')->>'error' $q$) || '/' ||
    pg_temp.as_user(m, $q$ SELECT public.notebook_add_note(repeat('a', 201))->>'error' $q$) || '/' ||
    pg_temp.as_user(m, $q$ SELECT public.notebook_add_note('a', repeat('b', 501))->>'error' $q$) || '/' ||
    pg_temp.as_user(m, $q$ SELECT public.notebook_add_note(repeat('a', 200), repeat('b', 500))->>'ok' $q$),
    'phrase_empty/phrase_too_long/note_too_long/true');
  PERFORM pg_temp.check_eq('no uid: unauthenticated', pg_temp.as_user(NULL, $q$ SELECT public.notebook_add_note('p')->>'error' $q$), 'unauthenticated');
  PERFORM pg_temp.check_eq('edit: owner ok [positive control], another learner not_found, a copied row of one''s own not_found',
    pg_temp.as_user(m, format($q$ SELECT public.notebook_edit_note(%L, 'Edited', '')->>'ok' $q$, v_own)) || '/' ||
    pg_temp.as_user(b, format($q$ SELECT public.notebook_edit_note(%L, 'Hacked')->>'error' $q$, v_own)) || '/' ||
    pg_temp.as_user(a, format($q$ SELECT public.notebook_edit_note(%L, 'Hacked')->>'error' $q$, (SELECT id FROM notebook_entries WHERE submission_id = s1 AND kind = 'said'))) || '/' ||
    pg_temp.q('SELECT phrase || '','' || (note IS NULL)::text FROM notebook_entries WHERE id = %L', v_own), 'true/not_found/not_found/Edited,true');
  PERFORM pg_temp.check_eq('delete: another learner not_found and the row stays; the owner deletes 1 [positive control]',
    pg_temp.as_user(b, format($q$ SELECT public.notebook_delete_entry(%L)->>'error' $q$, v_own)) || '/' ||
    pg_temp.q('SELECT count(*) FROM notebook_entries WHERE id = %L', v_own) || '/' ||
    pg_temp.as_user(m, format($q$ SELECT public.notebook_delete_entry(%L)->>'deleted' $q$, v_own)) || '/' ||
    pg_temp.q('SELECT count(*) FROM notebook_entries WHERE id = %L', v_own), 'not_found/1/1/0');
  -- PROG-016: a Cyrillic note is stored as sent, 500 Cyrillic letters is the limit (char_length
  -- counts letters, not bytes), and a repeated phrase is allowed, not merged (0236 section 4).
  PERFORM pg_temp.check_eq('a Cyrillic note round-trips; 500 Cyrillic letters ok [positive control], 501 note_too_long',
    pg_temp.as_user(m, $q$ SELECT public.notebook_add_note('be about to', 'Когда что-то вот-вот случится')->>'ok' $q$) || '/' ||
    pg_temp.q($q$ SELECT note FROM notebook_entries WHERE user_id = %L AND phrase = 'be about to' $q$, m) || '/' ||
    pg_temp.as_user(m, $q$ SELECT public.notebook_add_note('ж', repeat('ж', 500))->>'ok' $q$) || '/' ||
    pg_temp.as_user(m, $q$ SELECT public.notebook_add_note('ж', repeat('ж', 501))->>'error' $q$),
    'true/Когда что-то вот-вот случится/true/note_too_long');
  PERFORM pg_temp.check_eq('a duplicate phrase is a second row, each with its own note',
    pg_temp.as_user(m, $q$ SELECT public.notebook_add_note('Be about to', 'second')->>'ok' $q$) || '/' ||
    pg_temp.q($q$ SELECT count(*) FROM notebook_entries WHERE user_id = %L AND kind = 'own' AND phrase_key = 'be about to' $q$, m),
    'true/2');
  PERFORM pg_temp.check_eq('deleting one own row of the phrase deletes 1 and leaves the other',
    pg_temp.as_user(m, format($q$ SELECT public.notebook_delete_entry(%L)->>'deleted' $q$,
      (SELECT id FROM notebook_entries WHERE user_id = m AND note = 'second'))) || '/' ||
    pg_temp.q($q$ SELECT string_agg(note, ',') FROM notebook_entries WHERE user_id = %L AND kind = 'own' AND phrase_key = 'be about to' $q$, m),
    '1/Когда что-то вот-вот случится');
  INSERT INTO notebook_entries (user_id, kind, phrase)
  SELECT m, 'own', 'n' || i FROM generate_series(1, 999 - (SELECT count(*)::int FROM notebook_entries WHERE user_id = m)) i;
  PERFORM pg_temp.check_eq('the 1,000th note is accepted [positive control], the 1,001st is PT429, another learner is unaffected',
    (SELECT count(*) FROM notebook_entries WHERE user_id = m)::text || '/' ||
    pg_temp.as_user(m, $q$ SELECT public.notebook_add_note('last')->>'ok' $q$) || '/' ||
    pg_temp.as_user(m, $q$ SELECT public.notebook_add_note('over')->>'ok' $q$) || '/' ||
    pg_temp.as_user(n, $q$ SELECT public.notebook_add_note('mine')->>'ok' $q$), '999/true/ERR:PT429/true');

  -- A merged phrase: two takes of one course, one of another.
  PERFORM pg_temp.check_eq('m says the phrase in L1, L2 (the key folds case and apostrophes); X1 is another course',
    pg_temp.send(m, l1, m1) || pg_temp.send(m, l2, m2) || pg_temp.send(m, x1, gen_random_uuid()), 'ok:trueok:trueok:true');
  PERFORM pg_temp.finish(m1, jsonb_set(pg_temp.res('first'), '{expressionsUsed,0,expression}', '"Don''t worry "'), 'first');
  PERFORM pg_temp.finish(m2, jsonb_set(pg_temp.res('first'), '{expressionsUsed,0,expression}', to_jsonb(U&'don\2019t worry'::text)), 'first');
  PERFORM pg_temp.finish((SELECT id FROM voice_submissions WHERE user_id = m AND lesson_id = x1),
                         jsonb_set(pg_temp.res('first'), '{expressionsUsed,0,expression}', '"don''t worry"'), 'first');
  PERFORM pg_temp.check_eq('three said rows, one key',
    (SELECT count(*) || '/' || count(DISTINCT phrase_key) FROM notebook_entries WHERE user_id = m AND kind = 'said'), '3/1');
  PERFORM pg_temp.check_eq('deleting it from CS deletes both CS rows; CX''s row and the fixes stay',
    pg_temp.as_user(m, format($q$ SELECT public.notebook_delete_entry(%L)->>'deleted' $q$, (SELECT id FROM notebook_entries WHERE submission_id = m1 AND kind = 'said'))) || '/' ||
    pg_temp.q('SELECT count(*) FILTER (WHERE kind = ''said'') || ''/'' || count(*) FILTER (WHERE kind = ''fix'') FROM notebook_entries WHERE user_id = %L', m), '2/1/3');
  PERFORM pg_temp.check_eq('delete a fix: 1 row',
    pg_temp.as_user(m, format($q$ SELECT public.notebook_delete_entry(%L)->>'deleted' $q$, (SELECT id FROM notebook_entries WHERE submission_id = m1 AND kind = 'fix'))), '1');
  PERFORM pg_temp.check_eq('delete a summary: another learner not_found, the owner ok [positive control], m2''s stays',
    pg_temp.as_user(b, format($q$ SELECT public.notebook_delete_summary(%L)->>'error' $q$, m1)) || '/' ||
    pg_temp.as_user(m, format($q$ SELECT public.notebook_delete_summary(%L)->>'ok' $q$, m1)) || '/' ||
    pg_temp.cnt(m1) || '/' || pg_temp.cnt(m2), 'not_found/true/0/0/1/1');
  PERFORM voice_analysis_sweep();
  PERFORM pg_temp.check_eq('the sweep brings none of them back', pg_temp.cnt(m1) || ' ' || pg_temp.cnt(m2), '0/0 1/1');

  -- ── 3. Forced failure and recovery ──────────────────────────────────────
  PERFORM pg_temp.check_eq('f sends', pg_temp.send(f, l1, sf), 'ok:true');
  PERFORM pg_temp.check_eq('a malformed result still finishes', pg_temp.finish(sf, '"nope"', 'first'), 'true');
  PERFORM pg_temp.check_eq('done, not copied, nothing copied',
    (SELECT status || '/' || (notebook_copied_at IS NULL)::text FROM voice_analyses WHERE submission_id = sf) || '/' || pg_temp.cnt(sf), 'done/true/0/0');
  PERFORM voice_analysis_sweep();
  PERFORM pg_temp.check_eq('the sweep cannot copy it and does not fail', pg_temp.cnt(sf), '0/0');
  UPDATE voice_analyses SET result = pg_temp.res('first') WHERE submission_id = sf;
  PERFORM voice_analysis_sweep();
  PERFORM pg_temp.check_eq('the result repaired, the sweep copies it', pg_temp.cnt(sf), '2/1');
  PERFORM pg_temp.check_eq('f deletes the phrase and the summary',
    pg_temp.as_user(f, format($q$ SELECT public.notebook_delete_entry(%L)->>'ok' $q$, (SELECT id FROM notebook_entries WHERE submission_id = sf AND kind = 'said'))) || '/' ||
    pg_temp.as_user(f, format($q$ SELECT public.notebook_delete_summary(%L)->>'ok' $q$, sf)) || '/' || pg_temp.cnt(sf), 'true/true/1/0');
  PERFORM voice_analysis_sweep();
  PERFORM pg_temp.check_eq('and the sweep does not bring them back', pg_temp.cnt(sf), '1/0');

  -- ── 4a. Purge ───────────────────────────────────────────────────────────
  PERFORM pg_temp.check_eq('p sends two takes', pg_temp.send(p, l1, p1) || pg_temp.send(p, l2, p2), 'ok:trueok:true');
  PERFORM pg_temp.finish(p1, pg_temp.res('first'), 'first');
  PERFORM pg_temp.finish(p2, pg_temp.res('first'), 'first');
  SELECT object_name INTO v_obj FROM voice_submissions WHERE id = p1;
  PERFORM pg_temp.check_eq('purge, before: analyses, p1, p2',
    (SELECT count(*) FROM voice_analyses WHERE submission_id IN (p1, p2))::text || ' ' || pg_temp.cnt(p1) || ' ' || pg_temp.cnt(p2), '2 2/1 2/1');
  PERFORM pg_temp.check_eq('voice_mark_removed marks p1', pg_temp.as_role('service_role', NULL, format($q$ SELECT public.voice_mark_removed(ARRAY[%L])::text $q$, v_obj)), '1');
  PERFORM pg_temp.check_eq('purge, after: p1''s analysis gone, its notebook kept; p2 untouched',
    (SELECT count(*) FROM voice_analyses WHERE submission_id = p1)::text || (SELECT count(*) FROM voice_analyses WHERE submission_id = p2)::text
    || ' ' || pg_temp.cnt(p1) || ' ' || pg_temp.cnt(p2), '01 2/1 2/1');
  PERFORM pg_temp.check_eq('after the purge the author cannot hide it; the learner can delete it',
    pg_temp.as_user(te, format($q$ SELECT public.hide_voice_analysis(%L)->>'error' $q$, p1)) || '/' || pg_temp.cnt(p1) || '/' ||
    pg_temp.as_user(p, format($q$ SELECT public.notebook_delete_entry(%L)->>'ok' $q$, (SELECT id FROM notebook_entries WHERE submission_id = p1 AND kind = 'fix'))) || '/' || pg_temp.cnt(p1),
    'forbidden/2/1/true/1/1');

  -- ── 4b. Replace ─────────────────────────────────────────────────────────
  PERFORM pg_temp.check_eq('r sends two takes', pg_temp.send(r, l1, r1) || pg_temp.send(r, l2, r2), 'ok:trueok:true');
  PERFORM pg_temp.finish(r1, pg_temp.res('first'), 'first');
  PERFORM pg_temp.finish(r2, pg_temp.res('first'), 'first');
  PERFORM pg_temp.check_eq('replace, before: r1, r2', pg_temp.cnt(r1) || ' ' || pg_temp.cnt(r2), '2/1 2/1');
  PERFORM pg_temp.check_eq('r sends L1 again', pg_temp.send(r, l1, r3), 'ok:true');
  PERFORM pg_temp.check_eq('replace, after: r1 gone, r3 empty until analysed, r2 untouched',
    pg_temp.cnt(r1) || ' ' || pg_temp.cnt(r3) || ' ' || pg_temp.cnt(r2), '0/0 0/0 2/1');
  PERFORM pg_temp.check_eq('a late finish of the replaced take writes nothing', pg_temp.finish(r1, pg_temp.res('first'), 'first') || ' ' || pg_temp.cnt(r1), 'false 0/0');
  PERFORM pg_temp.finish(r3, pg_temp.res('first'), 'first');
  PERFORM pg_temp.check_eq('the new take is copied when it finishes', pg_temp.cnt(r3), '2/1');

  -- Capped cohort send (0185): the 4th send of a task gets no analysis.
  PERFORM pg_temp.check_eq('e sends C1 three times, and C2 once', pg_temp.send(e, c1, e1) || pg_temp.send(e, c1, e2) || pg_temp.send(e, c1, e3) || pg_temp.send(e, c2, eo),
    'ok:trueok:trueok:trueok:true');
  PERFORM pg_temp.finish(e3, pg_temp.res('first'), 'first');
  PERFORM pg_temp.finish(eo, pg_temp.res('first'), 'first');
  PERFORM pg_temp.check_eq('capped replace, before: e3, eo', pg_temp.cnt(e3) || ' ' || pg_temp.cnt(eo), '2/1 2/1');
  PERFORM pg_temp.check_eq('the 4th send is accepted without an analysis', pg_temp.send(e, c1, e4), 'ok:false');
  PERFORM pg_temp.check_eq('capped replace, after: e3 gone, e4 none, eo untouched',
    pg_temp.cnt(e3) || ' ' || pg_temp.cnt(e4) || ' ' || pg_temp.cnt(eo), '0/0 0/0 2/1');

  -- ── 4c. Hide ────────────────────────────────────────────────────────────
  PERFORM pg_temp.check_eq('h sends two takes', pg_temp.send(h, l1, h1) || pg_temp.send(h, l2, h2), 'ok:trueok:true');
  PERFORM pg_temp.finish(h1, pg_temp.res('first'), 'first');
  PERFORM pg_temp.finish(h2, pg_temp.res('first'), 'first');
  PERFORM pg_temp.check_eq('hide, before: h1, h2', pg_temp.cnt(h1) || ' ' || pg_temp.cnt(h2), '2/1 2/1');
  PERFORM pg_temp.check_eq('a non-editor cannot hide and nothing goes',
    pg_temp.as_user(tw, format($q$ SELECT public.hide_voice_analysis(%L)->>'error' $q$, h1)) || ' ' || pg_temp.cnt(h1), 'forbidden 2/1');
  PERFORM pg_temp.check_eq('the editor hides h1 [positive control]', pg_temp.as_user(te, format($q$ SELECT public.hide_voice_analysis(%L)->>'ok' $q$, h1)), 'true');
  PERFORM pg_temp.check_eq('hide, after: h1 gone, h2 untouched', pg_temp.cnt(h1) || ' ' || pg_temp.cnt(h2), '0/0 2/1');
  UPDATE voice_analyses SET notebook_copied_at = NULL WHERE submission_id = h1;
  PERFORM voice_analysis_sweep();
  PERFORM pg_temp.check_eq('a hidden analysis is never copied, even with no marker', pg_temp.cnt(h1), '0/0');

  -- ── 5. Teacher matrix on a ──────────────────────────────────────────────
  PERFORM pg_temp.check_eq('a writes an own note in L1 and one in X2',
    pg_temp.as_user(a, format($q$ SELECT public.notebook_add_note('secret one', 'n', %L)->>'ok' $q$, l1)) || '/' ||
    pg_temp.as_user(a, format($q$ SELECT public.notebook_add_note('secret two', 'n', %L)->>'ok' $q$, x2)), 'true/true');
  PERFORM pg_temp.check_eq('te edits CS: L1, L2, L3 entries; the first and the final whose baseline is readable; the final with no stored baseline (L3) is not returned',
    pg_temp.view(te, a), 'L1:2,L2:2,L3:2 | L1:first,L2:final');
  PERFORM pg_temp.check_eq('tw, whole CX assigned: X1 and X2, the final''s baseline readable [positive control for t1]',
    pg_temp.view(tw, a), 'X1:2,X2:2 | X1:first,X2:final');
  PERFORM pg_temp.check_eq('t1, X2 only: X1 refused; X2''s entries; its final refused (baseline X1 not readable)',
    pg_temp.view(t1, a), 'X2:2 | -');
  PERFORM pg_temp.check_eq('own notes reach no teacher (a has 2 [positive control])',
    (SELECT count(*) FROM notebook_entries WHERE user_id = a AND kind = 'own')::text || '/' ||
    (SELECT count(*) FROM unnest(ARRAY[te, tw, t1]) t
      WHERE pg_temp.as_user(t, format('SELECT public.linked_student_notebook(%L)::text', a)) LIKE '%secret%')::text, '2/0');
  PERFORM pg_temp.check_eq('no baseline, take or user id in the teacher''s JSON',
    (pg_temp.as_user(te, format('SELECT public.linked_student_notebook(%L)::text', a)) ~ 'baseline|submission_id|user_id')::text, 'false');
  PERFORM pg_temp.check_eq('tn edits CS but is not linked', pg_temp.view(tn, a), '- | -');
  PERFORM pg_temp.check_eq('tb is linked to b only: nothing of a; b''s L1 [positive control]', pg_temp.view(tb, a) || ' ; ' || pg_temp.view(tb, b), '- | - ; L1:2 | L1:first');
  PERFORM pg_temp.check_eq('tq: link and assignment but not a teacher', pg_temp.view(tq, a), '- | -');
  INSERT INTO author_seats (user_id, kind, public_name, expires_at, granted_by) VALUES (tq, 'teacher', 'Tq', now() + interval '1 day', te);
  UPDATE author_seats SET expires_at = now() - interval '1 second' WHERE user_id = tq;
  PERFORM pg_temp.check_eq('tq with a lapsed seat is a teacher and still reads [positive control; 0155]', pg_temp.view(tq, a), 'X1:2,X2:2 | X1:first,X2:final');
  PERFORM pg_temp.check_eq('another learner', pg_temp.view(b, a), '- | -');
  PERFORM pg_temp.check_eq('a themself through the teacher reader', pg_temp.view(a, a), '- | -');
  PERFORM pg_temp.check_eq('anon', pg_temp.view(NULL, a, 'anon'), 'ERR:42501');
  DELETE FROM homework_assignments WHERE id = hc;
  PERFORM pg_temp.check_eq('tw''s assignment deleted', pg_temp.view(tw, a), '- | -');
  UPDATE teacher_student_links SET ended_at = now(), ended_by = a WHERE teacher_id = te AND student_id = a;
  PERFORM pg_temp.check_eq('te''s link ended; t1''s still works [positive control]', pg_temp.view(te, a) || ' ; ' || pg_temp.view(t1, a), '- | - ; X2:2 | -');
  UPDATE teacher_student_links SET ended_at = NULL, ended_by = NULL WHERE teacher_id = te AND student_id = a;
  UPDATE profiles SET deleted_at = now() WHERE id = a;
  PERFORM pg_temp.check_eq('a deleted profile is not read', pg_temp.view(te, a), '- | -');
  UPDATE profiles SET deleted_at = NULL WHERE id = a;
  PERFORM pg_temp.check_eq('restored [positive control]', pg_temp.view(te, a), 'L1:2,L2:2,L3:2 | L1:first,L2:final');

  -- ── 6. To try ───────────────────────────────────────────────────────────
  PERFORM pg_temp.check_eq('g started nothing: 0 rows', pg_temp.as_user(g, 'SELECT count(*)::text FROM public.notebook_try_gate()'), '0');
  INSERT INTO lesson_opens (user_id, lesson_id) VALUES (g, l2), (g, z1);
  v_t := $q$ SELECT string_agg(c.slug || ':' || x.has_before || ',' || x.before_taken, ' ' ORDER BY c.slug) FROM public.notebook_try_gate() x JOIN public.courses c ON c.id = x.course_id $q$;
  PERFORM pg_temp.check_eq('g opened CS (a before task) and CZ (none); CX is not started, so absent',
    pg_temp.as_user(g, v_t), 'v112-cs:true,false v112-cz:false,false');
  PERFORM pg_temp.check_eq('g records the before task', pg_temp.send(g, l1, sg), 'ok:true');
  PERFORM pg_temp.check_eq('before_taken now true', pg_temp.as_user(g, v_t), 'v112-cs:true,true v112-cz:false,false');
  INSERT INTO lesson_versions (lesson_id, document, source) VALUES (l1, jsonb_set(docb, '{0,id}', '"vt9"'), 'editor') RETURNING id INTO nv;
  UPDATE lessons SET published_version_id = nv WHERE id = l1;
  PERFORM pg_temp.check_eq('a republish with another block id does not re-hide it', pg_temp.as_user(g, v_t), 'v112-cs:true,true v112-cz:false,false');
  UPDATE lessons SET archived_at = now() WHERE id = l1;
  PERFORM pg_temp.check_eq('an archived lesson''s before task is not counted', pg_temp.as_user(g, v_t), 'v112-cs:false,true v112-cz:false,false');
  UPDATE lessons SET archived_at = NULL WHERE id = l1;
  UPDATE courses SET status = 'draft' WHERE id = cz;
  PERFORM pg_temp.check_eq('fail-closed: a started course now draft, no before task, answers TRUE',
    pg_temp.as_user(g, $q$ SELECT count(*) || '/' || bool_and(has_before) FROM public.notebook_try_gate() $q$), '2/true');
  INSERT INTO course_entitlements (user_id, course_id, source) VALUES (g, cz, 'grant');
  PERFORM pg_temp.check_eq('the same course entitled to the caller answers the truth [positive control]',
    pg_temp.as_user(g, format($q$ SELECT has_before::text FROM public.notebook_try_gate() WHERE course_id = %L $q$, cz)), 'false');
  PERFORM pg_temp.check_eq('a caller cannot start a draft lesson; anon refused',
    pg_temp.as_user(n, format($q$ SELECT public.record_lesson_open(%L)->>'error' $q$, (SELECT published_version_id FROM lessons WHERE id = d1))) || '/' ||
    pg_temp.as_user(n, 'SELECT count(*)::text FROM public.notebook_try_gate()') || '/' ||
    pg_temp.as_role('anon', NULL, 'SELECT count(*)::text FROM public.notebook_try_gate()'), 'not_readable/0/ERR:42501');

  -- ── 7. A deleted draft course keeps the note and its titles ──────────────
  UPDATE courses SET status = 'published' WHERE id = cd;
  PERFORM pg_temp.check_eq('n notes a phrase in CD', pg_temp.as_user(n, format($q$ SELECT public.notebook_add_note('kept', NULL, %L)->>'ok' $q$, d1)), 'true');
  UPDATE courses SET status = 'draft' WHERE id = cd;
  INSERT INTO course_editors (course_id, user_id, granted_by) VALUES (cd, te, te);
  PERFORM pg_temp.check_eq('the note is not a blocker', pg_temp.as_user(te, format($q$ SELECT (public.course_delete_blockers(%L)->'blockers')::text $q$, cd)), '[]');
  -- In one step this fails here with 23503, only because the note was inserted in this same
  -- transaction (Postgres then rechecks every FK of the row on each SET NULL). Across
  -- transactions, as in the app, deleting the course in one step works (docs/decisions/0238).
  DELETE FROM lessons WHERE id = d1;
  PERFORM pg_temp.check_eq('delete_course', pg_temp.as_user(te, format($q$ SELECT public.delete_course(%L, 'CD')->>'ok' $q$, cd)), 'true');
  PERFORM pg_temp.check_eq('the note stays, ids NULL, titles kept',
    (SELECT concat_ws('|', course_id IS NULL, lesson_id IS NULL, course_title, lesson_title) FROM notebook_entries WHERE user_id = n AND phrase = 'kept'), 't|t|CD|D1');

  -- ── 8. Erasure ──────────────────────────────────────────────────────────
  PERFORM pg_temp.check_eq('d sends', pg_temp.send(d, l2, sd), 'ok:true');
  PERFORM pg_temp.finish(sd, pg_temp.res('first'), 'first');
  PERFORM pg_temp.as_user(d, $q$ SELECT public.notebook_add_note('mine')->>'ok' $q$);
  -- A purged take keeps its copies, so erasure must reach those too.
  SELECT object_name INTO v_obj FROM voice_submissions WHERE id = sd;
  PERFORM pg_temp.as_role('service_role', NULL, format($q$ SELECT public.voice_mark_removed(ARRAY[%L])::text $q$, v_obj));
  PERFORM pg_temp.check_eq('erasure, before: d entries/summaries, b entries/summaries',
    (SELECT count(*) FROM notebook_entries WHERE user_id = d)::text || '/' || (SELECT count(*) FROM notebook_summaries WHERE user_id = d)::text || ' ' ||
    (SELECT count(*) FROM notebook_entries WHERE user_id = b)::text || '/' || (SELECT count(*) FROM notebook_summaries WHERE user_id = b)::text, '3/1 2/1');
  PERFORM pg_temp.check_eq('delete_my_account', pg_temp.as_user(d, $q$ SELECT public.delete_my_account()->>'ok' $q$), 'true');
  PERFORM pg_temp.check_eq('erasure, after: d none (profile row still there), b untouched [positive control]',
    (SELECT count(*) FROM notebook_entries WHERE user_id = d)::text || '/' || (SELECT count(*) FROM notebook_summaries WHERE user_id = d)::text || ' ' ||
    (SELECT count(*) FROM profiles WHERE id = d AND deleted_at IS NOT NULL)::text || ' ' ||
    (SELECT count(*) FROM notebook_entries WHERE user_id = b)::text || '/' || (SELECT count(*) FROM notebook_summaries WHERE user_id = b)::text, '0/0 1 2/1');

  RAISE NOTICE 'PROG-012 PASS: 112 full protocol (% asserted cells)', (SELECT t.n FROM pg_temp.tally t);
END;
$$;

ROLLBACK;
