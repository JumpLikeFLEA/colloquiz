-- ============================================================
-- 077_teacher_groups.sql
--
-- TCH-002 (#212): a teacher groups their linked students (docs/decisions/0141
-- Decision 12; choices made while writing this file are in
-- docs/decisions/0149). Groups are private to the teacher: the student sees
-- a group's name only in their own data export (docs/decisions/0144 Q2).
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 076_teacher_links.sql
--   latest body of the account-delete RPC   -> 076_teacher_links.sql
-- Re-emitted: delete_my_account (076, one added DELETE, section 5). Nothing
-- else is re-emitted; end_teacher_link is NOT touched (see section 3).
--
-- ── 1. teacher_groups ───────────────────────────────────────────────────
-- (teacher_id, name) is unique case-insensitively. No grants, no policy:
-- every read and write is a SECURITY DEFINER function below.
--
-- ── 2. teacher_group_members ────────────────────────────────────────────
-- teacher_id is stored on the membership so a composite FK
-- (group_id, teacher_id) -> teacher_groups(id, teacher_id) makes "the
-- member row belongs to the group's own teacher" a constraint, not a
-- convention. "A member must be a live linked student of that teacher" is
-- enforced by add_teacher_group_members() on the way in and by the trigger
-- in section 3 on the way out; there is no other write path.
--
-- ── 3. A link that ends removes the student from that teacher's groups ──
-- A trigger on teacher_student_links, not a change to end_teacher_link: the
-- link ends through end_teacher_link (either party), through
-- delete_my_account's DELETE, and through whatever TCH-008 adds; the trigger
-- covers all of them, so the rule has one home.
--
-- ── 4. Functions ────────────────────────────────────────────────────────
-- create/rename/delete_teacher_group, add_teacher_group_members (all or
-- nothing), remove_teacher_group_member, teacher_groups_list(),
-- teacher_group_member_rows() (the caller's memberships, for the Studio
-- pages and the Learners filter), my_group_memberships() (the caller as a
-- STUDENT, names only, for the export).
--
-- ── 5. delete_my_account ────────────────────────────────────────────────
-- Re-emitted from 076 with one added DELETE: the caller's own groups
-- (memberships cascade). A student's memberships go with their link rows
-- through the trigger in section 3.
--
-- Safe to re-apply: CREATE ... IF NOT EXISTS, CREATE OR REPLACE,
-- DROP TRIGGER IF EXISTS.
-- ============================================================

BEGIN;

-- ── 1. teacher_groups ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_groups (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT teacher_groups_id_teacher_key UNIQUE (id, teacher_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS teacher_groups_teacher_name_idx
  ON teacher_groups (teacher_id, lower(name));

ALTER TABLE teacher_groups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE teacher_groups FROM PUBLIC, anon, authenticated;


-- ── 2. teacher_group_members ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_group_members (
  group_id   UUID        NOT NULL,
  teacher_id UUID        NOT NULL,
  student_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, student_id),
  CONSTRAINT teacher_group_members_group_fk
    FOREIGN KEY (group_id, teacher_id) REFERENCES teacher_groups (id, teacher_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS teacher_group_members_teacher_student_idx
  ON teacher_group_members (teacher_id, student_id);
CREATE INDEX IF NOT EXISTS teacher_group_members_student_idx
  ON teacher_group_members (student_id);

ALTER TABLE teacher_group_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE teacher_group_members FROM PUBLIC, anon, authenticated;


-- ── 3. Ending a link empties that teacher's groups of that student ──────
CREATE OR REPLACE FUNCTION _teacher_link_ended_drop_members()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM teacher_group_members
   WHERE teacher_id = OLD.teacher_id AND student_id = OLD.student_id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION _teacher_link_ended_drop_members() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS teacher_link_ended_drop_members_upd ON teacher_student_links;
CREATE TRIGGER teacher_link_ended_drop_members_upd
  AFTER UPDATE OF ended_at ON teacher_student_links
  FOR EACH ROW
  WHEN (OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL)
  EXECUTE FUNCTION _teacher_link_ended_drop_members();

DROP TRIGGER IF EXISTS teacher_link_ended_drop_members_del ON teacher_student_links;
CREATE TRIGGER teacher_link_ended_drop_members_del
  AFTER DELETE ON teacher_student_links
  FOR EACH ROW
  EXECUTE FUNCTION _teacher_link_ended_drop_members();


-- ── 4. Functions ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_teacher_group(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   UUID := (SELECT auth.uid());
  v_name TEXT := btrim(COALESCE(p_name, ''));
  v_id   UUID;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF NOT _is_teacher(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 60 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_name');
  END IF;

  BEGIN
    INSERT INTO teacher_groups (teacher_id, name) VALUES (v_me, v_name) RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_taken');
  END;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION create_teacher_group(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_teacher_group(TEXT) TO authenticated;


CREATE OR REPLACE FUNCTION rename_teacher_group(p_group UUID, p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   UUID := (SELECT auth.uid());
  v_name TEXT := btrim(COALESCE(p_name, ''));
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 60 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_name');
  END IF;

  BEGIN
    UPDATE teacher_groups SET name = v_name WHERE id = p_group AND teacher_id = v_me;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_taken');
  END;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION rename_teacher_group(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rename_teacher_group(UUID, TEXT) TO authenticated;


CREATE OR REPLACE FUNCTION delete_teacher_group(p_group UUID)
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

  DELETE FROM teacher_groups WHERE id = p_group AND teacher_id = v_me;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION delete_teacher_group(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_teacher_group(UUID) TO authenticated;


-- All or nothing: one student who is not the caller's live linked student
-- rejects the whole call and inserts nobody. A group that is not the
-- caller's is `not_found`, the same answer as one that doesn't exist.
CREATE OR REPLACE FUNCTION add_teacher_group_members(p_group UUID, p_students UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    UUID := (SELECT auth.uid());
  v_ids   UUID[];
  v_added INTEGER;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM teacher_groups WHERE id = p_group AND teacher_id = v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT COALESCE(array_agg(DISTINCT s), ARRAY[]::UUID[])
    INTO v_ids
  FROM unnest(COALESCE(p_students, ARRAY[]::UUID[])) AS s;

  IF cardinality(v_ids) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_ids) AS s WHERE NOT _teacher_linked(v_me, s)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_linked');
  END IF;

  INSERT INTO teacher_group_members (group_id, teacher_id, student_id)
  SELECT p_group, v_me, s FROM unnest(v_ids) AS s
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_added = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'added', v_added);
END;
$$;

REVOKE ALL ON FUNCTION add_teacher_group_members(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION add_teacher_group_members(UUID, UUID[]) TO authenticated;


CREATE OR REPLACE FUNCTION remove_teacher_group_member(p_group UUID, p_student UUID)
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

  DELETE FROM teacher_group_members
   WHERE group_id = p_group AND teacher_id = v_me AND student_id = p_student;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION remove_teacher_group_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION remove_teacher_group_member(UUID, UUID) TO authenticated;


CREATE OR REPLACE FUNCTION teacher_groups_list()
RETURNS TABLE (
  group_id     UUID,
  name         TEXT,
  member_count INTEGER,
  created_at   TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.id, g.name,
         (SELECT count(*)::int FROM teacher_group_members m WHERE m.group_id = g.id),
         g.created_at
  FROM teacher_groups g
  WHERE g.teacher_id = (SELECT auth.uid())
  ORDER BY lower(g.name), g.created_at;
$$;

REVOKE ALL ON FUNCTION teacher_groups_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION teacher_groups_list() TO authenticated;


-- The caller's memberships, all groups: the group page, the learner page
-- and the Learners filter each narrow it in the app. Ids only; labels come
-- from teacher_linked_students() (076).
CREATE OR REPLACE FUNCTION teacher_group_member_rows()
RETURNS TABLE (
  group_id   UUID,
  student_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.group_id, m.student_id
  FROM teacher_group_members m
  WHERE m.teacher_id = (SELECT auth.uid());
$$;

REVOKE ALL ON FUNCTION teacher_group_member_rows() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION teacher_group_member_rows() TO authenticated;


-- The groups the caller is a MEMBER of, names only: the one place a student
-- sees a group (the data export, docs/decisions/0144 Q2). No other student's
-- name, no member count.
CREATE OR REPLACE FUNCTION my_group_memberships()
RETURNS TABLE (
  group_name   TEXT,
  teacher_name TEXT,
  added_at     TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.name,
         COALESCE(NULLIF(btrim(p.display_name), ''), 'Your teacher'),
         m.added_at
  FROM teacher_group_members m
  JOIN teacher_groups g ON g.id = m.group_id
  JOIN profiles p ON p.id = g.teacher_id
  WHERE m.student_id = (SELECT auth.uid())
  ORDER BY m.added_at DESC;
$$;

REVOKE ALL ON FUNCTION my_group_memberships() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_group_memberships() TO authenticated;


-- ── 5. delete_my_account (re-emitted from 076) ──────────────────────────
-- Verbatim from 076 with one added DELETE, marked TCH-002.
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
  -- TCH-002: the caller's own groups (memberships cascade). Memberships of the
  -- caller as a student go with the link deletes above (trigger, section 3).
  DELETE FROM teacher_groups           WHERE teacher_id = v_me;

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
