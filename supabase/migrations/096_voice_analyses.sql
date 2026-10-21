-- ============================================================
-- 096_voice_analyses.sql
--
-- VOICE-011 (#233). The tables behind the AI voice analysis (docs/decisions/0156
-- Decisions 1, 6, 7, 9) and the caps that bound it. Choices made while writing this
-- file are in docs/decisions/0185.
--
-- The card says "Migration 085". 085 through 095 were taken while it waited; the next
-- free number was re-derived from the directory (VOICE-010's 0183 Decision 1 said the
-- same of its own number).
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time and again
-- before commit:
--   latest migration before this one        -> 095_terms_1_3.sql
--   latest body of the account-delete RPC   -> 090_telegram_reminders.sql (the card says
--     082; 083..089 and 091..095 do not define it, checked with grep). Re-emitted below
--     verbatim from 090 with ONE added DELETE (voice_analysis_sends).
-- Re-emitted bodies, each from its latest definition:
--   submit_voice_recording   094
--   delete_my_account        090
--
-- ── 1. voice_analysis_sends: the ledger ─────────────────────────────────
-- One row per accepted send. It has NO foreign key to the take: a replace deletes the
-- take row (060), and the count must outlive it. Nothing reads it from a user session
-- (no grant, no policy); the trigger and the functions below are the only readers.
--   slot       'enrolment' | 'self_paced', as submit_voice_recording decided.
--   analysed   set by the trigger, never by the caller: does this send get an analysis.
--   counted    the send still counts against the caps. FALSE when the analysis was
--              hidden by an editor, or failed on our side ('paused' is reserved for
--              VOICE-012's paused mode; nothing writes it yet).
-- A task is (user, lesson, block); the caps below are per task or per user.
--
-- ── 2. The caps (0156 Decision 6), in a BEFORE INSERT trigger ───────────────
-- Same shape as 026/038: SECURITY DEFINER, so it sees every row whatever the caller's
-- RLS, and PT429 so PostgREST answers 429. Both caps count rows with
-- (analysed AND counted), so a hidden or failed analysis gives its send back.
--   * Per task, 3 analysed sends. A 4th SELF-PACED send is refused (PT429, DETAIL
--     'task_cap'). A 4th COHORT send is accepted and gets analysed = FALSE: cohort
--     re-sends stay unlimited (0156 Decision 6).
--   * Per learner, 10 analyses in a rolling 24 h. A self-paced send over it is refused
--     (PT429, DETAIL 'daily_cap', HINT = the time the oldest of the ten leaves the
--     window, ISO 8601 UTC). A cohort send over it is accepted with analysed = FALSE:
--     an AI cap never blocks a take the partner reads (docs/decisions/0185 Decision 1).
-- A per-user advisory lock serialises concurrent sends, so two requests cannot both
-- read "2 of 3".
--
-- ── 3. voice_analyses: one row per take ─────────────────────────────────
-- PK = the take; ON DELETE CASCADE from voice_submissions, so a replace removes the
-- analysis with its take. Created by submit_voice_recording (status 'pending') only
-- when the trigger said analysed. send_id ties it to its ledger row, so a hide or a
-- failure can give the send back. RLS: the owner reads their own NON-HIDDEN rows; an
-- editor reads rows on courses they edit (hidden ones too). No app role writes. SELECT
-- is column-level: usage, lease_until, failure, hidden_by, baseline_submission_id and
-- send_id are not granted (a select of * from a user session fails by design).
--
-- ── 4. Functions ────────────────────────────────────────────────────────
--   hide_voice_analysis(submission)   authenticated; can_edit_course AND
--                                     _studio_can_write (083). Only a 'done' analysis.
--   voice_analysis_finish(...)        service_role; UPDATE only, so a late result for a
--                                     take that was replaced (its row cascaded away)
--                                     matches nothing and writes nothing.
--   voice_analysis_fail(submission, failure)   service_role; the send is given back.
-- The lease claim and re-claim, the pipeline and the status route are VOICE-012's.
--
-- ── 5. submit_voice_recording ───────────────────────────────────────────
-- 094's body, plus: inside the existing subtransaction, FIRST the ledger insert (the
-- trigger may refuse here, before the previous take is touched; a refusal leaves
-- nothing changed), then after the take is inserted the analysis row when analysed.
-- The answer gains `analysed`. A duplicate_submission rolls the ledger row back with
-- the subtransaction, so a duplicate consumes nothing.
--
-- ── 6. delete_my_account ────────────────────────────────────────────────
-- The ledger is keyed by user and the profile row stays (anonymised), so its FK cascade
-- never fires: one DELETE is added. Analyses go with the takes (cascade).
--
-- Written, not applied to hosted. Safe to re-apply: CREATE TABLE / INDEX IF NOT EXISTS,
-- CREATE OR REPLACE, DROP POLICY / TRIGGER IF EXISTS before CREATE.
-- ============================================================

BEGIN;

-- ── 1. Ledger ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_analysis_sends (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lesson_id        UUID        NOT NULL REFERENCES lessons(id)  ON DELETE CASCADE,
  block_id         TEXT        NOT NULL,
  submission_id    UUID        NOT NULL,
  slot             TEXT        NOT NULL CHECK (slot IN ('enrolment', 'self_paced')),
  analysed         BOOLEAN     NOT NULL DEFAULT TRUE,
  counted          BOOLEAN     NOT NULL DEFAULT TRUE,
  uncounted_reason TEXT        CHECK (uncounted_reason IN ('hidden', 'failed', 'paused')),
  uncounted_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT voice_analysis_sends_counted_reason CHECK (counted = (uncounted_reason IS NULL))
);

CREATE INDEX IF NOT EXISTS voice_analysis_sends_task_idx
  ON voice_analysis_sends (user_id, lesson_id, block_id) WHERE analysed AND counted;
CREATE INDEX IF NOT EXISTS voice_analysis_sends_day_idx
  ON voice_analysis_sends (user_id, created_at) WHERE analysed AND counted;

ALTER TABLE voice_analysis_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE voice_analysis_sends FROM PUBLIC, anon, authenticated;


-- ── 2. Caps ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION voice_analysis_task_limit()
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 3 $$;
REVOKE ALL ON FUNCTION voice_analysis_task_limit() FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION voice_analysis_daily_limit()
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 10 $$;
REVOKE ALL ON FUNCTION voice_analysis_daily_limit() FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION voice_analysis_enforce_caps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task   INTEGER;
  v_day    INTEGER;
  v_oldest TIMESTAMPTZ;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('voice_analysis_sends:' || NEW.user_id::text, 0));

  SELECT count(*) INTO v_task
  FROM voice_analysis_sends
  WHERE user_id = NEW.user_id AND lesson_id = NEW.lesson_id AND block_id = NEW.block_id
    AND analysed AND counted;

  IF v_task >= voice_analysis_task_limit() THEN
    IF NEW.slot = 'self_paced' THEN
      RAISE EXCEPTION 'voice analysis cap reached for this task (% sends)', voice_analysis_task_limit()
        USING ERRCODE = 'PT429', DETAIL = 'task_cap';
    END IF;
    NEW.analysed := FALSE;
    RETURN NEW;
  END IF;

  -- The ten newest counted analyses in the window; the oldest of them is the one
  -- whose leaving frees a place.
  SELECT count(*), min(created_at) INTO v_day, v_oldest
  FROM (
    SELECT created_at
    FROM voice_analysis_sends
    WHERE user_id = NEW.user_id AND analysed AND counted
      AND created_at > now() - INTERVAL '24 hours'
    ORDER BY created_at DESC
    LIMIT voice_analysis_daily_limit()
  ) w;

  IF v_day >= voice_analysis_daily_limit() THEN
    IF NEW.slot = 'self_paced' THEN
      RAISE EXCEPTION 'voice analysis daily cap reached (% in 24 hours)', voice_analysis_daily_limit()
        USING ERRCODE = 'PT429', DETAIL = 'daily_cap',
              HINT = to_char((v_oldest + INTERVAL '24 hours') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
    END IF;
    NEW.analysed := FALSE;
    RETURN NEW;
  END IF;

  NEW.analysed := TRUE;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION voice_analysis_enforce_caps() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS voice_analysis_caps ON voice_analysis_sends;
CREATE TRIGGER voice_analysis_caps
  BEFORE INSERT ON voice_analysis_sends
  FOR EACH ROW
  EXECUTE FUNCTION voice_analysis_enforce_caps();


-- ── 3. Analyses ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_analyses (
  submission_id        UUID        PRIMARY KEY REFERENCES voice_submissions(id) ON DELETE CASCADE,
  send_id              UUID        NOT NULL UNIQUE REFERENCES voice_analysis_sends(id) ON DELETE CASCADE,
  status               TEXT        NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'transcribing', 'analysing', 'done', 'failed')),
  transcript           TEXT,
  result               JSONB,
  instruction          TEXT        CHECK (instruction IN ('first', 'final')),
  prompt_version       TEXT,
  model                TEXT,
  usage                JSONB,
  -- The take whose analysis this one is compared with (a "final" task against its
  -- "before" take). Set by the pipeline; the take can go, the analysis stays.
  baseline_submission_id UUID      REFERENCES voice_submissions(id) ON DELETE SET NULL,
  lease_until          TIMESTAMPTZ,
  failure              TEXT,
  hidden_at            TIMESTAMPTZ,
  hidden_by            UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at          TIMESTAMPTZ
);

ALTER TABLE voice_analyses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE voice_analyses FROM PUBLIC, anon, authenticated;
GRANT SELECT (submission_id, status, transcript, result, instruction, prompt_version, model,
              hidden_at, created_at, updated_at, finished_at)
  ON voice_analyses TO authenticated;

-- The subqueries run as the caller, under voice_submissions' own read policy;
-- authenticated holds SELECT on it, so this is not the 044 / 0105 "permission denied
-- inside a policy" trap (060 used the same shape for voice_feedback).
DROP POLICY IF EXISTS "voice_analyses: owner reads shown" ON voice_analyses;
CREATE POLICY "voice_analyses: owner reads shown"
  ON voice_analyses FOR SELECT
  USING (
    hidden_at IS NULL
    AND EXISTS (
      SELECT 1 FROM voice_submissions s
      WHERE s.id = voice_analyses.submission_id
        AND s.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "voice_analyses: editor read" ON voice_analyses;
CREATE POLICY "voice_analyses: editor read"
  ON voice_analyses FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM voice_submissions s
    WHERE s.id = voice_analyses.submission_id
      AND can_edit_course(s.course_id, (SELECT auth.uid()))
  ));


-- ── 4a. hide_voice_analysis ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hide_voice_analysis(p_submission_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_course UUID;
  v_a      voice_analyses%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  -- Not found and not an editor read the same, so a non-editor cannot probe which
  -- submission ids have an analysis.
  SELECT s.course_id INTO v_course
  FROM voice_submissions s
  JOIN voice_analyses a ON a.submission_id = s.id
  WHERE s.id = p_submission_id;
  IF v_course IS NULL OR NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008 (083): a lapsed seat reads but does not write. After the editor check.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;

  SELECT * INTO v_a FROM voice_analyses WHERE submission_id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF v_a.hidden_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_hidden', true);
  END IF;
  IF v_a.status <> 'done' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_done');
  END IF;

  UPDATE voice_analyses
     SET hidden_at = now(), hidden_by = v_me, updated_at = now()
   WHERE submission_id = p_submission_id;
  UPDATE voice_analysis_sends
     SET counted = FALSE, uncounted_reason = 'hidden', uncounted_at = now()
   WHERE id = v_a.send_id AND counted;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION hide_voice_analysis(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION hide_voice_analysis(UUID) TO authenticated;


-- ── 4b. voice_analysis_finish (service role) ────────────────────────────
-- UPDATE only. When the take was replaced or purged its analysis row is gone, the
-- WHERE matches nothing and FALSE comes back: a late result writes nothing.
CREATE OR REPLACE FUNCTION voice_analysis_finish(
  p_submission_id  UUID,
  p_transcript     TEXT,
  p_result         JSONB,
  p_instruction    TEXT,
  p_prompt_version TEXT,
  p_model          TEXT,
  p_usage          JSONB,
  p_baseline       UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE voice_analyses
     SET status                 = 'done',
         transcript             = p_transcript,
         result                 = p_result,
         instruction            = p_instruction,
         prompt_version         = p_prompt_version,
         model                  = p_model,
         usage                  = p_usage,
         baseline_submission_id = (SELECT s.id FROM voice_submissions s WHERE s.id = p_baseline),
         lease_until            = NULL,
         failure                = NULL,
         updated_at             = now(),
         finished_at            = now()
   WHERE submission_id = p_submission_id
     AND status IN ('pending', 'transcribing', 'analysing');
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION voice_analysis_finish(UUID, TEXT, JSONB, TEXT, TEXT, TEXT, JSONB, UUID)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION voice_analysis_finish(UUID, TEXT, JSONB, TEXT, TEXT, TEXT, JSONB, UUID)
  TO service_role;


-- ── 4c. voice_analysis_fail (service role) ──────────────────────────────
-- Failed on our side: the analysis is marked failed and its send is given back.
CREATE OR REPLACE FUNCTION voice_analysis_fail(p_submission_id UUID, p_failure TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_send UUID;
BEGIN
  UPDATE voice_analyses
     SET status = 'failed', failure = left(p_failure, 200), lease_until = NULL,
         updated_at = now(), finished_at = now()
   WHERE submission_id = p_submission_id
     AND status IN ('pending', 'transcribing', 'analysing')
  RETURNING send_id INTO v_send;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  UPDATE voice_analysis_sends
     SET counted = FALSE, uncounted_reason = 'failed', uncounted_at = now()
   WHERE id = v_send AND counted;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION voice_analysis_fail(UUID, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION voice_analysis_fail(UUID, TEXT) TO service_role;


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
  v_send      UUID;
  v_analysed  BOOLEAN;
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
    -- VOICE-011: the ledger row FIRST. The caps trigger may refuse here (PT429), before
    -- the previous take is touched; the error leaves the function and rolls back whatever
    -- it did. It decides analysed; a cohort send over a cap is accepted with analysed FALSE.
    INSERT INTO voice_analysis_sends (user_id, lesson_id, block_id, submission_id, slot)
    VALUES (v_me, p_lesson_id, p_block_id, p_submission_id,
            CASE WHEN v_enrolment IS NULL THEN 'self_paced' ELSE 'enrolment' END)
    RETURNING id, analysed INTO v_send, v_analysed;

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

    IF v_analysed THEN
      INSERT INTO voice_analyses (submission_id, send_id) VALUES (p_submission_id, v_send);
    END IF;

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
    'analysed', v_analysed,
    'replaced_object', CASE WHEN v_prev.id IS NOT NULL THEN v_prev.object_name END
  );
END;
$$;

REVOKE ALL ON FUNCTION submit_voice_recording(UUID, UUID, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION submit_voice_recording(UUID, UUID, TEXT, TEXT) TO authenticated;


-- ── 6. delete_my_account, re-emitted from 090 with one added DELETE ─────
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
  -- VOICE-011: the send ledger. The profile row stays, so its ON DELETE CASCADE never fires;
  -- analyses went with the takes above.
  DELETE FROM voice_analysis_sends     WHERE user_id = v_me;
  DELETE FROM run_final_comments       WHERE user_id = v_me;

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

  RETURN jsonb_build_object('ok', true, 'voice_objects', to_jsonb(v_voice));
END;
$$;

REVOKE ALL ON FUNCTION delete_my_account() FROM public, anon;
GRANT EXECUTE ON FUNCTION delete_my_account() TO authenticated;

COMMIT;
