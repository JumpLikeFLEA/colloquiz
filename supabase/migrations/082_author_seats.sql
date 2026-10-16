-- ============================================================
-- 082_author_seats.sql
--
-- TCH-007 (#221): author seats. An admin adds, extends and freezes teachers on
-- manual seats; a seat is what lets a non-admin create courses (docs/decisions/
-- 0141 Decisions 1, 2 and 18; choices made while writing this file are in
-- docs/decisions/0154).
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 081_ask_the_teacher.sql
--   latest body of the account-delete RPC   -> 080_homework.sql
-- Re-emitted: create_course (067, section 5), _is_teacher (076, section 4) and
-- delete_my_account (080, section 7: one added DELETE).
-- REQUIRES 029 (course_editors), 041 (courses.author_id), 073
-- (learner_contact_label) and 076 (teacher_student_links, _is_teacher).
--
-- ── 1. author_seats ─────────────────────────────────────────────────────
-- One row per teacher: kind ('house' or 'teacher'), the public name a later
-- "By <name>" will show (TCH-011), an optional expiry (NULL = open-ended),
-- the admin's private notes, who granted it. No grants and no policy: every
-- read and write is a SECURITY DEFINER function below, so a non-admin cannot
-- read or change a seat (verify script). The house seat is marked by an
-- admin on /studio/authors, never here (the card).
--
-- ── 2. What "active" means ──────────────────────────────────────────────
-- _author_seat_active(user): a seat exists and expires_at is NULL or in the
-- future. The one place that says so. This card uses it for create_course
-- only; TCH-008 uses it to freeze the rest of Studio.
--
-- ── 3. Admin functions ──────────────────────────────────────────────────
-- author_seats_list, add_author_seat (by email), update_author_seat (name and
-- notes), set_author_seat_expiry (extend, or open-ended with NULL),
-- freeze_author_seat (expiry = now), set_author_seat_kind. Each checks
-- is_admin(auth.uid()) itself and returns {ok:false, error:'forbidden'}
-- (author_seats_list raises insufficient_privilege: it returns rows, not a
-- status). There is no delete: a mistaken seat is frozen.
--
-- ── 4. Who is a teacher: _is_teacher widened ────────────────────────────
-- 076 said TCH-007 redefines it. A seat now counts too, so a teacher who has
-- not made a course yet can still mint a student link. Admin or course_editors
-- row or seat; a LAPSED seat still counts here, because freezing is TCH-008's
-- and reads _author_seat_active, not this. Strictly wider than 076, so no
-- existing teacher loses anything.
--
-- ── 5. create_course re-emitted ─────────────────────────────────────────
-- 067's gate was "admin, or editor of ANY course". Now: admin, or an ACTIVE
-- seat. A lapsed seat answers 'seat_lapsed', no seat 'forbidden'. Every
-- existing editor is backfilled below, so none of them is turned away.
-- Everything else is verbatim from 067.
--
-- ── 6. Backfill ─────────────────────────────────────────────────────────
-- Every course_editors holder whose account is not deleted gets an
-- open-ended 'teacher' seat named after their public display_name (never
-- full_name; 'Teacher' when empty). Safe to re-apply: ON CONFLICT DO NOTHING,
-- so a seat an admin has since frozen or edited is left alone. The counts are
-- printed by a NOTICE.
--
-- ── 7. Export and deletion ──────────────────────────────────────────────
-- my_author_seat_export() returns the caller's own seat, notes included
-- (docs/decisions/0154 Decision 8). delete_my_account (080) gains one DELETE:
-- the seat, because the profile row stays (anonymised) and the public name
-- and notes would otherwise outlive the account.
--
-- Not destructive: no DROP, no TRUNCATE, no UPDATE or DELETE of an existing
-- row, nothing that makes an existing row invalid.
--
-- Safe to re-apply: IF NOT EXISTS, CREATE OR REPLACE, ON CONFLICT DO NOTHING.
-- ============================================================

BEGIN;

-- ── 1. author_seats ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS author_seats (
  user_id     UUID        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  kind        TEXT        NOT NULL DEFAULT 'teacher' CHECK (kind IN ('house', 'teacher')),
  public_name TEXT        NOT NULL CHECK (char_length(btrim(public_name)) BETWEEN 1 AND 80),
  expires_at  TIMESTAMPTZ,
  notes       TEXT        CHECK (notes IS NULL OR char_length(notes) <= 1000),
  granted_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE author_seats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE author_seats FROM PUBLIC, anon, authenticated;


-- ── 2. _author_seat_active ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _author_seat_active(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM author_seats s
    WHERE s.user_id = p_user
      AND (s.expires_at IS NULL OR s.expires_at > now())
  );
$$;

REVOKE ALL ON FUNCTION _author_seat_active(UUID) FROM PUBLIC, anon, authenticated;


-- ── 3. Admin functions ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION author_seats_list()
RETURNS TABLE (
  user_id         UUID,
  contact         TEXT,
  kind            TEXT,
  public_name     TEXT,
  notes           TEXT,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ,
  is_active       BOOLEAN,
  days_left       INTEGER,
  courses         INTEGER,
  linked_students INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL OR NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    s.user_id,
    learner_contact_label(s.user_id),
    s.kind,
    s.public_name,
    s.notes,
    s.expires_at,
    s.created_at,
    (s.expires_at IS NULL OR s.expires_at > now()),
    CASE WHEN s.expires_at IS NULL THEN NULL
         ELSE ceil(extract(epoch FROM (s.expires_at - now())) / 86400.0)::INTEGER END,
    (SELECT count(*)::INTEGER FROM (
       SELECT ce.course_id FROM course_editors ce WHERE ce.user_id = s.user_id
       UNION
       SELECT c.id FROM courses c WHERE c.author_id = s.user_id
     ) edited),
    (SELECT count(*)::INTEGER FROM teacher_student_links l
      WHERE l.teacher_id = s.user_id AND l.ended_at IS NULL)
  FROM author_seats s
  ORDER BY (s.kind = 'house') DESC, lower(s.public_name), s.user_id;
END;
$$;

REVOKE ALL ON FUNCTION author_seats_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION author_seats_list() TO authenticated;


CREATE OR REPLACE FUNCTION add_author_seat(
  p_email       TEXT,
  p_public_name TEXT        DEFAULT NULL,
  p_expires_at  TIMESTAMPTZ DEFAULT NULL,
  p_notes       TEXT        DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    UUID := auth.uid();
  v_user  UUID;
  v_disp  TEXT;
  v_name  TEXT;
  v_notes TEXT := NULLIF(btrim(COALESCE(p_notes, '')), '');
BEGIN
  IF v_me IS NULL OR NOT is_admin(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_email');
  END IF;
  IF v_notes IS NOT NULL AND char_length(v_notes) > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_notes');
  END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expiry_in_past');
  END IF;

  SELECT u.id INTO v_user
  FROM auth.users u
  JOIN profiles p ON p.id = u.id AND p.deleted_at IS NULL
  WHERE lower(u.email) = lower(btrim(p_email))
  LIMIT 1;
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;
  IF EXISTS (SELECT 1 FROM author_seats WHERE user_id = v_user) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_seated');
  END IF;

  -- A blank name falls back to the public handle, never full_name.
  SELECT NULLIF(btrim(p.display_name), '') INTO v_disp FROM profiles p WHERE p.id = v_user;
  v_name := COALESCE(NULLIF(btrim(COALESCE(p_public_name, '')), ''), v_disp);
  IF v_name IS NULL OR char_length(v_name) > 80 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_name');
  END IF;

  INSERT INTO author_seats (user_id, kind, public_name, expires_at, notes, granted_by)
  VALUES (v_user, 'teacher', v_name, p_expires_at, v_notes, v_me);

  RETURN jsonb_build_object('ok', true, 'user_id', v_user);
END;
$$;

REVOKE ALL ON FUNCTION add_author_seat(TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION add_author_seat(TEXT, TEXT, TIMESTAMPTZ, TEXT) TO authenticated;


CREATE OR REPLACE FUNCTION update_author_seat(p_user UUID, p_public_name TEXT, p_notes TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    UUID := auth.uid();
  v_name  TEXT := btrim(COALESCE(p_public_name, ''));
  v_notes TEXT := NULLIF(btrim(COALESCE(p_notes, '')), '');
BEGIN
  IF v_me IS NULL OR NOT is_admin(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF v_name = '' OR char_length(v_name) > 80 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_name');
  END IF;
  IF v_notes IS NOT NULL AND char_length(v_notes) > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_notes');
  END IF;

  UPDATE author_seats
     SET public_name = v_name, notes = v_notes, updated_at = now()
   WHERE user_id = p_user;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_not_found');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION update_author_seat(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_author_seat(UUID, TEXT, TEXT) TO authenticated;


-- NULL = open-ended. A date that has passed is refused: that is what
-- freeze_author_seat is for, and a typo must not lapse a seat by accident.
CREATE OR REPLACE FUNCTION set_author_seat_expiry(p_user UUID, p_expires_at TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL OR NOT is_admin(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expiry_in_past');
  END IF;

  UPDATE author_seats SET expires_at = p_expires_at, updated_at = now() WHERE user_id = p_user;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_not_found');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION set_author_seat_expiry(UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_author_seat_expiry(UUID, TIMESTAMPTZ) TO authenticated;


-- Freeze now: the expiry becomes now(). A seat that already lapsed keeps its
-- earlier date (the history of when it lapsed is the more useful value).
CREATE OR REPLACE FUNCTION freeze_author_seat(p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL OR NOT is_admin(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE author_seats
     SET expires_at = CASE WHEN expires_at IS NOT NULL AND expires_at <= now() THEN expires_at ELSE now() END,
         updated_at = now()
   WHERE user_id = p_user;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_not_found');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION freeze_author_seat(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION freeze_author_seat(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION set_author_seat_kind(p_user UUID, p_kind TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL OR NOT is_admin(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('house', 'teacher') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_kind');
  END IF;

  UPDATE author_seats SET kind = p_kind, updated_at = now() WHERE user_id = p_user;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_not_found');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION set_author_seat_kind(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_author_seat_kind(UUID, TEXT) TO authenticated;


-- The caller's own seat exists (any state). Studio's gate asks this so a
-- seated teacher with no course yet can open Studio and make one. A boolean,
-- not the row: the notes are the admin's.
CREATE OR REPLACE FUNCTION has_author_seat()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM author_seats s WHERE s.user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION has_author_seat() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION has_author_seat() TO authenticated;


-- ── 4. _is_teacher (re-emitted from 076) ────────────────────────────────
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
    OR EXISTS (SELECT 1 FROM author_seats WHERE user_id = p_user)
  );
$$;

REVOKE ALL ON FUNCTION _is_teacher(UUID) FROM PUBLIC, anon, authenticated;


-- ── 5. create_course (re-emitted from 067) ──────────────────────────────
-- Verbatim from 067 except the gate: admin, or an ACTIVE seat.
CREATE OR REPLACE FUNCTION create_course(p_slug TEXT, p_title TEXT, p_level TEXT, p_description TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       UUID := (SELECT auth.uid());
  v_is_admin BOOLEAN;
  v_id       UUID;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  v_is_admin := is_admin(v_me);
  IF NOT v_is_admin AND NOT _author_seat_active(v_me) THEN
    -- TCH-007: a lapsed seat is told so; no seat at all is simply forbidden.
    IF EXISTS (SELECT 1 FROM author_seats WHERE user_id = v_me) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_title');
  END IF;
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_slug');
  END IF;
  IF p_level IS NULL OR p_level NOT IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_level');
  END IF;
  IF EXISTS (SELECT 1 FROM courses WHERE slug = p_slug) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slug_taken');
  END IF;

  BEGIN
    INSERT INTO courses (slug, title, description, level, status, author_id)
    VALUES (p_slug, p_title, p_description, p_level, 'draft', v_me)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slug_taken');
  END;

  IF NOT v_is_admin THEN
    INSERT INTO course_editors (course_id, user_id, granted_by)
    VALUES (v_id, v_me, v_me);
  END IF;

  RETURN jsonb_build_object('ok', true, 'course_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION create_course(TEXT, TEXT, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION create_course(TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ── 6. Backfill ─────────────────────────────────────────────────────────
DO $$
DECLARE
  v_holders INTEGER;
  v_skipped INTEGER;
  v_added   INTEGER;
BEGIN
  SELECT count(DISTINCT ce.user_id)::INTEGER INTO v_holders FROM course_editors ce;
  SELECT count(DISTINCT ce.user_id)::INTEGER INTO v_skipped
    FROM course_editors ce JOIN profiles p ON p.id = ce.user_id WHERE p.deleted_at IS NOT NULL;

  INSERT INTO author_seats (user_id, kind, public_name, expires_at, notes, granted_by)
  SELECT p.id, 'teacher', COALESCE(NULLIF(left(btrim(p.display_name), 80), ''), 'Teacher'), NULL, NULL, NULL
  FROM profiles p
  WHERE p.deleted_at IS NULL
    AND p.id IN (SELECT ce.user_id FROM course_editors ce)
  ON CONFLICT (user_id) DO NOTHING;
  GET DIAGNOSTICS v_added = ROW_COUNT;

  RAISE NOTICE '082 backfill: % distinct course_editors holders, % on deleted accounts skipped, % seats added',
    v_holders, v_skipped, v_added;
END;
$$;


-- ── 7. Export and deletion ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION my_author_seat_export()
RETURNS TABLE (
  kind        TEXT,
  public_name TEXT,
  expires_at  TIMESTAMPTZ,
  notes       TEXT,
  created_at  TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.kind, s.public_name, s.expires_at, s.notes, s.created_at
  FROM author_seats s
  WHERE s.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION my_author_seat_export() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_author_seat_export() TO authenticated;


-- delete_my_account, re-emitted from 080 verbatim with one added DELETE,
-- marked TCH-007.
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
