-- ============================================================
-- 076_teacher_links.sql
--
-- TCH-001 (#211): a learner links to a teacher (docs/decisions/0141
-- Decision 3; choices made while writing this file are in
-- docs/decisions/0148). Groups, homework, messages and answer reads (TCH-002
-- .. TCH-006) work on LINKED students only; this file builds the link and
-- the one helper they all gate on, _teacher_linked().
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 075_lesson_completion.sql
--   latest body of the account-delete RPC   -> 061_run_final_comments.sql
-- Re-emitted bodies, each from its latest definition:
--   delete_my_account        061 (two added DELETEs, section 7)
--   run_invite_preview       059 (adds teacher_name, section 5)
--   claim_run_invite         059 (adds the link, section 5)
-- Nothing else is re-emitted. The access function (_lesson_access_at,
-- can_read_lesson, course_lesson_states) is NOT touched: a link grants no
-- lesson access.
--
-- ── 1. Who is a teacher ─────────────────────────────────────────────────
-- Until seats (TCH-007), a teacher is an admin or anyone holding a
-- course_editors row (the card's own statement). _is_teacher() is the one
-- place that says so; TCH-007 redefines it.
--
-- ── 2. teacher_student_links ────────────────────────────────────────────
-- One row per link; ending a link sets ended_at / ended_by and keeps the
-- row (the history privacy-policy.md §4 lists: "which teacher you linked
-- to, when, and when and by whom it ended"). At most ONE active link per
-- (teacher, student) pair, by a partial unique index. A student cannot link
-- to themselves. No grants and no policy: every read and write is a
-- SECURITY DEFINER function below.
--
-- ── 3. teacher_join_tokens ──────────────────────────────────────────────
-- One row per teacher: the SHA-256 hex digest of a 128-bit random token
-- (the 059 / 0066 format). The raw token leaves the database ONCE, from
-- rotate_teacher_join_token(), and cannot be shown again; "Copy" in Studio
-- works on that response, and a teacher who lost the link rotates. A join
-- link has no expiry and no use count: it is the teacher's standing
-- student-invite link (0141 Decision 3), and rotating is what revokes it.
--
-- ── 4. The helper every later TCH read gates on ─────────────────────────
-- _teacher_linked(teacher, student): true only for an ACTIVE link. An ended
-- link returns false, which is how "an ended link stops every TCH read"
-- holds without each later card re-deriving it. No grants: callable only
-- from other SECURITY DEFINER functions.
--
-- ── 5. Run invites link too ─────────────────────────────────────────────
-- claim_run_invite (059) also links the claimer to the invite's creator when
-- that creator can edit the invite's course (0141 Decision 3: "linked to the
-- invite's creator"). A creator who no longer edits the course gets no
-- link. The link is made in the SAME call as the enrolment, so either both
-- land or neither does. run_invite_preview also returns the teacher's name
-- so the invite page can name who the learner will be linked to.
--
-- ── 6. Reads ────────────────────────────────────────────────────────────
-- my_teachers()         the caller's ACTIVE links, for /my.
-- my_teacher_links()    every link the caller is a student in, active or
--                       ended, for the data export.
-- teacher_linked_students()
--                       the caller's students, active and ended-by-leaving
--                       excluded: ACTIVE only, with a contact label, for
--                       Studio Learners (people with no activity yet
--                       included, which learner_roster() cannot do).
--
-- ── 7. Deletion ─────────────────────────────────────────────────────────
-- delete_my_account re-emitted from 061 with two added DELETEs: links where
-- the caller is the student OR the teacher (privacy-policy.md §9 "Teacher
-- links ... then deleted outright"), and the caller's join token.
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the owner, never by a session. REQUIRES 073 (learner_contact_label).
--
-- Safe to re-apply: CREATE TABLE / INDEX IF NOT EXISTS, every function
-- CREATE OR REPLACE.
-- ============================================================

BEGIN;

-- ── 1. _is_teacher ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _is_teacher(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user IS NOT NULL AND (
    is_admin(p_user)
    OR EXISTS (SELECT 1 FROM course_editors WHERE user_id = p_user)
  );
$$;

REVOKE ALL ON FUNCTION _is_teacher(UUID) FROM PUBLIC, anon, authenticated;


-- ── 2. teacher_student_links ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_student_links (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source     TEXT        NOT NULL CHECK (source IN ('join_link', 'run_invite')),
  linked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at   TIMESTAMPTZ,
  ended_by   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT teacher_student_links_not_self CHECK (teacher_id <> student_id),
  -- ended_by is set exactly when the link has ended (it may go NULL later
  -- through ON DELETE SET NULL, never be set on an active row).
  CONSTRAINT teacher_student_links_ended_by_needs_end
    CHECK (ended_by IS NULL OR ended_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS teacher_student_links_one_active_idx
  ON teacher_student_links (teacher_id, student_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS teacher_student_links_student_idx
  ON teacher_student_links (student_id, linked_at DESC);
CREATE INDEX IF NOT EXISTS teacher_student_links_teacher_idx
  ON teacher_student_links (teacher_id, linked_at DESC);

ALTER TABLE teacher_student_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE teacher_student_links FROM PUBLIC, anon, authenticated;
-- No GRANT and no policy: only the SECURITY DEFINER functions below read or
-- write it.


-- ── 3. teacher_join_tokens ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_join_tokens (
  teacher_id UUID        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE teacher_join_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE teacher_join_tokens FROM PUBLIC, anon, authenticated;

-- A raw token's stored form; NULL for anything that is not 32 hex chars
-- (the _run_invite_token_hash shape, 059).
CREATE OR REPLACE FUNCTION _teacher_join_token_hash(p_token TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_token ~ '^[0-9a-f]{32}$' THEN encode(extensions.digest(p_token, 'sha256'), 'hex')
  END
$$;

REVOKE ALL ON FUNCTION _teacher_join_token_hash(TEXT) FROM PUBLIC, anon, authenticated;


-- ── 4. _teacher_linked ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _teacher_linked(p_teacher UUID, p_student UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_teacher IS NOT NULL AND p_student IS NOT NULL AND EXISTS (
    SELECT 1 FROM teacher_student_links
    WHERE teacher_id = p_teacher AND student_id = p_student AND ended_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION _teacher_linked(UUID, UUID) FROM PUBLIC, anon, authenticated;


-- ── Teacher: create / rotate the join link ──────────────────────────────
-- First call creates the token, later calls replace it (the old link stops
-- working at once). Returns the raw token ONCE.
CREATE OR REPLACE FUNCTION rotate_teacher_join_token()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    UUID := (SELECT auth.uid());
  v_token TEXT;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF NOT _is_teacher(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_token := encode(extensions.gen_random_bytes(16), 'hex');
  INSERT INTO teacher_join_tokens (teacher_id, token_hash)
  VALUES (v_me, _teacher_join_token_hash(v_token))
  ON CONFLICT (teacher_id)
    DO UPDATE SET token_hash = EXCLUDED.token_hash, rotated_at = now();

  RETURN jsonb_build_object('ok', true, 'token', v_token);
END;
$$;

REVOKE ALL ON FUNCTION rotate_teacher_join_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rotate_teacher_join_token() TO authenticated;

-- Whether the caller has a join link at all (never the token), so Studio can
-- say "Create link" or "Rotate" without the token.
CREATE OR REPLACE FUNCTION my_teacher_join_link_state()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT _is_teacher((SELECT auth.uid())) THEN NULL
    ELSE jsonb_build_object(
      'exists',     EXISTS (SELECT 1 FROM teacher_join_tokens WHERE teacher_id = (SELECT auth.uid())),
      'rotated_at', (SELECT rotated_at FROM teacher_join_tokens WHERE teacher_id = (SELECT auth.uid()))
    )
  END;
$$;

REVOKE ALL ON FUNCTION my_teacher_join_link_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_teacher_join_link_state() TO authenticated;


-- ── Learner: preview and join ───────────────────────────────────────────
-- The teacher's PUBLIC name is profiles.display_name (the leaderboard rule:
-- never full_name, which is typically a real name). Anyone holding the link
-- sees the name; nothing else about the teacher.
CREATE OR REPLACE FUNCTION teacher_join_preview(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      UUID := (SELECT auth.uid());
  v_teacher UUID;
  v_name    TEXT;
BEGIN
  SELECT t.teacher_id, p.display_name INTO v_teacher, v_name
  FROM teacher_join_tokens t
  JOIN profiles p ON p.id = t.teacher_id
  WHERE t.token_hash = _teacher_join_token_hash(p_token)
    AND p.deleted_at IS NULL
    AND _is_teacher(t.teacher_id);
  IF v_teacher IS NULL THEN
    RETURN jsonb_build_object('state', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'state', CASE
      WHEN v_me = v_teacher THEN 'self'
      WHEN v_me IS NOT NULL AND _teacher_linked(v_teacher, v_me) THEN 'already_linked'
      ELSE 'ok'
    END,
    'teacher_name', COALESCE(NULLIF(btrim(v_name), ''), 'Your teacher')
  );
END;
$$;

REVOKE ALL ON FUNCTION teacher_join_preview(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION teacher_join_preview(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION join_teacher(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      UUID := (SELECT auth.uid());
  v_teacher UUID;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT t.teacher_id INTO v_teacher
  FROM teacher_join_tokens t
  JOIN profiles p ON p.id = t.teacher_id
  WHERE t.token_hash = _teacher_join_token_hash(p_token)
    AND p.deleted_at IS NULL
    AND _is_teacher(t.teacher_id);
  IF v_teacher IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_teacher = v_me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self');
  END IF;

  -- The partial unique index serialises two concurrent joins: the second
  -- inserts nothing and reports the link as already there.
  INSERT INTO teacher_student_links (teacher_id, student_id, source)
  VALUES (v_teacher, v_me, 'join_link')
  ON CONFLICT (teacher_id, student_id) WHERE ended_at IS NULL DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'already_linked', NOT FOUND);
END;
$$;

REVOKE ALL ON FUNCTION join_teacher(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION join_teacher(TEXT) TO authenticated;


-- ── Ending a link ───────────────────────────────────────────────────────
-- Either party; ended_by records which. A link that is not the caller's
-- (or is already ended) is `not_found`, so a guess reveals nothing.
CREATE OR REPLACE FUNCTION end_teacher_link(p_link_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := (SELECT auth.uid());
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  UPDATE teacher_student_links
     SET ended_at = now(), ended_by = v_me
   WHERE id = p_link_id
     AND ended_at IS NULL
     AND (student_id = v_me OR teacher_id = v_me);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION end_teacher_link(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION end_teacher_link(UUID) TO authenticated;


-- ── 6. Reads ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION my_teachers()
RETURNS TABLE (
  link_id      UUID,
  teacher_name TEXT,
  linked_at    TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, COALESCE(NULLIF(btrim(p.display_name), ''), 'Your teacher'), l.linked_at
  FROM teacher_student_links l
  JOIN profiles p ON p.id = l.teacher_id
  WHERE l.student_id = (SELECT auth.uid())
    AND l.ended_at IS NULL
  ORDER BY l.linked_at DESC;
$$;

REVOKE ALL ON FUNCTION my_teachers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_teachers() TO authenticated;

-- Every link the caller is the STUDENT in, ended ones too, for the export
-- (privacy-policy.md §8). Teacher side is not exported: those rows describe
-- other people.
CREATE OR REPLACE FUNCTION my_teacher_links()
RETURNS TABLE (
  link_id      UUID,
  teacher_name TEXT,
  source       TEXT,
  linked_at    TIMESTAMPTZ,
  ended_at     TIMESTAMPTZ,
  ended_by     TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id,
         COALESCE(NULLIF(btrim(p.display_name), ''), 'Your teacher'),
         l.source, l.linked_at, l.ended_at,
         CASE
           WHEN l.ended_at IS NULL THEN NULL
           WHEN l.ended_by = l.student_id THEN 'you'
           WHEN l.ended_by = l.teacher_id THEN 'teacher'
           ELSE 'unknown'
         END
  FROM teacher_student_links l
  JOIN profiles p ON p.id = l.teacher_id
  WHERE l.student_id = (SELECT auth.uid())
  ORDER BY l.linked_at DESC;
$$;

REVOKE ALL ON FUNCTION my_teacher_links() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_teacher_links() TO authenticated;

-- The caller's ACTIVE students, for Studio Learners. Only what the roster
-- already shows of a person (a contact label); nothing about answers: those
-- reads are TCH-003's.
CREATE OR REPLACE FUNCTION teacher_linked_students()
RETURNS TABLE (
  link_id       UUID,
  user_id       UUID,
  contact_label TEXT,
  source        TEXT,
  linked_at     TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.student_id, learner_contact_label(l.student_id), l.source, l.linked_at
  FROM teacher_student_links l
  JOIN profiles p ON p.id = l.student_id
  WHERE l.teacher_id = (SELECT auth.uid())
    AND l.ended_at IS NULL
    AND p.deleted_at IS NULL
    AND _is_teacher((SELECT auth.uid()))
  ORDER BY l.linked_at DESC;
$$;

REVOKE ALL ON FUNCTION teacher_linked_students() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION teacher_linked_students() TO authenticated;


-- ── 5a. run_invite_preview (re-emitted from 059) ────────────────────────
-- Adds `teacher_name`: the invite creator's display name when they can edit
-- the invite's course (the same condition claim_run_invite links on), else
-- NULL. Nothing else changes.
CREATE OR REPLACE FUNCTION run_invite_preview(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    UUID := (SELECT auth.uid());
  v_row   RECORD;
  v_state TEXT;
  v_name  TEXT;
BEGIN
  SELECT i.run_id, i.tier, i.claimed_at, i.claimed_by, i.revoked_at, i.expires_at, i.created_by,
         r.title AS run_title, r.starts_at, r.ends_at, r.course_id,
         c.slug AS course_slug, c.title AS course_title
  INTO v_row
  FROM run_invites i
  JOIN course_runs r ON r.id = i.run_id
  JOIN courses c     ON c.id = r.course_id
  WHERE i.token_hash = _run_invite_token_hash(p_token);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'not_found');
  END IF;

  v_state := _run_invite_state(v_row.claimed_at, v_row.revoked_at, v_row.expires_at, v_row.ends_at, now());
  IF v_state = 'claimed' THEN
    v_state := CASE WHEN v_row.claimed_by = v_me THEN 'claimed_by_you' ELSE 'used' END;
  END IF;

  IF v_row.created_by IS NOT NULL AND can_edit_course(v_row.course_id, v_row.created_by) THEN
    SELECT COALESCE(NULLIF(btrim(display_name), ''), 'Your teacher') INTO v_name
    FROM profiles WHERE id = v_row.created_by AND deleted_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'state',         v_state,
    'course_slug',   v_row.course_slug,
    'course_title',  v_row.course_title,
    'run_title',     v_row.run_title,
    'run_starts_at', v_row.starts_at,
    'tier',          v_row.tier,
    'teacher_name',  v_name,
    'already_enrolled', v_me IS NOT NULL AND EXISTS (
      SELECT 1 FROM run_enrolments
      WHERE run_id = v_row.run_id AND user_id = v_me AND revoked_at IS NULL
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION run_invite_preview(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION run_invite_preview(TEXT) TO anon, authenticated;


-- ── 5b. claim_run_invite (re-emitted from 059) ──────────────────────────
-- One added block: after the enrolment, link the claimer to the invite's
-- creator if that creator edits the course and is not the claimer. An
-- existing active link is left alone (no second row).
CREATE OR REPLACE FUNCTION claim_run_invite(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        UUID := (SELECT auth.uid());
  v_invite    RECORD;
  v_enrolment UUID;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  -- Locks the invite: a second account claiming the same link waits here,
  -- then reads claimed_at and gets `used`.
  SELECT i.id, i.run_id, i.tier, i.claimed_at, i.claimed_by, i.revoked_at, i.expires_at, i.created_by,
         r.ends_at, r.course_id, c.slug AS course_slug
  INTO v_invite
  FROM run_invites i
  JOIN course_runs r ON r.id = i.run_id
  JOIN courses c     ON c.id = r.course_id
  WHERE i.token_hash = _run_invite_token_hash(p_token)
  FOR UPDATE OF i;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_invite.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'revoked');
  END IF;
  IF v_invite.claimed_at IS NOT NULL THEN
    IF v_invite.claimed_by = v_me THEN
      -- A reload or a double submit by the same learner: nothing to do.
      RETURN jsonb_build_object('ok', true, 'course_slug', v_invite.course_slug, 'already_claimed', true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'used');
  END IF;
  IF now() >= LEAST(v_invite.expires_at, v_invite.ends_at) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;
  IF EXISTS (
    SELECT 1 FROM run_enrolments
    WHERE run_id = v_invite.run_id AND user_id = v_me AND revoked_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_enrolled', 'course_slug', v_invite.course_slug);
  END IF;

  INSERT INTO run_enrolments (run_id, user_id, tier, source_ref)
  VALUES (v_invite.run_id, v_me, v_invite.tier, 'invite:' || v_invite.id)
  RETURNING id INTO v_enrolment;

  UPDATE run_invites
     SET claimed_at = now(), claimed_by = v_me, enrolment_id = v_enrolment
   WHERE id = v_invite.id;

  -- TCH-001: the learner saw the statement of what the teacher sees on the
  -- invite page before pressing Join (0148 Decision 4).
  IF v_invite.created_by IS NOT NULL
     AND v_invite.created_by <> v_me
     AND can_edit_course(v_invite.course_id, v_invite.created_by) THEN
    INSERT INTO teacher_student_links (teacher_id, student_id, source)
    VALUES (v_invite.created_by, v_me, 'run_invite')
    ON CONFLICT (teacher_id, student_id) WHERE ended_at IS NULL DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true, 'course_slug', v_invite.course_slug, 'already_claimed', false);
END;
$$;

REVOKE ALL ON FUNCTION claim_run_invite(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION claim_run_invite(TEXT) TO authenticated;


-- ── 7. delete_my_account (re-emitted from 061) ──────────────────────────
-- Verbatim from 061 with two added DELETEs, marked TCH-001.
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
  -- TCH-001 (privacy-policy.md §9: "then deleted outright").
  DELETE FROM teacher_student_links    WHERE student_id = v_me OR teacher_id = v_me;
  DELETE FROM teacher_join_tokens      WHERE teacher_id = v_me;

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
