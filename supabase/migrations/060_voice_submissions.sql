-- ============================================================
-- 060_voice_submissions.sql
--
-- VOICE-004. Learners' voice recordings and the partner's written feedback,
-- in the project's first PRIVATE bucket. Choices made while writing it are
-- in docs/decisions/0110.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 059_run_invites.sql
--   latest body of the account-delete RPC   -> 059_run_invites.sql
-- Re-emitted bodies, each from its latest definition:
--   delete_my_account        059 (voice rows deleted, objects queued and
--                            returned, section 8)
-- Nothing else is re-emitted. The access function (_lesson_access_at,
-- can_read_lesson, course_lesson_states) is NOT touched; the submit RPC
-- only calls it.
--
-- ── 1. Bucket: voice-recordings ─────────────────────────────────────────
-- Private (public = FALSE): no object has a public URL; playback is through
-- signed URLs only (lib/voice/recording.ts, VOICE_SIGNED_URL_TTL_SECONDS).
-- 10 MiB and audio/webm, audio/ogg, audio/mp4 (sizing and list: 0110
-- Decision 1, from 0097). Object name: {course}/{user}/{submission}.{ext}.
-- Storage RLS:
--   INSERT  the caller's own {user} segment, in a course they are entitled
--           to (has_course_entitlement);
--   SELECT  the caller's own {user} segment, or any object of a course the
--           caller edits (can_edit_course);
--   nothing else. No UPDATE (a take is never overwritten; a re-send is a new
--   object) and no DELETE for any app role: objects are removed by the
--   service role through the Storage API (submit route, account-delete
--   route, the daily purge route), never by deleting storage.objects rows.
--
-- ── 2. Tables ───────────────────────────────────────────────────────────
-- voice_submissions: the CURRENT take for one (enrolment, lesson, block).
--   A re-send replaces the row (new id = new object), so there is never more
--   than one row per slot. object_name is NULL once the object has been
--   removed by the 6-month purge (purged_at says when), so COH-005 can render
--   "removed" rather than "never recorded".
-- voice_feedback: one row per submission, the VOICE-002 shape (0096). A
--   draft has published_at NULL. Publishing is one-way; editing after it is
--   live (VOICE-006: "the learner sees the latest version").
-- voice_object_deletions: a queue of object names to remove through the
--   Storage API. Written by SQL (a replaced take, an account deletion);
--   drained by the routes immediately and by the daily purge as a backstop.
--   No grants.
--
-- ── 3. Submit: submit_voice_recording(id, lesson, block, object) ────────
-- Refuses unless ALL hold:
--   * the lesson has a published version, and the block id names a voice
--     task (kind 'task', type 'voice') in THAT version;
--   * the lesson's state for the caller is 'open' (_lesson_access_at);
--   * the caller has a non-revoked enrolment in a run of the course through
--     which the lesson is open now (0110 Decision 2: an enrolment, not a
--     grant, because retention is counted from the run's end);
--   * the object exists in the bucket under {course}/{caller}/{id}.{ext};
--   * the slot is not locked: its current take has no PUBLISHED feedback.
-- A re-send before publication replaces the previous take: its row goes,
-- a draft feedback is carried over to the new take, and its object is
-- queued for deletion and returned so the route removes it at once
-- (privacy-policy.md: "A recording you replace is deleted when you
-- replace it").
--
-- ── 4. Feedback: save_voice_feedback(submission, body, publish) ─────────
-- can_edit_course on the submission's course, or 'forbidden'. The body is
-- validated against 0096's shape and 5,000-character cap
-- (lib/feedback/content.ts, FEEDBACK_CONTENT_MAX_CHARS).
--
-- ── 5. Reads ────────────────────────────────────────────────────────────
-- SELECT grants to authenticated only. A learner reads their own
-- submissions and their own PUBLISHED feedback; an editor reads every
-- submission and every feedback row of the courses they edit. anon has no
-- grant on either table.
--
-- ── 6. Purge: voice_purge_due() / voice_mark_removed(names) ─────────────
-- service_role only, driven daily by app/api/cron/voice-purge (Vercel
-- Cron, 0110 Decision 4). Due: every queued name; every take whose run
-- ended 6 months ago or more; every object in the bucket older than 24 h
-- that no submission references (an upload that was never sent).
--
-- ── 7. Export ──────────────────────────────────────────────────────────
-- No function needed: the export route reads both tables under the
-- learner's own session (section 5) and downloads the audio under the
-- storage SELECT policy (section 1).
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the owner, never by a session.
--
-- Safe to re-apply: bucket upsert ON CONFLICT, CREATE TABLE / INDEX IF NOT
-- EXISTS, DROP POLICY IF EXISTS before each, every function CREATE OR
-- REPLACE.
-- ============================================================

BEGIN;

-- ── 1. Bucket and object policies ───────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voice-recordings',
  'voice-recordings',
  FALSE,
  10485760,                                             -- 10 MiB
  ARRAY['audio/webm', 'audio/ogg', 'audio/mp4']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- The name's segments are only cast to UUID inside the CASE's voice branch,
-- so another bucket's object with a non-UUID first segment never reaches the
-- cast (storage.objects policies are evaluated for every bucket's rows). A
-- malformed voice name makes the cast raise, which surfaces as a refused
-- insert or an invisible object, never as access (041 precedent).
DROP POLICY IF EXISTS "voice_recordings: owner insert" ON storage.objects;
CREATE POLICY "voice_recordings: owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    CASE WHEN bucket_id = 'voice-recordings' THEN
      (storage.foldername(name))[2] = (SELECT auth.uid())::text
      AND has_course_entitlement((storage.foldername(name))[1]::uuid)
    ELSE FALSE END
  );

DROP POLICY IF EXISTS "voice_recordings: owner or editor read" ON storage.objects;
CREATE POLICY "voice_recordings: owner or editor read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    CASE WHEN bucket_id = 'voice-recordings' THEN
      (storage.foldername(name))[2] = (SELECT auth.uid())::text
      OR can_edit_course((storage.foldername(name))[1]::uuid, (SELECT auth.uid()))
    ELSE FALSE END
  );


-- ── 2. Tables ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_submissions (
  id                UUID        PRIMARY KEY,
  enrolment_id      UUID        NOT NULL REFERENCES run_enrolments(id)  ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES profiles(id)        ON DELETE CASCADE,
  course_id         UUID        NOT NULL REFERENCES courses(id)         ON DELETE CASCADE,
  lesson_id         UUID        NOT NULL REFERENCES lessons(id)         ON DELETE CASCADE,
  block_id          TEXT        NOT NULL,
  lesson_version_id UUID        NOT NULL REFERENCES lesson_versions(id) ON DELETE CASCADE,
  object_name       TEXT        UNIQUE,
  content_type      TEXT        NOT NULL,
  size_bytes        BIGINT,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  purged_at         TIMESTAMPTZ,
  CONSTRAINT voice_submissions_one_per_slot UNIQUE (enrolment_id, lesson_id, block_id),
  CONSTRAINT voice_submissions_object_or_purged CHECK ((object_name IS NULL) = (purged_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS voice_submissions_user_idx   ON voice_submissions (user_id);
CREATE INDEX IF NOT EXISTS voice_submissions_course_idx ON voice_submissions (course_id, submitted_at);

CREATE TABLE IF NOT EXISTS voice_feedback (
  submission_id UUID        PRIMARY KEY REFERENCES voice_submissions(id) ON DELETE CASCADE,
  body          JSONB       NOT NULL,
  updated_by    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS voice_object_deletions (
  object_name TEXT        PRIMARY KEY,
  reason      TEXT        NOT NULL CHECK (reason IN ('replaced', 'account_deleted')),
  queued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE voice_submissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_feedback         ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_object_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE voice_submissions      FROM anon, authenticated;
REVOKE ALL ON TABLE voice_feedback         FROM anon, authenticated;
REVOKE ALL ON TABLE voice_object_deletions FROM anon, authenticated;
GRANT SELECT ON TABLE voice_submissions TO authenticated;
GRANT SELECT ON TABLE voice_feedback    TO authenticated;


-- ── 5. Read policies ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "voice_submissions: owner or editor read" ON voice_submissions;
CREATE POLICY "voice_submissions: owner or editor read"
  ON voice_submissions FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    OR can_edit_course(course_id, (SELECT auth.uid()))
  );

-- The subqueries run as the caller, under voice_submissions' own policy
-- above; authenticated holds SELECT on it, so this is not the 044 / 0105
-- "permission denied inside a policy" trap.
DROP POLICY IF EXISTS "voice_feedback: editor read" ON voice_feedback;
CREATE POLICY "voice_feedback: editor read"
  ON voice_feedback FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM voice_submissions s
    WHERE s.id = voice_feedback.submission_id
      AND can_edit_course(s.course_id, (SELECT auth.uid()))
  ));

DROP POLICY IF EXISTS "voice_feedback: owner reads published" ON voice_feedback;
CREATE POLICY "voice_feedback: owner reads published"
  ON voice_feedback FOR SELECT
  USING (
    published_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM voice_submissions s
      WHERE s.id = voice_feedback.submission_id
        AND s.user_id = (SELECT auth.uid())
    )
  );


-- ── 4a. FeedbackContent validation (0096), no grants ────────────────────
-- { "paragraphs": [ { "runs": [ { "text": "…", "bold": true? } ] } ] }
-- At least one paragraph, each with at least one run, each run non-empty
-- text; no other keys anywhere; total run text <= 5000 characters
-- (FEEDBACK_CONTENT_MAX_CHARS in lib/feedback/content.ts).
CREATE OR REPLACE FUNCTION _feedback_content_valid(p_body JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_para  JSONB;
  v_run   JSONB;
  v_total INTEGER := 0;
BEGIN
  IF p_body IS NULL OR jsonb_typeof(p_body) <> 'object' THEN RETURN FALSE; END IF;
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_body) k) <> ARRAY['paragraphs'] THEN
    RETURN FALSE;
  END IF;
  IF jsonb_typeof(p_body->'paragraphs') <> 'array' OR jsonb_array_length(p_body->'paragraphs') = 0 THEN
    RETURN FALSE;
  END IF;

  FOR v_para IN SELECT * FROM jsonb_array_elements(p_body->'paragraphs') LOOP
    IF jsonb_typeof(v_para) <> 'object' THEN RETURN FALSE; END IF;
    IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_para) k) <> ARRAY['runs'] THEN
      RETURN FALSE;
    END IF;
    IF jsonb_typeof(v_para->'runs') <> 'array' OR jsonb_array_length(v_para->'runs') = 0 THEN
      RETURN FALSE;
    END IF;

    FOR v_run IN SELECT * FROM jsonb_array_elements(v_para->'runs') LOOP
      IF jsonb_typeof(v_run) <> 'object' THEN RETURN FALSE; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_run) k WHERE k NOT IN ('text', 'bold')) THEN
        RETURN FALSE;
      END IF;
      IF jsonb_typeof(v_run->'text') IS DISTINCT FROM 'string' OR char_length(v_run->>'text') = 0 THEN
        RETURN FALSE;
      END IF;
      IF v_run ? 'bold' AND jsonb_typeof(v_run->'bold') <> 'boolean' THEN
        RETURN FALSE;
      END IF;
      v_total := v_total + char_length(v_run->>'text');
    END LOOP;
  END LOOP;

  RETURN v_total <= 5000;
END;
$$;

REVOKE ALL ON FUNCTION _feedback_content_valid(JSONB) FROM public, anon, authenticated;


-- ── 3. submit_voice_recording ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION submit_voice_recording(
  p_submission_id UUID,
  p_lesson_id     UUID,
  p_block_id      TEXT,
  p_object_name   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        UUID := auth.uid();
  v_lesson    lessons%ROWTYPE;
  v_block     JSONB;
  v_state     TEXT;
  v_enrolment UUID;
  v_object    storage.objects%ROWTYPE;
  v_mime      TEXT;
  v_prev      voice_submissions%ROWTYPE;
  v_fb        voice_feedback%ROWTYPE;
  v_has_fb    BOOLEAN := FALSE;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT * INTO v_lesson FROM lessons WHERE id = p_lesson_id;
  IF NOT FOUND OR v_lesson.published_version_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- The block must be a voice task in the PUBLISHED version, not a draft.
  SELECT b INTO v_block
  FROM lesson_versions v, jsonb_array_elements(v.document) b
  WHERE v.id = v_lesson.published_version_id
    AND jsonb_typeof(v.document) = 'array'
    AND b->>'id' = p_block_id
  LIMIT 1;
  IF v_block IS NULL OR v_block->>'kind' IS DISTINCT FROM 'task' OR v_block->>'type' IS DISTINCT FROM 'voice' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_voice_block');
  END IF;

  SELECT a.state INTO v_state FROM _lesson_access_at(p_lesson_id, v_me, now()) a;
  IF v_state IS DISTINCT FROM 'open' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_not_open');
  END IF;

  -- The enrolment the lesson is open through right now: the same per-run
  -- unlock _lesson_access_at takes the MIN of (058), taken per run. Latest
  -- run first, so a learner in run 1 (ended) and run 2 (in progress) files
  -- under run 2.
  SELECT e.id INTO v_enrolment
  FROM run_enrolments e
  JOIN course_runs r ON r.id = e.run_id
  WHERE e.user_id = v_me
    AND e.revoked_at IS NULL
    AND r.course_id = v_lesson.course_id
    AND (
      CASE
        WHEN v_lesson.access_level <> 'entitled' THEN TRUE
        WHEN v_lesson.week IS NULL THEN r.ends_at <= now()
        ELSE LEAST(r.starts_at + make_interval(days => 7 * (v_lesson.week - 1)), r.ends_at) <= now()
      END
    )
  ORDER BY r.starts_at DESC, e.enrolled_at DESC
  LIMIT 1;
  IF v_enrolment IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_enrolled');
  END IF;

  -- The upload must already be in the bucket, under this caller and this
  -- submission id.
  IF p_object_name IS NULL
     OR p_object_name !~ (
       '^' || v_lesson.course_id::text || '/' || v_me::text || '/' || p_submission_id::text
       || '\.(webm|ogg|m4a)$'
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_object_name');
  END IF;
  SELECT * INTO v_object FROM storage.objects
  WHERE bucket_id = 'voice-recordings' AND name = p_object_name;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'object_missing');
  END IF;
  v_mime := v_object.metadata->>'mimetype';
  IF v_mime IS NULL OR v_mime NOT IN ('audio/webm', 'audio/ogg', 'audio/mp4') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_content_type');
  END IF;

  -- Serialise re-sends of one slot.
  SELECT * INTO v_prev FROM voice_submissions
  WHERE enrolment_id = v_enrolment AND lesson_id = p_lesson_id AND block_id = p_block_id
  FOR UPDATE;

  IF FOUND THEN
    SELECT * INTO v_fb FROM voice_feedback WHERE submission_id = v_prev.id;
    v_has_fb := FOUND;
    IF v_has_fb AND v_fb.published_at IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'locked');
    END IF;
    -- Sending the current take again must not "replace" it with itself:
    -- that would queue the live object for deletion.
    IF v_prev.id = p_submission_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'duplicate_submission');
    END IF;
  END IF;

  -- One subtransaction: if the insert hits a unique violation (the id is
  -- already used, or a concurrent first send of the same slot won), the
  -- replaced take's deletion and queueing are undone with it.
  BEGIN
    IF v_prev.id IS NOT NULL THEN
      -- The replaced take goes (a draft feedback cascades with it and is
      -- re-inserted for the new take below), and its object is queued.
      IF v_prev.object_name IS NOT NULL THEN
        INSERT INTO voice_object_deletions (object_name, reason)
        VALUES (v_prev.object_name, 'replaced')
        ON CONFLICT (object_name) DO NOTHING;
      END IF;
      DELETE FROM voice_submissions WHERE id = v_prev.id;
    END IF;

    INSERT INTO voice_submissions (
      id, enrolment_id, user_id, course_id, lesson_id, block_id,
      lesson_version_id, object_name, content_type, size_bytes
    ) VALUES (
      p_submission_id, v_enrolment, v_me, v_lesson.course_id, p_lesson_id, p_block_id,
      v_lesson.published_version_id, p_object_name, v_mime,
      NULLIF(v_object.metadata->>'size', '')::BIGINT
    );

    IF v_has_fb THEN
      INSERT INTO voice_feedback (submission_id, body, updated_by, created_at, updated_at, published_at)
      VALUES (p_submission_id, v_fb.body, v_fb.updated_by, v_fb.created_at, v_fb.updated_at, NULL);
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_submission');
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'submission_id', p_submission_id,
    'replaced_object', CASE WHEN v_prev.id IS NOT NULL THEN v_prev.object_name END
  );
END;
$$;

REVOKE ALL ON FUNCTION submit_voice_recording(UUID, UUID, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION submit_voice_recording(UUID, UUID, TEXT, TEXT) TO authenticated;


-- ── 4b. save_voice_feedback ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION save_voice_feedback(
  p_submission_id UUID,
  p_body          JSONB,
  p_publish       BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        UUID := auth.uid();
  v_course    UUID;
  v_published TIMESTAMPTZ;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT course_id INTO v_course FROM voice_submissions WHERE id = p_submission_id;
  -- Not found and not an editor read the same, so a non-editor cannot probe
  -- which submission ids exist.
  IF v_course IS NULL OR NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF NOT _feedback_content_valid(p_body) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_feedback');
  END IF;

  INSERT INTO voice_feedback (submission_id, body, updated_by, published_at)
  VALUES (p_submission_id, p_body, v_me, CASE WHEN p_publish THEN now() END)
  ON CONFLICT (submission_id) DO UPDATE
    SET body         = EXCLUDED.body,
        updated_by   = EXCLUDED.updated_by,
        updated_at   = now(),
        -- One-way: once published it stays published (the block is locked
        -- on it), and a later save edits the live text.
        published_at = COALESCE(voice_feedback.published_at, EXCLUDED.published_at)
  RETURNING published_at INTO v_published;

  RETURN jsonb_build_object('ok', true, 'published_at', v_published);
END;
$$;

REVOKE ALL ON FUNCTION save_voice_feedback(UUID, JSONB, BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION save_voice_feedback(UUID, JSONB, BOOLEAN) TO authenticated;


-- ── 6. Purge (service_role only) ────────────────────────────────────────
-- p_now exists for the protocol; the route passes nothing.
CREATE OR REPLACE FUNCTION voice_purge_due(p_now TIMESTAMPTZ DEFAULT now())
RETURNS TABLE (object_name TEXT, reason TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.object_name, d.reason
  FROM voice_object_deletions d
  UNION
  SELECT s.object_name, 'retention'
  FROM voice_submissions s
  JOIN run_enrolments e ON e.id = s.enrolment_id
  JOIN course_runs r    ON r.id = e.run_id
  WHERE s.object_name IS NOT NULL
    AND r.ends_at + INTERVAL '6 months' <= p_now
  UNION
  SELECT o.name, 'orphan'
  FROM storage.objects o
  WHERE o.bucket_id = 'voice-recordings'
    AND o.created_at <= p_now - INTERVAL '24 hours'
    AND NOT EXISTS (SELECT 1 FROM voice_submissions s WHERE s.object_name = o.name)
    AND NOT EXISTS (SELECT 1 FROM voice_object_deletions d WHERE d.object_name = o.name);
$$;

-- Called with the names the Storage API removed (or reported as already
-- gone). A take purged for retention keeps its row, with object_name NULL
-- and purged_at set; queued names leave the queue.
CREATE OR REPLACE FUNCTION voice_mark_removed(p_names TEXT[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_marked INTEGER;
BEGIN
  UPDATE voice_submissions
     SET object_name = NULL,
         purged_at   = now()
   WHERE object_name = ANY(p_names);
  GET DIAGNOSTICS v_marked = ROW_COUNT;

  DELETE FROM voice_object_deletions WHERE object_name = ANY(p_names);
  RETURN v_marked;
END;
$$;

REVOKE ALL ON FUNCTION voice_purge_due(TIMESTAMPTZ) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION voice_mark_removed(TEXT[])   FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION voice_purge_due(TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION voice_mark_removed(TEXT[])   TO service_role;


-- ── 8. delete_my_account (re-emitted from 059) ──────────────────────────
-- Re-emitted from 059 verbatim, plus: every object under the caller's
-- {user} segment in voice-recordings is queued and returned as
-- `voice_objects` (the account-delete route removes them through the
-- Storage API, as it does for avatars), and the caller's feedback and
-- submissions are deleted (privacy-policy.md §9).
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

  DELETE FROM notifications            WHERE user_id = v_me;
  DELETE FROM notification_preferences WHERE user_id = v_me;
  DELETE FROM quiz_sessions            WHERE user_id = v_me;
  DELETE FROM lesson_attempts          WHERE user_id = v_me;
  DELETE FROM signup_acquisitions      WHERE user_id = v_me;
  DELETE FROM lesson_opens             WHERE user_id = v_me;
  DELETE FROM run_invites              WHERE claimed_by = v_me;
  DELETE FROM run_enrolments           WHERE user_id = v_me;
  DELETE FROM course_entitlements      WHERE user_id = v_me;

  UPDATE profiles
     SET full_name           = NULL,
         city                = NULL,
         display_name        = 'Deleted user',
         avatar_url          = NULL,
         leaderboard_opt_out = TRUE,
         deleted_at          = now()
   WHERE id = v_me;

  RETURN jsonb_build_object('ok', true, 'voice_objects', to_jsonb(v_voice));
END;
$$;

REVOKE ALL ON FUNCTION delete_my_account() FROM public, anon;
GRANT EXECUTE ON FUNCTION delete_my_account() TO authenticated;

COMMIT;
