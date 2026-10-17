-- ============================================================
-- 087_teacher_course_grants.sql
--
-- TCH-009 (#223): a teacher opens a self-paced paid course for a linked student
-- who paid them outside the app, through course_entitlements (source 'grant').
-- The entitlement SQL function, can_read_lesson and every RLS policy are NOT
-- touched (docs/decisions/0141 Decision 5; choices made while writing this
-- file are in docs/decisions/0164).
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 086_calendar_feed.sql
--   latest body of the account-delete RPC   -> 086_calendar_feed.sql (NOT
--     re-emitted here: this file adds no user-keyed table; course_entitlements
--     is already deleted by it and read by the export)
-- REQUIRES 041 (course_entitlements), 058 (revoked_at, format), 076
-- (_teacher_linked), 082/083 (_studio_can_write).
--
-- ── 1. What a grant is ──────────────────────────────────────────────────
-- A row in course_entitlements with source = 'grant' and source_ref =
-- 'teacher:<the teacher's user id>'. That prefix is how a teacher-made grant is
-- told from an admin comp (source_ref NULL or free text) and from a purchase:
-- a teacher may revoke only rows that carry it. Revoking sets revoked_at and
-- keeps the row (058: "revoked_at IS NULL is the one rule everywhere"). Granting
-- again after a teacher's revoke clears revoked_at and restamps granted_at and
-- source_ref. A row revoked for any other reason (a refund, an admin) is never
-- reopened by a teacher.
--
-- ── 2. The two writes ───────────────────────────────────────────────────
-- teacher_grant_course(course, student) and teacher_revoke_course_grant(course,
-- student), SECURITY DEFINER, JSONB {ok, error?}. In this order, each refusal
-- its own code: unauthenticated; forbidden (the caller does not edit the course);
-- seat_lapsed (083: _studio_can_write, after the caller's own authorisation, so
-- a stranger still hears forbidden); cohort_course (a cohort course is opened by
-- runs and invites, 0141 Decision 5); not_linked (the student is not a LIVE link
-- of the caller, or the account is deleted). Grant only: has_access (the student
-- already has an active entitlement from another source), not_grantable (an
-- earlier entitlement was revoked by someone other than a teacher). Revoke only:
-- not_granted (no active teacher-made grant). Granting an already-active
-- teacher grant is ok with 'already': true and changes nothing.
--
-- ── 3. The two reads ────────────────────────────────────────────────────
-- teacher_grantable_courses(student): for a live linked student, every
-- self-paced course the caller edits with the student's state for it (none,
-- granted, other, revoked, unavailable). course_grantees(course): the linked
-- students the caller has an active teacher-made grant for on a course the caller
-- edits. A student whose link has ended drops out of both: the teacher no longer
-- sees them (0141 Decision 3), and the grant stays in place for the student.
-- Reads stay open to a frozen seat, as 083 leaves every read.
--
-- Not destructive: four new functions; no DROP, no TRUNCATE, no UPDATE or DELETE
-- of an existing row at migration time. (The RPC's own revoke UPDATE runs at
-- call time.) Safe to re-apply: CREATE OR REPLACE throughout.
-- ============================================================

BEGIN;

-- ── 1. teacher_grant_course ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION teacher_grant_course(p_course UUID, p_student UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me  UUID := (SELECT auth.uid());
  v_row course_entitlements%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF p_course IS NULL OR p_student IS NULL OR NOT can_edit_course(p_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  -- TCH-008: a lapsed (or absent) seat reads but does not write.
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM courses WHERE id = p_course AND format = 'self_paced') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cohort_course');
  END IF;
  IF NOT _teacher_linked(v_me, p_student)
     OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_student AND deleted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_linked');
  END IF;

  SELECT * INTO v_row
  FROM course_entitlements
  WHERE user_id = p_student AND course_id = p_course
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO course_entitlements (user_id, course_id, source, source_ref)
    VALUES (p_student, p_course, 'grant', 'teacher:' || v_me::text);
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF v_row.revoked_at IS NULL THEN
    IF v_row.source = 'grant' AND v_row.source_ref LIKE 'teacher:%' THEN
      RETURN jsonb_build_object('ok', true, 'already', true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'has_access');
  END IF;

  IF v_row.source = 'grant' AND v_row.source_ref LIKE 'teacher:%' THEN
    UPDATE course_entitlements
       SET revoked_at = NULL,
           granted_at = now(),
           source_ref = 'teacher:' || v_me::text
     WHERE user_id = p_student AND course_id = p_course;
    RETURN jsonb_build_object('ok', true);
  END IF;
  RETURN jsonb_build_object('ok', false, 'error', 'not_grantable');
END;
$$;

REVOKE ALL ON FUNCTION teacher_grant_course(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION teacher_grant_course(UUID, UUID) TO authenticated;


-- ── 2. teacher_revoke_course_grant ──────────────────────────────────────
CREATE OR REPLACE FUNCTION teacher_revoke_course_grant(p_course UUID, p_student UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := (SELECT auth.uid());
  v_n  INTEGER;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF p_course IS NULL OR p_student IS NULL OR NOT can_edit_course(p_course, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT _studio_can_write(v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_lapsed');
  END IF;
  IF NOT _teacher_linked(v_me, p_student)
     OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_student AND deleted_at IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_linked');
  END IF;

  UPDATE course_entitlements
     SET revoked_at = now()
   WHERE user_id = p_student
     AND course_id = p_course
     AND source = 'grant'
     AND source_ref LIKE 'teacher:%'
     AND revoked_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_granted');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION teacher_revoke_course_grant(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION teacher_revoke_course_grant(UUID, UUID) TO authenticated;


-- ── 3. teacher_grantable_courses ────────────────────────────────────────
-- state: 'granted'     an active teacher-made grant (revocable)
--        'other'       an active entitlement from a purchase or an admin
--        'revoked'     a teacher-made grant that was revoked (grantable again)
--        'unavailable' revoked by someone else (a teacher cannot reopen it)
--        'none'        no entitlement row (grantable)
CREATE OR REPLACE FUNCTION teacher_grantable_courses(p_student UUID)
RETURNS TABLE (
  course_id  UUID,
  title      TEXT,
  status     TEXT,
  state      TEXT,
  granted_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.title, c.status,
         CASE
           WHEN ce.user_id IS NULL THEN 'none'
           WHEN ce.revoked_at IS NULL AND ce.source = 'grant' AND ce.source_ref LIKE 'teacher:%' THEN 'granted'
           WHEN ce.revoked_at IS NULL THEN 'other'
           WHEN ce.source = 'grant' AND ce.source_ref LIKE 'teacher:%' THEN 'revoked'
           ELSE 'unavailable'
         END,
         CASE WHEN ce.revoked_at IS NULL THEN ce.granted_at END
  FROM courses c
  LEFT JOIN course_entitlements ce ON ce.course_id = c.id AND ce.user_id = p_student
  WHERE c.format = 'self_paced'
    AND can_edit_course(c.id, (SELECT auth.uid()))
    AND _teacher_linked((SELECT auth.uid()), p_student)
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = p_student AND p.deleted_at IS NULL)
  ORDER BY c.title, c.id;
$$;

REVOKE ALL ON FUNCTION teacher_grantable_courses(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION teacher_grantable_courses(UUID) TO authenticated;


-- ── 4. course_grantees ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION course_grantees(p_course UUID)
RETURNS TABLE (
  student_id UUID,
  granted_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ce.user_id, ce.granted_at
  FROM course_entitlements ce
  JOIN profiles p ON p.id = ce.user_id AND p.deleted_at IS NULL
  WHERE ce.course_id = p_course
    AND ce.source = 'grant'
    AND ce.source_ref LIKE 'teacher:%'
    AND ce.revoked_at IS NULL
    AND can_edit_course(p_course, (SELECT auth.uid()))
    AND _teacher_linked((SELECT auth.uid()), ce.user_id)
  ORDER BY ce.granted_at DESC, ce.user_id;
$$;

REVOKE ALL ON FUNCTION course_grantees(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION course_grantees(UUID) TO authenticated;

COMMIT;
