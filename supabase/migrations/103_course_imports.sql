-- ============================================================
-- 103_course_imports.sql
--
-- CNT-018 (#259): the database half of the course import pipeline (docs/decisions/0203
-- Decisions 3, 5, 6). An author with the import grant (102) uploads a PDF, DOCX, Markdown
-- or text file; a job in steps drafts it into a NEW draft course. Everything the pipeline
-- needs from SQL is here; the TypeScript half is lib/courseImport/ and app/api/studio/imports.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time and again
-- before commit:
--   latest migration before this one        -> 102_course_import_grant.sql
--   latest body of the account-delete RPC   -> 096_voice_analyses.sql. RE-EMITTED here
--     (section 8) from that body, verbatim except for the course_imports delete and the
--     two new keys in its result.
-- REQUIRES 102 (_can_import, can_import_course), 083 (_studio_can_write), 082
-- (_author_seat_active), 029 (course_editors), 041/043/055 (courses, lessons, lesson_versions)
-- and is_admin.
--
-- ── 1. course_imports ───────────────────────────────────────────────────
-- One row per import: the state machine (the voice_analyses pattern, 096/097). Status goes
--   pending -> planning -> drafting -> committing -> done | failed
-- and a lease says who may run the next step. `plan`, `lessons` (the drafted lesson files, in
-- order), `qa` and `usage` (one entry per model call) are JSONB. `object_name` and
-- `anthropic_file_id` name the two copies of the author's file that exist while the job runs;
-- both are cleared (course_import_cleaned) once the copies are deleted.
--
-- RLS on, owner SELECT only, and only the columns the status page needs (no lease, no
-- drafted lessons, no object name). Nothing but the functions below writes.
--
-- A partial unique index keeps two active imports from claiming one slug.
--
-- ── 2. Caps (0203 Decision 6) ───────────────────────────────────────────
-- 3 imports per rolling 24 h and 10 per rolling 30 days, per user, a BEFORE INSERT trigger
-- raising PT429 (DETAIL daily_cap | monthly_cap, HINT the time a place frees up), the 096
-- shape. Admins are exempt. A row that failed before any model call (usage = '[]') is not
-- counted: no money was spent on it.
--
-- ── 3. Bucket course-imports ────────────────────────────────────────────
-- Private, 32 MB, PDF / DOCX / Markdown / text. The one policy is INSERT: the first path
-- segment is the caller's id and can_import_course() is true. There is no read, update or
-- delete policy: the pipeline reads and removes with the service role.
--
-- ── 4. course_import_create(object, format, title, slug, level)   authenticated ──
-- The start of an import. Refuses without the grant ('forbidden'), with a lapsed seat
-- ('seat_lapsed'), for a path outside the caller's folder or an object that is not there
-- ('file_missing'), a bad title / slug / level / format, or a slug already used by a course
-- or an active import ('slug_taken'). Inserting fires the caps trigger.
--
-- ── 5. Step functions   service_role only ───────────────────────────────
-- course_import_claim (atomic lease; returns the whole row), course_import_advance
-- (forward-only, stores the step's output, renews the lease), course_import_release (lets go
-- of the lease between steps), course_import_fail, course_import_cleaned.
--
-- ── 6. course_import_commit(import, course)   service_role only ─────────
-- All or nothing. Re-checks _can_import and _studio_can_write for the import's owner (the
-- grant may have gone since it started), then creates the course (draft, unlisted,
-- author_id, a course_editors row for a non-admin), its lessons and one lesson_versions row
-- each with source = 'import'. It never publishes and sets no access level.
--
-- ── 7. course_import_sweep(age)   service_role only ─────────────────────
-- Fails every non-terminal import older than `age` ('timeout'), and returns what the daily
-- cron must remove: copies still held by finished rows, and bucket objects no row refers to.
--
-- ── 8. delete_my_account re-emitted ─────────────────────────────────────
-- Deletes the caller's course_imports rows and returns the object names and Anthropic file
-- ids they held, so the route can remove them (the voice_objects pattern).
--
-- Not destructive: no DROP, no TRUNCATE, no UPDATE or DELETE of an existing row at apply
-- time. Safe to re-apply: IF NOT EXISTS, ON CONFLICT, DROP POLICY / TRIGGER IF EXISTS then
-- CREATE, CREATE OR REPLACE.
-- ============================================================

BEGIN;

-- ── 1. course_imports ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS course_imports (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status            TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'planning', 'drafting', 'committing', 'done', 'failed')),
  format            TEXT        NOT NULL CHECK (format IN ('pdf', 'docx', 'markdown', 'text')),
  object_name       TEXT,
  title             TEXT        NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  slug              TEXT        NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 80),
  level             TEXT        NOT NULL CHECK (level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  plan              JSONB,
  lessons           JSONB       NOT NULL DEFAULT '[]'::jsonb,
  lessons_done      INTEGER     NOT NULL DEFAULT 0,
  qa                JSONB,
  usage             JSONB       NOT NULL DEFAULT '[]'::jsonb,
  prompt_version    TEXT,
  model             TEXT,
  anthropic_file_id TEXT,
  course_id         UUID        REFERENCES courses(id) ON DELETE SET NULL,
  failure           TEXT        CHECK (failure IS NULL OR char_length(failure) <= 200),
  lease_until       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS course_imports_user_idx ON course_imports (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS course_imports_active_slug_idx
  ON course_imports (slug) WHERE status IN ('pending', 'planning', 'drafting', 'committing');

ALTER TABLE course_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE course_imports FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, user_id, status, format, title, slug, level, plan, lessons_done, qa,
              prompt_version, model, course_id, failure, created_at, updated_at, finished_at)
  ON course_imports TO authenticated;

DROP POLICY IF EXISTS "course_imports: owner read" ON course_imports;
CREATE POLICY "course_imports: owner read"
  ON course_imports FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));


-- ── 2. Caps ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION course_import_daily_limit()
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 3 $$;
REVOKE ALL ON FUNCTION course_import_daily_limit() FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION course_import_monthly_limit()
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 10 $$;
REVOKE ALL ON FUNCTION course_import_monthly_limit() FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION course_import_enforce_caps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count  INTEGER;
  v_oldest TIMESTAMPTZ;
BEGIN
  IF is_admin(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('course_imports:' || NEW.user_id::text, 0));

  -- The newest N counted rows in the window; the oldest of them is the one whose leaving
  -- frees a place. A row that failed before any model call cost nothing and is not counted.
  SELECT count(*), min(created_at) INTO v_count, v_oldest
  FROM (
    SELECT created_at FROM course_imports
    WHERE user_id = NEW.user_id
      AND created_at > now() - INTERVAL '24 hours'
      AND NOT (status = 'failed' AND usage = '[]'::jsonb)
    ORDER BY created_at DESC
    LIMIT course_import_daily_limit()
  ) w;
  IF v_count >= course_import_daily_limit() THEN
    RAISE EXCEPTION 'course import daily cap reached (% in 24 hours)', course_import_daily_limit()
      USING ERRCODE = 'PT429', DETAIL = 'daily_cap',
            HINT = to_char((v_oldest + INTERVAL '24 hours') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  END IF;

  SELECT count(*), min(created_at) INTO v_count, v_oldest
  FROM (
    SELECT created_at FROM course_imports
    WHERE user_id = NEW.user_id
      AND created_at > now() - INTERVAL '30 days'
      AND NOT (status = 'failed' AND usage = '[]'::jsonb)
    ORDER BY created_at DESC
    LIMIT course_import_monthly_limit()
  ) w;
  IF v_count >= course_import_monthly_limit() THEN
    RAISE EXCEPTION 'course import monthly cap reached (% in 30 days)', course_import_monthly_limit()
      USING ERRCODE = 'PT429', DETAIL = 'monthly_cap',
            HINT = to_char((v_oldest + INTERVAL '30 days') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION course_import_enforce_caps() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS course_import_caps ON course_imports;
CREATE TRIGGER course_import_caps
  BEFORE INSERT ON course_imports
  FOR EACH ROW
  EXECUTE FUNCTION course_import_enforce_caps();


-- ── 3. Bucket ───────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'course-imports',
  'course-imports',
  FALSE,
  33554432,                                             -- 32 MiB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/markdown',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "course_imports: granted insert" ON storage.objects;
CREATE POLICY "course_imports: granted insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    CASE WHEN bucket_id = 'course-imports' THEN
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      AND can_import_course()
    ELSE FALSE END
  );


-- ── 4. course_import_create ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION course_import_create(
  p_object_name TEXT,
  p_format      TEXT,
  p_title       TEXT,
  p_slug        TEXT,
  p_level       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := (SELECT auth.uid());
  v_id UUID;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT _can_import(v_me) THEN
    -- A seat that holds the grant but has lapsed is told so; everything else is forbidden.
    IF EXISTS (SELECT 1 FROM author_seats s WHERE s.user_id = v_me AND s.can_import) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' OR char_length(btrim(p_title)) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_title');
  END IF;
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR char_length(p_slug) > 80 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_slug');
  END IF;
  IF p_level IS NULL OR p_level NOT IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_level');
  END IF;
  IF p_format IS NULL OR p_format NOT IN ('pdf', 'docx', 'markdown', 'text') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_format');
  END IF;

  IF p_object_name IS NULL
     OR (storage.foldername(p_object_name))[1] IS DISTINCT FROM v_me::text
     OR NOT EXISTS (
       SELECT 1 FROM storage.objects o
       WHERE o.bucket_id = 'course-imports' AND o.name = p_object_name
     )
     OR EXISTS (SELECT 1 FROM course_imports c WHERE c.object_name = p_object_name) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'file_missing');
  END IF;

  IF EXISTS (SELECT 1 FROM courses WHERE slug = p_slug)
     OR EXISTS (
       SELECT 1 FROM course_imports c
       WHERE c.slug = p_slug AND c.status IN ('pending', 'planning', 'drafting', 'committing')
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slug_taken');
  END IF;

  BEGIN
    INSERT INTO course_imports (user_id, format, object_name, title, slug, level)
    VALUES (v_me, p_format, p_object_name, btrim(p_title), p_slug, p_level)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slug_taken');
  END;

  RETURN jsonb_build_object('ok', true, 'import_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION course_import_create(TEXT, TEXT, TEXT, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION course_import_create(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ── 5. Step functions ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION course_import_claim(p_id UUID, p_lease_seconds INTEGER DEFAULT 150)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     JSONB;
  v_status  TEXT;
  v_seconds INTEGER := LEAST(GREATEST(COALESCE(p_lease_seconds, 150), 10), 600);
BEGIN
  UPDATE course_imports
     SET lease_until = now() + make_interval(secs => v_seconds), updated_at = now()
   WHERE id = p_id
     AND status IN ('pending', 'planning', 'drafting', 'committing')
     AND (lease_until IS NULL OR lease_until <= now())
  RETURNING to_jsonb(course_imports.*) INTO v_row;

  IF v_row IS NOT NULL THEN
    RETURN jsonb_build_object('claimed', true, 'row', v_row);
  END IF;

  SELECT status INTO v_status FROM course_imports WHERE id = p_id;
  RETURN jsonb_build_object('claimed', false, 'status', COALESCE(v_status, 'missing'));
END;
$$;

REVOKE ALL ON FUNCTION course_import_claim(UUID, INTEGER) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION course_import_claim(UUID, INTEGER) TO service_role;


-- p_patch keys (all optional): plan, lessons, qa, usage, prompt_version, model,
-- anthropic_file_id, object_name. A key that is present replaces the column (a JSON null
-- clears anthropic_file_id / object_name); an absent key leaves it. `lessons` may only grow.
CREATE OR REPLACE FUNCTION course_import_advance(
  p_id            UUID,
  p_status        TEXT,
  p_patch         JSONB   DEFAULT '{}'::jsonb,
  p_lease_seconds INTEGER DEFAULT 150
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order   TEXT[] := ARRAY['pending', 'planning', 'drafting', 'committing'];
  v_seconds INTEGER := LEAST(GREATEST(COALESCE(p_lease_seconds, 150), 10), 600);
  v_lessons JSONB;
BEGIN
  IF p_status NOT IN ('planning', 'drafting', 'committing') THEN
    RAISE EXCEPTION 'course_import_advance: % is not a step', p_status;
  END IF;
  v_lessons := p_patch -> 'lessons';
  IF v_lessons IS NOT NULL AND jsonb_typeof(v_lessons) <> 'array' THEN
    RAISE EXCEPTION 'course_import_advance: lessons must be an array';
  END IF;

  UPDATE course_imports c
     SET status            = p_status,
         plan              = CASE WHEN p_patch ? 'plan' THEN p_patch -> 'plan' ELSE c.plan END,
         lessons           = COALESCE(v_lessons, c.lessons),
         lessons_done      = COALESCE(jsonb_array_length(v_lessons), c.lessons_done),
         qa                = CASE WHEN p_patch ? 'qa' THEN p_patch -> 'qa' ELSE c.qa END,
         usage             = COALESCE(p_patch -> 'usage', c.usage),
         prompt_version    = COALESCE(p_patch ->> 'prompt_version', c.prompt_version),
         model             = COALESCE(p_patch ->> 'model', c.model),
         anthropic_file_id = CASE WHEN p_patch ? 'anthropic_file_id' THEN p_patch ->> 'anthropic_file_id' ELSE c.anthropic_file_id END,
         object_name       = CASE WHEN p_patch ? 'object_name' THEN p_patch ->> 'object_name' ELSE c.object_name END,
         lease_until       = now() + make_interval(secs => v_seconds),
         updated_at        = now()
   WHERE c.id = p_id
     AND c.status IN ('pending', 'planning', 'drafting', 'committing')
     AND array_position(v_order, c.status) <= array_position(v_order, p_status)
     AND (v_lessons IS NULL OR jsonb_array_length(v_lessons) >= jsonb_array_length(c.lessons));
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION course_import_advance(UUID, TEXT, JSONB, INTEGER) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION course_import_advance(UUID, TEXT, JSONB, INTEGER) TO service_role;


CREATE OR REPLACE FUNCTION course_import_release(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE course_imports
     SET lease_until = NULL, updated_at = now()
   WHERE id = p_id AND status IN ('pending', 'planning', 'drafting', 'committing');
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION course_import_release(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION course_import_release(UUID) TO service_role;


CREATE OR REPLACE FUNCTION course_import_fail(p_id UUID, p_failure TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE course_imports
     SET status = 'failed', failure = left(COALESCE(p_failure, 'unknown'), 200), lease_until = NULL,
         updated_at = now(), finished_at = now()
   WHERE id = p_id AND status IN ('pending', 'planning', 'drafting', 'committing');
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION course_import_fail(UUID, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION course_import_fail(UUID, TEXT) TO service_role;


-- Called after the object and the Anthropic file were deleted. Terminal rows only: a running
-- job still needs its copies.
CREATE OR REPLACE FUNCTION course_import_cleaned(p_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  UPDATE course_imports
     SET object_name = NULL, anthropic_file_id = NULL, updated_at = now()
   WHERE id = ANY (p_ids) AND status IN ('done', 'failed');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION course_import_cleaned(UUID[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION course_import_cleaned(UUID[]) TO service_role;


-- ── 6. course_import_commit ─────────────────────────────────────────────
-- p_course: { "subtitle"?: text, "description"?: text, "qa"?: jsonb,
--             "lessons": [ { "slug", "title", "description"?, "estimatedMinutes"?, "document": [...] } ] }
-- Title, slug and level are the import row's own (what the author typed).
CREATE OR REPLACE FUNCTION course_import_commit(p_id UUID, p_course JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_imp       course_imports%ROWTYPE;
  v_course_id UUID;
  v_lesson_id UUID;
  v_item      JSONB;
  v_ord       INTEGER;
  v_seen      TEXT[] := ARRAY[]::TEXT[];
  v_slug      TEXT;
BEGIN
  SELECT * INTO v_imp FROM course_imports WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_imp.status <> 'committing' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'wrong_state');
  END IF;

  -- The grant may have gone, or the seat lapsed, since the import started.
  IF NOT _can_import(v_imp.user_id) THEN
    IF EXISTS (SELECT 1 FROM author_seats s WHERE s.user_id = v_imp.user_id AND s.can_import) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT _studio_can_write(v_imp.user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;

  IF p_course IS NULL OR jsonb_typeof(p_course -> 'lessons') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_course -> 'lessons') NOT BETWEEN 1 AND 12 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_course');
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_course -> 'lessons') LOOP
    v_slug := v_item ->> 'slug';
    IF jsonb_typeof(v_item) <> 'object'
       OR v_slug IS NULL OR v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       OR v_slug = ANY (v_seen)
       OR COALESCE(btrim(v_item ->> 'title'), '') = ''
       OR jsonb_typeof(v_item -> 'document') IS DISTINCT FROM 'array' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_course');
    END IF;
    v_seen := v_seen || v_slug;
  END LOOP;

  IF EXISTS (SELECT 1 FROM courses WHERE slug = v_imp.slug) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slug_taken');
  END IF;

  BEGIN
    INSERT INTO courses (slug, title, subtitle, description, level, status, author_id)
    VALUES (v_imp.slug, v_imp.title, NULLIF(p_course ->> 'subtitle', ''), NULLIF(p_course ->> 'description', ''),
            v_imp.level, 'draft', v_imp.user_id)
    RETURNING id INTO v_course_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slug_taken');
  END;

  IF NOT is_admin(v_imp.user_id) THEN
    INSERT INTO course_editors (course_id, user_id, granted_by)
    VALUES (v_course_id, v_imp.user_id, v_imp.user_id);
  END IF;

  v_ord := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_course -> 'lessons') LOOP
    v_ord := v_ord + 1;
    -- access_level keeps its column default: an import never opens a lesson to anyone.
    INSERT INTO lessons (course_id, ordinal, slug, title, description, estimated_minutes)
    VALUES (v_course_id, v_ord, v_item ->> 'slug', btrim(v_item ->> 'title'),
            NULLIF(v_item ->> 'description', ''), (v_item ->> 'estimatedMinutes')::INTEGER)
    RETURNING id INTO v_lesson_id;

    INSERT INTO lesson_versions (lesson_id, document, source, created_by)
    VALUES (v_lesson_id, v_item -> 'document', 'import', v_imp.user_id);
  END LOOP;

  UPDATE course_imports
     SET status = 'done', course_id = v_course_id, qa = COALESCE(p_course -> 'qa', qa),
         lease_until = NULL, updated_at = now(), finished_at = now()
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'course_id', v_course_id);
END;
$$;

REVOKE ALL ON FUNCTION course_import_commit(UUID, JSONB) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION course_import_commit(UUID, JSONB) TO service_role;


-- ── 7. course_import_sweep ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION course_import_sweep(p_age INTERVAL DEFAULT INTERVAL '24 hours')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stuck    INTEGER;
  v_left     JSONB;
  v_orphans  JSONB;
BEGIN
  WITH s AS (
    UPDATE course_imports
       SET status = 'failed', failure = 'timeout', lease_until = NULL,
           updated_at = now(), finished_at = now()
     WHERE status IN ('pending', 'planning', 'drafting', 'committing')
       AND created_at < now() - p_age
    RETURNING id
  )
  SELECT count(*) INTO v_stuck FROM s;

  -- Copies a finished row still names. A job that just ended removes its own within
  -- seconds, so a row has to be a little old before this counts it as left behind.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'object_name', object_name,
                                               'anthropic_file_id', anthropic_file_id)), '[]'::jsonb)
    INTO v_left
    FROM course_imports
   WHERE status IN ('done', 'failed')
     AND (object_name IS NOT NULL OR anthropic_file_id IS NOT NULL)
     AND finished_at < now() - INTERVAL '10 minutes';

  -- Objects uploaded and never started (or whose row was deleted with the account).
  SELECT COALESCE(jsonb_agg(o.name), '[]'::jsonb)
    INTO v_orphans
    FROM storage.objects o
   WHERE o.bucket_id = 'course-imports'
     AND o.created_at < now() - p_age
     AND NOT EXISTS (SELECT 1 FROM course_imports c WHERE c.object_name = o.name);

  RETURN jsonb_build_object('swept', v_stuck, 'leftovers', v_left, 'orphans', v_orphans);
END;
$$;

REVOKE ALL ON FUNCTION course_import_sweep(INTERVAL) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION course_import_sweep(INTERVAL) TO service_role;


-- ── 8. delete_my_account, re-emitted from 096 ───────────────────────────
CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       UUID := auth.uid();
  v_blocking JSONB;
  v_voice    TEXT[];
  v_imp_objs TEXT[];
  v_imp_files TEXT[];
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name))
    INTO v_blocking
  FROM groups g
  WHERE g.owner_id = v_me
    AND EXISTS (
      SELECT 1 FROM group_members m
      WHERE m.group_id = g.id AND m.user_id <> v_me
    );

  IF v_blocking IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'owns_groups', 'groups', v_blocking);
  END IF;

  DELETE FROM groups g
  WHERE g.owner_id = v_me
    AND NOT EXISTS (
      SELECT 1 FROM group_members m
      WHERE m.group_id = g.id AND m.user_id <> v_me
    );

  DELETE FROM group_members WHERE user_id = v_me;

  -- Every object under the caller's segment, sent or not.
  SELECT COALESCE(array_agg(o.name ORDER BY o.name), ARRAY[]::TEXT[])
    INTO v_voice
  FROM storage.objects o
  WHERE o.bucket_id = 'voice-recordings'
    AND (storage.foldername(o.name))[2] = v_me::text;
  INSERT INTO voice_object_deletions (object_name, reason)
  SELECT unnest(v_voice), 'account_deleted'
  ON CONFLICT (object_name) DO NOTHING;

  DELETE FROM voice_feedback f
  USING voice_submissions s
  WHERE s.id = f.submission_id AND s.user_id = v_me;
  DELETE FROM voice_submissions        WHERE user_id = v_me;
  -- VOICE-011: the send ledger. The profile row stays, so its ON DELETE CASCADE never fires;
  -- analyses went with the takes above.
  DELETE FROM voice_analysis_sends     WHERE user_id = v_me;
  DELETE FROM run_final_comments       WHERE user_id = v_me;
  -- CNT-018 (docs/decisions/0203): the caller's course imports. The profile row stays, so the
  -- ON DELETE CASCADE would never fire. What the rows and the bucket still hold is returned
  -- for the route to remove (the voice_objects pattern); the daily sweep catches what fails.
  SELECT COALESCE(array_agg(o.name ORDER BY o.name), ARRAY[]::TEXT[])
    INTO v_imp_objs
  FROM storage.objects o
  WHERE o.bucket_id = 'course-imports'
    AND (storage.foldername(o.name))[1] = v_me::text;
  SELECT COALESCE(array_agg(c.anthropic_file_id), ARRAY[]::TEXT[])
    INTO v_imp_files
  FROM course_imports c
  WHERE c.user_id = v_me AND c.anthropic_file_id IS NOT NULL;
  DELETE FROM course_imports           WHERE user_id = v_me;

  DELETE FROM notifications            WHERE user_id = v_me;
  DELETE FROM notification_preferences WHERE user_id = v_me;
  DELETE FROM quiz_sessions            WHERE user_id = v_me;
  DELETE FROM lesson_attempts          WHERE user_id = v_me;
  DELETE FROM signup_acquisitions      WHERE user_id = v_me;
  DELETE FROM lesson_opens             WHERE user_id = v_me;
  DELETE FROM run_invites              WHERE claimed_by = v_me;
  DELETE FROM run_enrolments           WHERE user_id = v_me;
  DELETE FROM course_entitlements      WHERE user_id = v_me;
  -- TCH-001 (privacy-policy.md §9: "then deleted outright").
  DELETE FROM teacher_student_links    WHERE student_id = v_me OR teacher_id = v_me;
  DELETE FROM teacher_join_tokens      WHERE teacher_id = v_me;
  -- TCH-002: the caller's own groups (memberships cascade). Memberships of the
  -- caller as a student go with the link deletes above (trigger, section 3).
  DELETE FROM teacher_groups           WHERE teacher_id = v_me;
  -- TCH-004 (0144 Q4; privacy-policy.md §9): every conversation the caller is a
  -- party to, both sides. Messages (and anything a later card hangs off them)
  -- go with the conversation by ON DELETE CASCADE.
  DELETE FROM teacher_conversations    WHERE student_id = v_me OR teacher_id = v_me;
  -- TCH-005 (privacy-policy.md §9: "removed from the teacher's groups and homework"):
  -- the caller's own assignments (targets cascade) and, as a student, their direct
  -- targets. Group-derived homework ended with the 077 membership trigger.
  DELETE FROM homework_assignments     WHERE teacher_id = v_me;
  DELETE FROM homework_targets         WHERE student_id = v_me;
  -- TCH-007 (0154 Decision 8): the caller's seat, with its public name and the
  -- admin's notes. The profile row stays, so the cascade would not remove it.
  DELETE FROM author_seats             WHERE user_id = v_me;
  -- COH-016 (privacy-policy.md section 9: "delete your calendar feed token"). The profile
  -- row stays, so the ON DELETE CASCADE on the token table would never fire.
  DELETE FROM calendar_feed_tokens     WHERE user_id = v_me;
  -- COH-010 (privacy-policy.md section 9: "your Telegram chat id"). The profile row
  -- stays, so the ON DELETE CASCADE on these tables would never fire.
  DELETE FROM telegram_link_tokens     WHERE user_id = v_me;
  DELETE FROM telegram_links           WHERE user_id = v_me;

  UPDATE profiles
     SET full_name           = NULL,
         city                = NULL,
         display_name        = 'Deleted user',
         avatar_url          = NULL,
         leaderboard_opt_out = TRUE,
         deleted_at          = now()
   WHERE id = v_me;

  RETURN jsonb_build_object('ok', true, 'voice_objects', to_jsonb(v_voice),
                            'import_objects', to_jsonb(v_imp_objs), 'import_files', to_jsonb(v_imp_files));
END;
$$;

REVOKE ALL ON FUNCTION delete_my_account() FROM public, anon;
GRANT EXECUTE ON FUNCTION delete_my_account() TO authenticated;

COMMIT;
