-- ============================================================
-- 061_run_final_comments.sql
--
-- COH-008. The author's final comment to a learner at the end of a cohort
-- run: one per run enrolment, written in VOICE-006 and shown on COH-005's
-- before/after screen. Choices made while writing it are in
-- docs/decisions/0112.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 060_voice_submissions.sql
--   latest body of the account-delete RPC   -> 060_voice_submissions.sql
-- Re-emitted bodies, each from its latest definition:
--   delete_my_account        060 (final comments deleted, section 4)
-- Nothing else is re-emitted. _feedback_content_valid (060) is called, not
-- redefined, so the shape and the 5,000-character cap stay in one place.
--
-- ── 1. Table: run_final_comments ────────────────────────────────────────
-- One row per run enrolment (the primary key). The VOICE-002 shape (0096)
-- in `body`. A draft has published_at NULL; publishing is one-way and a
-- later save edits the live text (060's voice_feedback precedent).
-- user_id, course_id and run_id are copied from the enrolment when the row
-- is written, so the read policies need no join through run_enrolments,
-- which an editor cannot read (058: owner read only).
--
-- ── 2. Write: save_final_comment(enrolment, body, publish) ──────────────
-- SECURITY DEFINER. can_edit_course on the enrolment's course, or
-- 'forbidden' (not found reads the same). A revoked enrolment is refused
-- ('enrolment_revoked', 0112 Decision 2). The body is validated by
-- _feedback_content_valid (lib/feedback/content.ts,
-- FEEDBACK_CONTENT_MAX_CHARS). No table grants beyond SELECT: this RPC is
-- the only writer.
--
-- ── 3. Reads ────────────────────────────────────────────────────────────
-- SELECT granted to authenticated only. The learner reads their own row
-- once PUBLISHED; an editor reads every row of the courses they edit,
-- drafts included. anon has no grant.
--
-- ── 4. delete_my_account (re-emitted from 060) ──────────────────────────
-- Plus one DELETE of the caller's final comments (privacy-policy.md: "The
-- author's written feedback and final comment — until you close your
-- account; then deleted outright"). The run_enrolments DELETE would cascade
-- to them anyway; the explicit line keeps the list of erased tables
-- readable in one place.
--
-- ── 5. Export ──────────────────────────────────────────────────────────
-- No function needed: the export route reads the table under the learner's
-- own session (section 3), so only published comments are exported.
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the owner, never by a session.
--
-- Safe to re-apply: CREATE TABLE / INDEX IF NOT EXISTS, DROP POLICY IF
-- EXISTS before each, every function CREATE OR REPLACE.
-- ============================================================

BEGIN;

-- ── 1. Table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS run_final_comments (
  enrolment_id UUID        PRIMARY KEY REFERENCES run_enrolments(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES profiles(id)       ON DELETE CASCADE,
  course_id    UUID        NOT NULL REFERENCES courses(id)        ON DELETE CASCADE,
  run_id       UUID        NOT NULL REFERENCES course_runs(id)    ON DELETE CASCADE,
  body         JSONB       NOT NULL,
  updated_by   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS run_final_comments_user_idx   ON run_final_comments (user_id);
CREATE INDEX IF NOT EXISTS run_final_comments_course_idx ON run_final_comments (course_id, run_id);

ALTER TABLE run_final_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE run_final_comments FROM anon, authenticated;
GRANT SELECT ON TABLE run_final_comments TO authenticated;


-- ── 3. Read policies ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "run_final_comments: editor read" ON run_final_comments;
CREATE POLICY "run_final_comments: editor read"
  ON run_final_comments FOR SELECT
  USING (can_edit_course(course_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "run_final_comments: owner reads published" ON run_final_comments;
CREATE POLICY "run_final_comments: owner reads published"
  ON run_final_comments FOR SELECT
  USING (
    published_at IS NOT NULL
    AND user_id = (SELECT auth.uid())
  );


-- ── 2. save_final_comment ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION save_final_comment(
  p_enrolment_id UUID,
  p_body         JSONB,
  p_publish      BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        UUID := auth.uid();
  v_enrolment run_enrolments%ROWTYPE;
  v_course    UUID;
  v_published TIMESTAMPTZ;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT * INTO v_enrolment FROM run_enrolments WHERE id = p_enrolment_id;
  SELECT r.course_id INTO v_course FROM course_runs r WHERE r.id = v_enrolment.run_id;
  -- Not found and not an editor read the same, so a non-editor cannot probe
  -- which enrolment ids exist.
  IF v_course IS NULL OR NOT can_edit_course(v_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF v_enrolment.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'enrolment_revoked');
  END IF;

  IF NOT _feedback_content_valid(p_body) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_feedback');
  END IF;

  INSERT INTO run_final_comments (enrolment_id, user_id, course_id, run_id, body, updated_by, published_at)
  VALUES (
    p_enrolment_id, v_enrolment.user_id, v_course, v_enrolment.run_id,
    p_body, v_me, CASE WHEN p_publish THEN now() END
  )
  ON CONFLICT (enrolment_id) DO UPDATE
    SET body         = EXCLUDED.body,
        updated_by   = EXCLUDED.updated_by,
        updated_at   = now(),
        -- One-way: once published it stays published, and a later save
        -- edits the live text (060's voice_feedback precedent).
        published_at = COALESCE(run_final_comments.published_at, EXCLUDED.published_at)
  RETURNING published_at INTO v_published;

  RETURN jsonb_build_object('ok', true, 'published_at', v_published);
END;
$$;

REVOKE ALL ON FUNCTION save_final_comment(UUID, JSONB, BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION save_final_comment(UUID, JSONB, BOOLEAN) TO authenticated;


-- ── 4. delete_my_account (re-emitted from 060) ──────────────────────────
-- Re-emitted from 060 verbatim, plus the DELETE FROM run_final_comments
-- line before the run_enrolments DELETE.
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
