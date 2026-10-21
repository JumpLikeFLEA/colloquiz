-- ============================================================
-- 094_voice_self_paced.sql
--
-- VOICE-010 (#232). A signed-in learner who can open a lesson sends a voice take
-- on a course they are NOT enrolled in (self-paced, free or granted). Until now
-- only a cohort enrolee could (060, docs/decisions/0110 Decision 2), and the
-- Storage INSERT policy needed an entitlement, so a free-course learner could not
-- upload at all. docs/decisions/0156 Decisions 2, 3, 7 and 9 open it; choices made
-- while writing this file are in docs/decisions/0183.
--
-- The card says "Migration 084". 084 through 093 were taken by later cards while
-- this one waited; the next free number was re-derived from the directory.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time and again
-- before commit:
--   latest migration before this one        -> 093_telegram_feedback_pings.sql
--   latest body of the account-delete RPC   -> 090_telegram_reminders.sql, NOT re-emitted:
--     it deletes the caller's voice_submissions by user_id (voice_feedback cascades) and
--     queues every object under the caller's {user} segment, so a row with no enrolment
--     is covered (checked in supabase/verify/094).
-- Re-emitted bodies, each from its latest definition (060; no later file defines them,
-- checked with grep over supabase/migrations):
--   submit_voice_recording   060
--   save_voice_feedback      060
--   voice_purge_due          060
-- The Storage INSERT policy "voice_recordings: owner insert" is re-created from 060.
--
-- ── 1. The slot ─────────────────────────────────────────────────────────
-- voice_submissions.enrolment_id becomes nullable. NULL means "a take made outside
-- any enrolment" (a self-paced take). The existing UNIQUE (enrolment_id, lesson_id,
-- block_id) never matches two NULLs, so a partial unique index on (user_id,
-- lesson_id, block_id) WHERE enrolment_id IS NULL holds the same one-current-take
-- rule for that slot. No existing row changes; nothing is dropped.
--
-- ── 2. submit_voice_recording ───────────────────────────────────────────
-- Body unchanged except at the point where "no enrolment opens the lesson" used to
-- end in not_enrolled:
--   * the caller has a non-revoked enrolment in this course (any run) -> unchanged:
--     the slot is the enrolment's, or not_enrolled when none opens the lesson. A
--     cohort learner's take always reaches the author, never a self-paced slot (this is
--     NARROWER than the card's "when no enrolment opens the lesson": a comped cohort
--     learner in a week that has not opened would otherwise file a take nobody reviews);
--   * the caller has none -> a self-paced slot, provided the course is published.
--     The lesson being 'open' for the caller is already checked above, by
--     _lesson_access_at, for anyone / signed_in / entitled lessons alike.
-- The answer gains `slot`: 'enrolment' or 'self_paced'.
--
-- ── 3. save_voice_feedback ──────────────────────────────────────────────
-- A self-paced take is refused with 'self_paced_take' (after the editor check, so a
-- non-editor still cannot tell it exists). No human writes feedback on it: an AI
-- analysis replaces that (VOICE-011 onwards, 0156 Decision 1).
--
-- ── 4. voice_purge_due ──────────────────────────────────────────────────
-- A self-paced take is due 6 months after submitted_at (0156 Decision 7). The cohort
-- branch (run end + 6 months) is unchanged.
--
-- ── 5. Storage INSERT policy ────────────────────────────────────────────
-- Adds can_send_self_paced_voice(course): the course is published and has a lesson with
-- a voice task, still published, that the caller may open. _lesson_access_at has no
-- grants (058), so a policy, which runs as the caller, cannot call it; this thin
-- SECURITY DEFINER function takes no user argument (the caller is always auth.uid()).
-- The first branch (has_course_entitlement) is 060's, so an enrolee or grantee of a
-- draft course keeps the right they had. The policy is a courtesy to the bucket; the
-- RPC above is the decision. It is NOT conditioned on VOICE_ANALYSIS_MODE: an
-- environment variable is not visible to SQL, so once this is applied a hand-made
-- client can upload whatever the flag says (the card's note; why this stays off hosted
-- until OPS-026 is published).
--
-- Written, not applied to hosted. Safe to re-apply: DROP NOT NULL, CREATE UNIQUE INDEX
-- IF NOT EXISTS, CREATE OR REPLACE, DROP POLICY IF EXISTS before CREATE.
-- ============================================================

BEGIN;

-- ── 1. The slot ─────────────────────────────────────────────────────────
ALTER TABLE voice_submissions ALTER COLUMN enrolment_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS voice_submissions_one_self_paced_per_slot
  ON voice_submissions (user_id, lesson_id, block_id)
  WHERE enrolment_id IS NULL;


-- ── 5a. can_send_self_paced_voice ───────────────────────────────────────
CREATE OR REPLACE FUNCTION can_send_self_paced_voice(p_course_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1
    FROM courses c
    JOIN lessons l         ON l.course_id = c.id
    JOIN lesson_versions v ON v.id = l.published_version_id
    WHERE c.id = p_course_id
      AND c.status = 'published'
      AND l.archived_at IS NULL
      AND jsonb_typeof(v.document) = 'array'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(v.document) b
        WHERE b->>'kind' = 'task' AND b->>'type' = 'voice'
      )
      AND (SELECT a.state FROM _lesson_access_at(l.id, (SELECT auth.uid()), now()) a) = 'open'
  ), FALSE);
$$;

REVOKE ALL ON FUNCTION can_send_self_paced_voice(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION can_send_self_paced_voice(UUID) TO authenticated;


-- ── 5b. Storage INSERT policy (re-created from 060) ─────────────────────
DROP POLICY IF EXISTS "voice_recordings: owner insert" ON storage.objects;
CREATE POLICY "voice_recordings: owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    CASE WHEN bucket_id = 'voice-recordings' THEN
      (storage.foldername(name))[2] = (SELECT auth.uid())::text
      AND (
        has_course_entitlement((storage.foldername(name))[1]::uuid)
        OR can_send_self_paced_voice((storage.foldername(name))[1]::uuid)
      )
    ELSE FALSE END
  );


-- ── 2. submit_voice_recording (re-emitted from 060) ─────────────────────
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
    -- VOICE-010: a caller with an enrolment in this course (not revoked, any run)
    -- keeps 060's rule: the take is the enrolment's or it is refused. Only a
    -- caller with none files a self-paced take, and only on a published course.
    IF EXISTS (
         SELECT 1 FROM run_enrolments e
         JOIN course_runs r ON r.id = e.run_id
         WHERE e.user_id = v_me AND e.revoked_at IS NULL AND r.course_id = v_lesson.course_id
       )
       OR NOT EXISTS (SELECT 1 FROM courses c WHERE c.id = v_lesson.course_id AND c.status = 'published')
    THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_enrolled');
    END IF;
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

  -- Serialise re-sends of one slot. The enrolment's slot is (enrolment, lesson,
  -- block); the self-paced slot is (user, lesson, block) with no enrolment, so the
  -- user is part of the match and NULL matches NULL.
  SELECT * INTO v_prev FROM voice_submissions
  WHERE user_id = v_me
    AND enrolment_id IS NOT DISTINCT FROM v_enrolment
    AND lesson_id = p_lesson_id
    AND block_id = p_block_id
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
    'slot', CASE WHEN v_enrolment IS NULL THEN 'self_paced' ELSE 'enrolment' END,
    'replaced_object', CASE WHEN v_prev.id IS NOT NULL THEN v_prev.object_name END
  );
END;
$$;

REVOKE ALL ON FUNCTION submit_voice_recording(UUID, UUID, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION submit_voice_recording(UUID, UUID, TEXT, TEXT) TO authenticated;


-- ── 3. save_voice_feedback (re-emitted from 060) ────────────────────────
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
  v_enrolment UUID;
  v_published TIMESTAMPTZ;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT course_id, enrolment_id INTO v_course, v_enrolment
  FROM voice_submissions WHERE id = p_submission_id;
  -- Not found and not an editor read the same, so a non-editor cannot probe
  -- which submission ids exist.
  IF v_course IS NULL OR NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- VOICE-010: a self-paced take has no written feedback, only the AI analysis.
  IF v_enrolment IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_paced_take');
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


-- ── 4. voice_purge_due (re-emitted from 060) ────────────────────────────
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
  -- VOICE-010 (0156 Decision 7): a self-paced take, 6 months after it was sent.
  SELECT s.object_name, 'retention'
  FROM voice_submissions s
  WHERE s.object_name IS NOT NULL
    AND s.enrolment_id IS NULL
    AND s.submitted_at + INTERVAL '6 months' <= p_now
  UNION
  SELECT o.name, 'orphan'
  FROM storage.objects o
  WHERE o.bucket_id = 'voice-recordings'
    AND o.created_at <= p_now - INTERVAL '24 hours'
    AND NOT EXISTS (SELECT 1 FROM voice_submissions s WHERE s.object_name = o.name)
    AND NOT EXISTS (SELECT 1 FROM voice_object_deletions d WHERE d.object_name = o.name);
$$;

REVOKE ALL ON FUNCTION voice_purge_due(TIMESTAMPTZ) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION voice_purge_due(TIMESTAMPTZ) TO service_role;

COMMIT;
