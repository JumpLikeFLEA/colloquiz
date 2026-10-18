-- ============================================================
-- supabase/verify/090_telegram_reminders.sql
--
-- COH-010 full protocol for migration 090 (needs 086, whose delete_my_account it
-- re-emits, and its prerequisites applied). NOT a migration: run after 090 is
-- applied, as postgres. Seeds its own data and ROLLS BACK. A failed assertion
-- aborts with "COH-010 FAIL: ...". Every denial is paired with a positive control
-- proving the rows it would have hidden exist.
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
    RAISE EXCEPTION 'COH-010 FAIL: % (got %, want %)', p_label, p_got, p_want;
  END IF;
END;
$$;

DO $$
DECLARE
  a UUID := gen_random_uuid();  -- links chat 1001
  b UUID := gen_random_uuid();  -- links chat 1002, then loses nothing to a
  x UUID := gen_random_uuid();  -- links chat 1001 after a: takes the chat over
  ta TEXT; ta2 TEXT; tb TEXT; tx TEXT; te TEXT;
  r TEXT;
BEGIN
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (a, 'authenticated', 'authenticated', 'a-' || a || '@verify.test'),
    (b, 'authenticated', 'authenticated', 'b-' || b || '@verify.test'),
    (x, 'authenticated', 'authenticated', 'x-' || x || '@verify.test');

  -- 0. seed sanity --------------------------------------------------------------
  PERFORM pg_temp.check_eq('seed: no link or token exists for the three users',
    (SELECT (SELECT count(*) FROM telegram_links WHERE user_id IN (a, b, x))::text || '/' ||
            (SELECT count(*) FROM telegram_link_tokens WHERE user_id IN (a, b, x))::text), '0/0');

  -- 1. the tables are closed -----------------------------------------------------
  PERFORM pg_temp.check_eq('authenticated cannot read either table',
    pg_temp.as_user(a, $q$ SELECT count(*)::text FROM public.telegram_links $q$) || '|' ||
    pg_temp.as_user(a, $q$ SELECT count(*)::text FROM public.telegram_link_tokens $q$), 'ERR:42501|ERR:42501');
  PERFORM pg_temp.check_eq('anon cannot read either table',
    pg_temp.as_anon($q$ SELECT count(*)::text FROM public.telegram_links $q$) || '|' ||
    pg_temp.as_anon($q$ SELECT count(*)::text FROM public.telegram_link_tokens $q$), 'ERR:42501|ERR:42501');
  PERFORM pg_temp.check_eq('authenticated cannot write either table',
    pg_temp.as_user(a, format($q$ INSERT INTO public.telegram_links (user_id, chat_id, lang) VALUES (%L, 5, 'en') RETURNING 'x' $q$, a)) || '|' ||
    pg_temp.as_user(a, format($q$ INSERT INTO public.telegram_link_tokens (token_hash, user_id, lang, expires_at) VALUES (%L, %L, 'en', now()) RETURNING 'x' $q$, repeat('a', 64), a)),
    'ERR:42501|ERR:42501');

  -- 2. who may call what ---------------------------------------------------------
  PERFORM pg_temp.check_eq('anon cannot call the user functions',
    pg_temp.as_anon($q$ SELECT public.create_telegram_link_token('en', NULL) $q$) || '|' ||
    pg_temp.as_anon($q$ SELECT count(*)::text FROM public.my_telegram_link() $q$) || '|' ||
    pg_temp.as_anon($q$ SELECT public.stop_my_telegram_link()::text $q$), 'ERR:42501|ERR:42501|ERR:42501');
  PERFORM pg_temp.check_eq('authenticated cannot call the webhook or sender functions',
    pg_temp.as_user(a, format($q$ SELECT public.telegram_link_claim(%L, 1)::text $q$, repeat('a', 64))) || '|' ||
    pg_temp.as_user(a, $q$ SELECT public.telegram_link_stop(1) $q$) || '|' ||
    pg_temp.as_user(a, format($q$ SELECT count(*)::text FROM public.telegram_link_for(%L) $q$, a)),
    'ERR:42501|ERR:42501|ERR:42501');
  PERFORM pg_temp.check_eq('anon cannot call the webhook functions either',
    pg_temp.as_anon(format($q$ SELECT public.telegram_link_claim(%L, 1)::text $q$, repeat('a', 64))) || '|' ||
    pg_temp.as_anon($q$ SELECT public.telegram_link_stop(1) $q$), 'ERR:42501|ERR:42501');
  PERFORM pg_temp.check_eq('...service_role may (positive control for the denials above)',
    has_function_privilege('service_role', 'public.telegram_link_claim(text,bigint)', 'EXECUTE')::text || '/' ||
    has_function_privilege('service_role', 'public.telegram_link_stop(bigint)', 'EXECUTE')::text || '/' ||
    has_function_privilege('service_role', 'public.telegram_link_for(uuid)', 'EXECUTE')::text, 'true/true/true');

  -- 3. creating a token ----------------------------------------------------------
  PERFORM pg_temp.check_eq('an unknown language is refused',
    pg_temp.as_user(a, $q$ SELECT public.create_telegram_link_token('de', NULL) $q$), 'ERR:22023');
  ta := pg_temp.as_user(a, $q$ SELECT public.create_telegram_link_token('ru', 'Europe/Belgrade') $q$);
  PERFORM pg_temp.check_eq('the token is 64 hex characters (fits /start: A-Za-z0-9_-, up to 64)',
    (ta ~ '^[0-9a-f]{64}$')::text, 'true');
  PERFORM pg_temp.check_eq('only the hash is stored, with the language, the zone and a one-hour life',
    (SELECT count(*)::text || '/' ||
            bool_and(token_hash = encode(sha256(convert_to(ta, 'UTF8')), 'hex'))::text || '/' ||
            bool_and(token_hash <> ta)::text || '/' ||
            bool_and(lang = 'ru' AND time_zone = 'Europe/Belgrade')::text || '/' ||
            bool_and(expires_at - created_at = interval '1 hour' AND used_at IS NULL)::text
     FROM telegram_link_tokens WHERE user_id = a), '1/true/true/true/true');
  tb := pg_temp.as_user(b, $q$ SELECT public.create_telegram_link_token('en', 'Not/AZone') $q$);
  PERFORM pg_temp.check_eq('an unknown time zone is stored as unknown, not rejected',
    (SELECT COALESCE(time_zone, 'null') FROM telegram_link_tokens WHERE user_id = b), 'null');
  ta2 := pg_temp.as_user(a, $q$ SELECT public.create_telegram_link_token('ru', NULL) $q$);
  PERFORM pg_temp.check_eq('a second token replaces the first: one row, and the first no longer links',
    (SELECT count(*)::text FROM telegram_link_tokens WHERE user_id = a) || '|' ||
    pg_temp.as_service(format($q$ SELECT public.telegram_link_claim(%L, 1001)->>'ok' $q$, ta)) || '|' ||
    (SELECT count(*)::text FROM telegram_links WHERE user_id = a), '1|false|0');

  -- 4. claiming ------------------------------------------------------------------
  PERFORM pg_temp.check_eq('a malformed, a short and an unknown token all answer invalid_token',
    pg_temp.as_service($q$ SELECT public.telegram_link_claim('not-a-token', 1001)->>'reason' $q$) || '|' ||
    pg_temp.as_service(format($q$ SELECT public.telegram_link_claim(%L, 1001)->>'reason' $q$, substr(ta2, 1, 63))) || '|' ||
    pg_temp.as_service(format($q$ SELECT public.telegram_link_claim(%L, 1001)->>'reason' $q$, repeat('0', 64))),
    'invalid_token|invalid_token|invalid_token');
  PERFORM pg_temp.check_eq('a valid token links the chat and answers its saved language (positive control)',
    pg_temp.as_service(format($q$ SELECT public.telegram_link_claim(%L, 1001)::text $q$, ta2)), '{"ok": true, "lang": "ru"}');
  PERFORM pg_temp.check_eq('the link holds the chat, language and no stop date',
    (SELECT chat_id::text || '/' || lang || '/' || (stopped_at IS NULL)::text FROM telegram_links WHERE user_id = a), '1001/ru/true');
  PERFORM pg_temp.check_eq('the same token works once: the second claim is refused and links nothing new',
    pg_temp.as_service(format($q$ SELECT public.telegram_link_claim(%L, 2002)->>'reason' $q$, ta2)) || '|' ||
    (SELECT chat_id::text FROM telegram_links WHERE user_id = a), 'invalid_token|1001');

  -- an expired token: the same user, a token pushed past its hour
  te := pg_temp.as_user(b, $q$ SELECT public.create_telegram_link_token('en', NULL) $q$);
  UPDATE telegram_link_tokens SET expires_at = now() - interval '1 minute' WHERE user_id = b;
  PERFORM pg_temp.check_eq('an expired token is refused and links nothing (b has no link)',
    pg_temp.as_service(format($q$ SELECT public.telegram_link_claim(%L, 1002)->>'reason' $q$, te)) || '|' ||
    (SELECT count(*)::text FROM telegram_links WHERE user_id = b), 'invalid_token|0');
  tb := pg_temp.as_user(b, $q$ SELECT public.create_telegram_link_token('en', 'Europe/Belgrade') $q$);
  PERFORM pg_temp.check_eq('...and a fresh token for b links chat 1002 (positive control for the expiry denial)',
    pg_temp.as_service(format($q$ SELECT public.telegram_link_claim(%L, 1002)->>'ok' $q$, tb)), 'true');
  PERFORM pg_temp.check_eq('b''s link holds the zone captured at link time',
    (SELECT time_zone FROM telegram_links WHERE user_id = b), 'Europe/Belgrade');

  -- 5. isolation -----------------------------------------------------------------
  PERFORM pg_temp.check_eq('a reads only a''s link; b only b''s (positive control: each sees one row)',
    pg_temp.as_user(a, $q$ SELECT string_agg(chat_id::text, ',') FROM public.my_telegram_link() $q$) || '|' ||
    pg_temp.as_user(b, $q$ SELECT string_agg(chat_id::text, ',') FROM public.my_telegram_link() $q$), '1001|1002');
  PERFORM pg_temp.check_eq('x, with no link, reads nothing',
    pg_temp.as_user(x, $q$ SELECT count(*)::text FROM public.my_telegram_link() $q$), '0');

  -- 6. a chat belongs to one active link -------------------------------------------
  tx := pg_temp.as_user(x, $q$ SELECT public.create_telegram_link_token('en', NULL) $q$);
  PERFORM pg_temp.check_eq('x links chat 1001, which a holds: x is active',
    pg_temp.as_service(format($q$ SELECT public.telegram_link_claim(%L, 1001)->>'ok' $q$, tx)), 'true');
  PERFORM pg_temp.check_eq('...a''s link is stopped, b''s is untouched (positive control)',
    (SELECT (stopped_at IS NOT NULL)::text FROM telegram_links WHERE user_id = a) || '|' ||
    (SELECT (stopped_at IS NULL)::text FROM telegram_links WHERE user_id = x) || '|' ||
    (SELECT (stopped_at IS NULL)::text FROM telegram_links WHERE user_id = b), 'true|true|true');
  PERFORM pg_temp.check_eq('the sender finds no active link for a and one for x (the chat is x''s now)',
    pg_temp.as_service(format($q$ SELECT count(*)::text FROM public.telegram_link_for(%L) $q$, a)) || '|' ||
    pg_temp.as_service(format($q$ SELECT chat_id::text FROM public.telegram_link_for(%L) $q$, x)), '0|1001');
  PERFORM pg_temp.check_eq('the database refuses two active links on one chat',
    (SELECT CASE WHEN EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'telegram_links_active_chat_idx'
                                   AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%stopped_at IS NULL%')
     THEN 'unique-partial-index' ELSE 'missing' END), 'unique-partial-index');

  -- 7. /stop and a 403 ---------------------------------------------------------------
  -- A read and the change it checks are separate statements: one statement's
  -- subselects see the snapshot from before its own function calls ran.
  r := pg_temp.as_service($q$ SELECT public.telegram_link_stop(1002) $q$);
  PERFORM pg_temp.check_eq('/stop on chat 1002 returns b''s language and stops b''s link; the sender then finds none',
    r || '|' ||
    (SELECT (stopped_at IS NOT NULL)::text FROM telegram_links WHERE user_id = b) || '|' ||
    pg_temp.as_service(format($q$ SELECT count(*)::text FROM public.telegram_link_for(%L) $q$, b)), 'en|true|0');
  PERFORM pg_temp.check_eq('a second /stop on that chat answers null (nothing was on), and a chat with no link too',
    pg_temp.as_service($q$ SELECT public.telegram_link_stop(1002) $q$) || '|' ||
    pg_temp.as_service($q$ SELECT public.telegram_link_stop(999999) $q$), 'null|null');
  PERFORM pg_temp.check_eq('stopping b did not stop x (positive control)',
    pg_temp.as_service(format($q$ SELECT count(*)::text FROM public.telegram_link_for(%L) $q$, x)), '1');
  PERFORM pg_temp.check_eq('b''s own read still shows the row, with a stop date',
    pg_temp.as_user(b, $q$ SELECT (stopped_at IS NOT NULL)::text FROM public.my_telegram_link() $q$), 'true');

  -- 8. linking again after a stop ------------------------------------------------------
  tb := pg_temp.as_user(b, $q$ SELECT public.create_telegram_link_token('ru', NULL) $q$);
  r := pg_temp.as_service(format($q$ SELECT public.telegram_link_claim(%L, 1002)::text $q$, tb));
  PERFORM pg_temp.check_eq('a new token after /stop turns the link on again, in the new language',
    r || '|' ||
    (SELECT (stopped_at IS NULL)::text || '/' || lang FROM telegram_links WHERE user_id = b), '{"ok": true, "lang": "ru"}|true/ru');

  -- 9. "Turn off" ------------------------------------------------------------------------
  r := pg_temp.as_user(a, $q$ SELECT public.stop_my_telegram_link()::text $q$);
  PERFORM pg_temp.check_eq('a cannot turn off b''s link: a has a stopped link, so false; b is still active',
    r || '|' ||
    (SELECT (stopped_at IS NULL)::text FROM telegram_links WHERE user_id = b), 'false|true');
  r := pg_temp.as_user(b, $q$ SELECT public.create_telegram_link_token('ru', NULL) $q$);
  te := pg_temp.as_user(b, $q$ SELECT public.stop_my_telegram_link()::text $q$);
  PERFORM pg_temp.check_eq('b turns off: true, the link is stopped, and a link made but not used no longer works',
    te || '|' ||
    (SELECT (stopped_at IS NOT NULL)::text FROM telegram_links WHERE user_id = b) || '|' ||
    pg_temp.as_service(format($q$ SELECT public.telegram_link_claim(%L, 1002)->>'reason' $q$, r)), 'true|true|invalid_token');
  PERFORM pg_temp.check_eq('turning off twice: the second is false',
    pg_temp.as_user(b, $q$ SELECT public.stop_my_telegram_link()::text $q$), 'false');

  -- 10. account deletion removes the link and the tokens ---------------------------------------
  tx := pg_temp.as_user(x, $q$ SELECT public.create_telegram_link_token('en', NULL) $q$);
  PERFORM pg_temp.check_eq('seed: x has a link and a pending token; b has a link',
    (SELECT count(*)::text FROM telegram_links WHERE user_id = x) || '/' ||
    (SELECT count(*)::text FROM telegram_link_tokens WHERE user_id = x) || '/' ||
    (SELECT count(*)::text FROM telegram_links WHERE user_id = b), '1/1/1');
  PERFORM pg_temp.check_eq('x deletes the account: ok',
    (pg_temp.as_user(x, $q$ SELECT public.delete_my_account()::text $q$)::jsonb)->>'ok', 'true');
  PERFORM pg_temp.check_eq('...x''s link and token are gone and the chat answers nothing; b''s link remains (positive control)',
    (SELECT count(*)::text FROM telegram_links WHERE user_id = x) || '/' ||
    (SELECT count(*)::text FROM telegram_link_tokens WHERE user_id = x) || '/' ||
    pg_temp.as_service(format($q$ SELECT count(*)::text FROM public.telegram_link_for(%L) $q$, x)) || '/' ||
    (SELECT count(*)::text FROM telegram_links WHERE user_id = b), '0/0/0/1');

  RAISE NOTICE 'COH-010 PASS';
END;
$$;

ROLLBACK;
