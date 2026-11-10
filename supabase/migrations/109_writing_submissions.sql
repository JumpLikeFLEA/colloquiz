-- ============================================================
-- 109_writing_submissions.sql
--
-- WRITE-002 (docs/decisions/0225 Decisions 1, 2, 7, 8, 9, 10): sending a
-- written answer. A writing task (WRITE-001) with sendToTeacher true sends the
-- learner's answer to the course's authors (a cohort enrolee) or to a linked
-- teacher (a student whose teacher edits the course or assigned the lesson);
-- everyone else practises, and nothing reaches the server. The learner may
-- edit and resend until the teacher publishes feedback, then the answer locks.
--
-- Requires 058 (_lesson_access_at, course_runs, run_enrolments), 060
-- (_feedback_content_valid), 068 (course_delete_blockers), 073
-- (learner_contact_label), 076 (_teacher_linked), 080
-- (_teacher_readable_lessons), 083 (_ask_teacher_allowed) and 103 (the latest
-- delete_my_account). Written, not applied to hosted: the hosted-apply gate
-- and WRITE-004's privacy revision come first (0225 Decision 14).
--
-- Safe to re-apply: CREATE TABLE / INDEX IF NOT EXISTS, DROP POLICY IF EXISTS
-- + CREATE POLICY, CREATE OR REPLACE FUNCTION.
--
-- 1. writing_submissions, writing_feedback: RLS on, REVOKE ALL, SELECT for
--    authenticated. The owner reads their own answers and only PUBLISHED
--    feedback on them. Teachers have no table policy: they read through
--    writing_review_queue (a definer RPC) only.
-- 2. _writing_route(user, lesson): the ONE function that decides where an
--    answer goes. The page's read and the submit RPC both call it.
-- 3. _writing_can_review(reviewer, submission): the ONE predicate that
--    decides who reads and answers a sent answer, at read time. No
--    seat-freeze clause (0155 Decision 5).
-- 4. writing_task_state, submit_writing_answer, save_writing_feedback,
--    writing_review_queue.
-- 5. course_delete_blockers gains 'written_answers' (re-emitted from 068).
-- 6. delete_my_account re-emitted from 103: deletes both tables.
-- ============================================================

BEGIN;

-- ── 1. Tables ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS writing_submissions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL on the linked route (a student with no enrolment that opens the lesson).
  enrolment_id      UUID        REFERENCES run_enrolments(id)  ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES profiles(id)        ON DELETE CASCADE,
  course_id         UUID        NOT NULL REFERENCES courses(id)         ON DELETE CASCADE,
  lesson_id         UUID        NOT NULL REFERENCES lessons(id)         ON DELETE CASCADE,
  block_id          TEXT        NOT NULL,
  lesson_version_id UUID        NOT NULL REFERENCES lesson_versions(id) ON DELETE CASCADE,
  body              TEXT        NOT NULL,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT writing_submissions_body_len   CHECK (char_length(body) <= 4000),
  CONSTRAINT writing_submissions_body_text  CHECK (body ~ '\S')
);
CREATE UNIQUE INDEX IF NOT EXISTS writing_submissions_one_per_enrolment_slot
  ON writing_submissions (enrolment_id, lesson_id, block_id) WHERE enrolment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS writing_submissions_one_linked_slot
  ON writing_submissions (user_id, lesson_id, block_id) WHERE enrolment_id IS NULL;
CREATE INDEX IF NOT EXISTS writing_submissions_user_idx   ON writing_submissions (user_id);
CREATE INDEX IF NOT EXISTS writing_submissions_course_idx ON writing_submissions (course_id, updated_at);

CREATE TABLE IF NOT EXISTS writing_feedback (
  submission_id UUID        PRIMARY KEY REFERENCES writing_submissions(id) ON DELETE CASCADE,
  body          JSONB       NOT NULL,
  updated_by    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at  TIMESTAMPTZ,
  CONSTRAINT writing_feedback_body_valid CHECK (_feedback_content_valid(body))
);

ALTER TABLE writing_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE writing_feedback    ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE writing_submissions FROM anon, authenticated;
REVOKE ALL ON TABLE writing_feedback    FROM anon, authenticated;
GRANT SELECT ON TABLE writing_submissions TO authenticated;
GRANT SELECT ON TABLE writing_feedback    TO authenticated;

DROP POLICY IF EXISTS "writing_submissions: owner read" ON writing_submissions;
CREATE POLICY "writing_submissions: owner read"
  ON writing_submissions FOR SELECT
  USING (user_id = (SELECT auth.uid()));

-- The subquery runs as the caller under writing_submissions' own policy above;
-- authenticated holds SELECT on it (the 044 / 0105 trap does not apply).
DROP POLICY IF EXISTS "writing_feedback: owner reads published" ON writing_feedback;
CREATE POLICY "writing_feedback: owner reads published"
  ON writing_feedback FOR SELECT
  USING (
    published_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM writing_submissions s
      WHERE s.id = writing_feedback.submission_id
        AND s.user_id = (SELECT auth.uid())
    )
  );


-- ── 2. _writing_route ───────────────────────────────────────────────────
-- One row: route is
--   'cohort'   the lesson is open and an enrolment opens it (enrolment_id set);
--              cohort beats linked when both apply (0225 Decision 7);
--   'linked'   no enrolment in the course, and a live link to a teacher for
--              whom _ask_teacher_allowed holds (the seat-freeze clause is part
--              of it: a frozen teacher with no thread is not offered);
--   'not_open' the lesson is not open for the caller;
--   'none'     no route: not signed in, an enrolee whose enrolment does not
--              open the lesson (094's rule: an enrolee's answer never falls
--              through to the linked route), or neither enrolled nor linked.
-- A revoked enrolment is not an enrolment.
CREATE OR REPLACE FUNCTION _writing_route(p_user UUID, p_lesson UUID)
RETURNS TABLE (route TEXT, enrolment_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lesson lessons%ROWTYPE;
  v_state  TEXT;
  v_enr    UUID;
BEGIN
  IF p_user IS NULL THEN
    RETURN QUERY SELECT 'none'::TEXT, NULL::UUID; RETURN;
  END IF;
  SELECT * INTO v_lesson FROM lessons WHERE id = p_lesson;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'none'::TEXT, NULL::UUID; RETURN;
  END IF;

  SELECT a.state INTO v_state FROM _lesson_access_at(p_lesson, p_user, now()) a;
  IF v_state IS DISTINCT FROM 'open' THEN
    RETURN QUERY SELECT 'not_open'::TEXT, NULL::UUID; RETURN;
  END IF;

  -- The enrolment the lesson is open through right now (096's query): latest
  -- run first.
  SELECT e.id INTO v_enr
  FROM run_enrolments e
  JOIN course_runs r ON r.id = e.run_id
  WHERE e.user_id = p_user
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
  IF v_enr IS NOT NULL THEN
    RETURN QUERY SELECT 'cohort'::TEXT, v_enr; RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM run_enrolments e JOIN course_runs r ON r.id = e.run_id
    WHERE e.user_id = p_user AND e.revoked_at IS NULL AND r.course_id = v_lesson.course_id
  ) THEN
    RETURN QUERY SELECT 'none'::TEXT, NULL::UUID; RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM teacher_student_links k
    WHERE k.student_id = p_user AND k.ended_at IS NULL
      AND _ask_teacher_allowed(k.teacher_id, p_user, p_lesson)
  ) THEN
    RETURN QUERY SELECT 'linked'::TEXT, NULL::UUID; RETURN;
  END IF;

  RETURN QUERY SELECT 'none'::TEXT, NULL::UUID;
END;
$$;

REVOKE ALL ON FUNCTION _writing_route(UUID, UUID) FROM PUBLIC, anon, authenticated;


-- ── 3. _writing_can_review ──────────────────────────────────────────────
-- Evaluated at read time. Cohort answer: can_edit_course. Linked answer: the
-- lesson is among _teacher_readable_lessons for the (still linked) student, so
-- an ended link or a deleted assignment removes access at once. Deliberately
-- no _studio_can_write clause: a lapsed seat keeps answering what was sent to it.
CREATE OR REPLACE FUNCTION _writing_can_review(p_reviewer UUID, p_submission UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN p_reviewer IS NULL THEN FALSE
      WHEN s.enrolment_id IS NOT NULL THEN can_edit_course(s.course_id, p_reviewer)
      ELSE EXISTS (
        SELECT 1 FROM _teacher_readable_lessons(p_reviewer, s.user_id) r
        WHERE r.lesson_id = s.lesson_id
      )
    END
    FROM writing_submissions s
    WHERE s.id = p_submission
  ), FALSE);
$$;

REVOKE ALL ON FUNCTION _writing_can_review(UUID, UUID) FROM PUBLIC, anon, authenticated;


-- ── 4a. writing_task_state ──────────────────────────────────────────────
-- The lesson page's read. route is 'cohort' | 'linked' | 'practice'; submission
-- and feedback are the caller's own (feedback only once published). The page
-- only ever offers what submit_writing_answer will accept, because both call
-- _writing_route. A block that is not a ticked writing task reads as practice.
CREATE OR REPLACE FUNCTION writing_task_state(p_lesson_id UUID, p_block_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_lesson lessons%ROWTYPE;
  v_block  JSONB;
  v_route  TEXT := 'practice';
  v_enr    UUID;
  v_sub    writing_submissions%ROWTYPE;
  v_fb     writing_feedback%ROWTYPE;
  v_has_fb BOOLEAN := FALSE;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  SELECT * INTO v_lesson FROM lessons WHERE id = p_lesson_id;
  IF NOT FOUND OR v_lesson.published_version_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT b INTO v_block
  FROM lesson_versions v, jsonb_array_elements(v.document) b
  WHERE v.id = v_lesson.published_version_id
    AND jsonb_typeof(v.document) = 'array'
    AND b->>'id' = p_block_id
  LIMIT 1;
  IF v_block IS NULL OR v_block->>'kind' IS DISTINCT FROM 'task' OR v_block->>'type' IS DISTINCT FROM 'writing' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_writing_block');
  END IF;

  IF v_block->'sendToTeacher' = 'true'::jsonb THEN
    SELECT r.route, r.enrolment_id INTO v_route, v_enr FROM _writing_route(v_me, p_lesson_id) r;
    IF v_route NOT IN ('cohort', 'linked') THEN v_route := 'practice'; END IF;
  END IF;

  -- The caller's answer in the slot the route would use; with no route, the
  -- latest answer they have for this block (so a locked answer still shows).
  SELECT * INTO v_sub FROM writing_submissions
  WHERE user_id = v_me AND lesson_id = p_lesson_id AND block_id = p_block_id
    AND (v_route = 'practice' OR enrolment_id IS NOT DISTINCT FROM v_enr)
  ORDER BY updated_at DESC
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_fb FROM writing_feedback WHERE submission_id = v_sub.id AND published_at IS NOT NULL;
    v_has_fb := FOUND;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'route', v_route,
    'locked', v_has_fb,
    'submission', CASE WHEN v_sub.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_sub.id, 'body', v_sub.body, 'submitted_at', v_sub.submitted_at, 'updated_at', v_sub.updated_at) END,
    'feedback', CASE WHEN v_has_fb THEN jsonb_build_object(
      'body', v_fb.body, 'published_at', v_fb.published_at) END
  );
END;
$$;

REVOKE ALL ON FUNCTION writing_task_state(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_task_state(UUID, TEXT) TO authenticated;


-- ── 4b. submit_writing_answer ───────────────────────────────────────────
-- Checks, in order: signed in; a published version whose block is a writing
-- task with sendToTeacher true; the body; the lesson open; a route. Then locks
-- the slot: locked when feedback is published, else update in place (same id,
-- a draft feedback stays attached) or insert. Returns JSONB so a later AI
-- check can add a field (0225 Decision 13).
CREATE OR REPLACE FUNCTION submit_writing_answer(p_lesson_id UUID, p_block_id TEXT, p_body TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := auth.uid();
  v_lesson lessons%ROWTYPE;
  v_block  JSONB;
  v_route  TEXT;
  v_enr    UUID;
  v_prev   writing_submissions%ROWTYPE;
  v_id     UUID;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT * INTO v_lesson FROM lessons WHERE id = p_lesson_id;
  IF NOT FOUND OR v_lesson.published_version_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT b INTO v_block
  FROM lesson_versions v, jsonb_array_elements(v.document) b
  WHERE v.id = v_lesson.published_version_id
    AND jsonb_typeof(v.document) = 'array'
    AND b->>'id' = p_block_id
  LIMIT 1;
  IF v_block IS NULL OR v_block->>'kind' IS DISTINCT FROM 'task' OR v_block->>'type' IS DISTINCT FROM 'writing' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_writing_block');
  END IF;
  IF v_block->'sendToTeacher' IS DISTINCT FROM 'true'::jsonb THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_sent_to_teacher');
  END IF;

  IF p_body IS NULL OR char_length(p_body) > 4000 OR p_body !~ '\S' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_body');
  END IF;

  SELECT r.route, r.enrolment_id INTO v_route, v_enr FROM _writing_route(v_me, p_lesson_id) r;
  IF v_route = 'not_open' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lesson_not_open');
  END IF;
  IF v_route NOT IN ('cohort', 'linked') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_route');
  END IF;

  -- Serialise sends of one slot (the first send has no row to lock).
  PERFORM pg_advisory_xact_lock(hashtextextended(v_me::text || ':' || p_lesson_id::text || ':' || p_block_id, 0));

  SELECT * INTO v_prev FROM writing_submissions
  WHERE user_id = v_me AND lesson_id = p_lesson_id AND block_id = p_block_id
    AND enrolment_id IS NOT DISTINCT FROM v_enr
  FOR UPDATE;

  IF FOUND THEN
    IF EXISTS (SELECT 1 FROM writing_feedback f WHERE f.submission_id = v_prev.id AND f.published_at IS NOT NULL) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'locked');
    END IF;
    UPDATE writing_submissions
       SET body = p_body, lesson_version_id = v_lesson.published_version_id, updated_at = now()
     WHERE id = v_prev.id;
    v_id := v_prev.id;
  ELSE
    INSERT INTO writing_submissions (enrolment_id, user_id, course_id, lesson_id, block_id, lesson_version_id, body)
    VALUES (v_enr, v_me, v_lesson.course_id, p_lesson_id, p_block_id, v_lesson.published_version_id, p_body)
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'submission_id', v_id, 'route', v_route, 'resent', v_prev.id IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION submit_writing_answer(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION submit_writing_answer(UUID, TEXT, TEXT) TO authenticated;


-- ── 4c. save_writing_feedback ───────────────────────────────────────────
-- save_voice_feedback's shape. A caller _writing_can_review rejects gets the
-- same 'forbidden' as an unknown id, so ids cannot be probed. Publishing is
-- one-way; a later save edits the live text.
CREATE OR REPLACE FUNCTION save_writing_feedback(
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
  v_published TIMESTAMPTZ;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF NOT _writing_can_review(v_me, p_submission_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT _feedback_content_valid(p_body) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_feedback');
  END IF;

  INSERT INTO writing_feedback (submission_id, body, updated_by, published_at)
  VALUES (p_submission_id, p_body, v_me, CASE WHEN p_publish THEN now() END)
  ON CONFLICT (submission_id) DO UPDATE
    SET body         = EXCLUDED.body,
        updated_by   = EXCLUDED.updated_by,
        updated_at   = now(),
        published_at = COALESCE(writing_feedback.published_at, EXCLUDED.published_at)
  RETURNING published_at INTO v_published;

  RETURN jsonb_build_object('ok', true, 'published_at', v_published);
END;
$$;

REVOKE ALL ON FUNCTION save_writing_feedback(UUID, JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION save_writing_feedback(UUID, JSONB, BOOLEAN) TO authenticated;


-- ── 4d. writing_review_queue ────────────────────────────────────────────
-- Every sent answer the caller may review (_writing_can_review), newest
-- activity last within its group: waiting first, then drafts, then answered.
-- The prompt is read from the version the answer was written against.
CREATE OR REPLACE FUNCTION writing_review_queue(
  p_course_id UUID DEFAULT NULL,
  p_status    TEXT DEFAULT NULL
)
RETURNS TABLE (
  submission_id         UUID,
  route                 TEXT,
  course_id             UUID,
  course_title          TEXT,
  run_id                UUID,
  run_title             TEXT,
  user_id               UUID,
  learner_label         TEXT,
  lesson_id             UUID,
  lesson_title          TEXT,
  lesson_ordinal        INTEGER,
  block_id              TEXT,
  block_prompt          JSONB,
  body                  TEXT,
  submitted_at          TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ,
  feedback_body         JSONB,
  feedback_updated_at   TIMESTAMPTZ,
  feedback_published_at TIMESTAMPTZ,
  status                TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH rows AS (
    SELECT
      s.id AS submission_id,
      CASE WHEN s.enrolment_id IS NULL THEN 'linked' ELSE 'cohort' END AS route,
      s.course_id, c.title AS course_title,
      r.id AS run_id, r.title AS run_title,
      s.user_id, learner_contact_label(s.user_id) AS learner_label,
      s.lesson_id, l.title AS lesson_title, l.ordinal AS lesson_ordinal,
      s.block_id,
      ob.block->'prompt' AS block_prompt,
      s.body, s.submitted_at, s.updated_at,
      f.body AS feedback_body, f.updated_at AS feedback_updated_at, f.published_at AS feedback_published_at,
      CASE
        WHEN f.submission_id IS NULL THEN 'waiting'
        WHEN f.published_at IS NULL THEN 'draft'
        ELSE 'answered'
      END AS status
    FROM writing_submissions s
    JOIN courses c ON c.id = s.course_id
    JOIN lessons l ON l.id = s.lesson_id
    LEFT JOIN run_enrolments e ON e.id = s.enrolment_id
    LEFT JOIN course_runs r ON r.id = e.run_id
    LEFT JOIN writing_feedback f ON f.submission_id = s.id
    LEFT JOIN LATERAL (
      SELECT b AS block
      FROM lesson_versions v
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(v.document) = 'array' THEN v.document ELSE '[]'::jsonb END
      ) b
      WHERE v.id = s.lesson_version_id AND b->>'id' = s.block_id
      LIMIT 1
    ) ob ON TRUE
    WHERE (p_course_id IS NULL OR s.course_id = p_course_id)
      AND _writing_can_review((SELECT auth.uid()), s.id)
  )
  SELECT submission_id, route, course_id, course_title, run_id, run_title, user_id, learner_label,
         lesson_id, lesson_title, lesson_ordinal, block_id, block_prompt, body, submitted_at, updated_at,
         feedback_body, feedback_updated_at, feedback_published_at, status
  FROM rows
  WHERE (p_status IS NULL OR status = p_status)
  ORDER BY (CASE status WHEN 'waiting' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END), updated_at, submission_id;
$$;

REVOKE ALL ON FUNCTION writing_review_queue(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION writing_review_queue(UUID, TEXT) TO authenticated;


-- ── 5. course_delete_blockers (re-emitted from 068) ─────────────────────
-- One added blocker, 'written_answers', after 'recordings'.
CREATE OR REPLACE FUNCTION course_delete_blockers(p_course_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       UUID := (SELECT auth.uid());
  v_status   TEXT;
  v_blockers TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT can_edit_course(p_course_id, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  SELECT status INTO v_status FROM courses WHERE id = p_course_id;
  IF v_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;

  IF v_status = 'published' THEN
    v_blockers := array_append(v_blockers, 'published');
  END IF;
  IF EXISTS (SELECT 1 FROM course_entitlements WHERE course_id = p_course_id) THEN
    v_blockers := array_append(v_blockers, 'entitlements');
  END IF;
  IF EXISTS (SELECT 1 FROM run_enrolments e JOIN course_runs r ON r.id = e.run_id
             WHERE r.course_id = p_course_id) THEN
    v_blockers := array_append(v_blockers, 'enrolments');
  END IF;
  IF EXISTS (SELECT 1 FROM run_invites i JOIN course_runs r ON r.id = i.run_id
             WHERE r.course_id = p_course_id) THEN
    v_blockers := array_append(v_blockers, 'invites');
  END IF;
  IF EXISTS (SELECT 1 FROM voice_submissions s
             WHERE s.course_id = p_course_id
                OR s.lesson_id IN (SELECT id FROM lessons WHERE course_id = p_course_id)
                OR s.lesson_version_id IN (SELECT v.id FROM lesson_versions v
                                           JOIN lessons l ON l.id = v.lesson_id
                                           WHERE l.course_id = p_course_id)) THEN
    v_blockers := array_append(v_blockers, 'recordings');
  END IF;
  IF EXISTS (SELECT 1 FROM writing_submissions s
             WHERE s.course_id = p_course_id
                OR s.lesson_id IN (SELECT id FROM lessons WHERE course_id = p_course_id)
                OR s.lesson_version_id IN (SELECT v.id FROM lesson_versions v
                                           JOIN lessons l ON l.id = v.lesson_id
                                           WHERE l.course_id = p_course_id)) THEN
    v_blockers := array_append(v_blockers, 'written_answers');
  END IF;
  IF EXISTS (SELECT 1 FROM run_final_comments c
             WHERE c.course_id = p_course_id
                OR c.run_id IN (SELECT id FROM course_runs WHERE course_id = p_course_id)) THEN
    v_blockers := array_append(v_blockers, 'final_comments');
  END IF;
  IF EXISTS (SELECT 1 FROM lesson_attempts a
             JOIN lesson_versions v ON v.id = a.lesson_version_id
             JOIN lessons l ON l.id = v.lesson_id
             WHERE l.course_id = p_course_id) THEN
    v_blockers := array_append(v_blockers, 'attempts');
  END IF;
  IF EXISTS (SELECT 1 FROM lesson_opens o JOIN lessons l ON l.id = o.lesson_id
             WHERE l.course_id = p_course_id) THEN
    v_blockers := array_append(v_blockers, 'opens');
  END IF;
  IF EXISTS (SELECT 1 FROM signup_acquisitions WHERE course_id = p_course_id) THEN
    v_blockers := array_append(v_blockers, 'signups');
  END IF;
  IF EXISTS (SELECT 1 FROM pending_claims pc, jsonb_array_elements(pc.payload) AS item
             WHERE pc.expires_at > now()
               AND jsonb_typeof(item) = 'object'
               AND item->>'lesson_version_id' IN (SELECT v.id::text FROM lesson_versions v
                                                  JOIN lessons l ON l.id = v.lesson_id
                                                  WHERE l.course_id = p_course_id)) THEN
    v_blockers := array_append(v_blockers, 'pending_claims');
  END IF;

  RETURN jsonb_build_object('ok', true, 'blockers', to_jsonb(v_blockers));
END;
$$;

REVOKE ALL ON FUNCTION course_delete_blockers(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION course_delete_blockers(UUID) TO authenticated;


-- ── 6. delete_my_account, re-emitted from 103 ───────────────────────────
-- One added step: the caller's written answers (feedback first), "then
-- deleted outright" (0225 Decision 10). The profile row stays, so the ON
-- DELETE CASCADE from profiles would never fire.
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
  -- WRITE-002 (0225 Decision 10): written answers and the feedback on them.
  DELETE FROM writing_feedback f
  USING writing_submissions s
  WHERE s.id = f.submission_id AND s.user_id = v_me;
  DELETE FROM writing_submissions      WHERE user_id = v_me;
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
