-- ============================================================
-- 102_course_import_grant.sql
--
-- AUTH-021 (#258): the admin-only grant that lets an author import a course
-- file from Studio (docs/decisions/0203 Decision 1). Only the grant is built
-- here; the pipeline that uses it is CNT-018 (migration 103).
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 101_telegram_homework_pings.sql
--   latest body of the account-delete RPC   -> 096_voice_analyses.sql
-- delete_my_account is NOT re-emitted: the grant is a column on author_seats,
-- and 082 already deletes the caller's whole seat row.
-- Re-emitted: author_seats_list (082; one more output column, so the function is
-- dropped and created again).
-- REQUIRES 082 (author_seats, _author_seat_active) and is_admin.
--
-- ── 1. The column ───────────────────────────────────────────────────────
-- author_seats.can_import, default FALSE: no existing seat gains it. A column
-- on the seat, not a grant table (0203 Decision 1): a single boolean, set only
-- by an admin through set_author_seat_import. author_seats has no grants and
-- no policy, so nothing but the functions below can write it.
--
-- ── 2. _can_import(user) ────────────────────────────────────────────────
-- is_admin(user) OR (the seat is ACTIVE AND can_import). A lapsed seat cannot
-- import, the same rule as _studio_can_write (083, 0155). NULL gives false.
-- REVOKEd from every app role, like _studio_can_write: CNT-018's
-- SECURITY DEFINER functions call it, and its storage policy calls
-- can_import_course() instead. can_import_course() is the same answer for the
-- caller, granted to authenticated, and is what Studio's pages ask.
--
-- ── 3. set_author_seat_import(user, on) ─────────────────────────────────
-- The 082 admin-RPC shape: is_admin check inside, {ok:false, error:'forbidden'}
-- otherwise, 'seat_not_found' for an unknown user.
--
-- ── 4. author_seats_list ────────────────────────────────────────────────
-- Returns can_import, so the seat card can show the switch.
--
-- Not destructive: no DROP TABLE or DROP COLUMN, no TRUNCATE, no UPDATE or
-- DELETE of an existing row. The one DROP FUNCTION is author_seats_list, which
-- is created again, with the same grants, in the same transaction.
--
-- Safe to re-apply: IF NOT EXISTS, DROP FUNCTION IF EXISTS then CREATE,
-- CREATE OR REPLACE.
-- ============================================================

BEGIN;

-- ── 1. The column ───────────────────────────────────────────────────────
ALTER TABLE author_seats ADD COLUMN IF NOT EXISTS can_import BOOLEAN NOT NULL DEFAULT FALSE;


-- ── 2. The predicate ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _can_import(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user IS NOT NULL AND (
    is_admin(p_user)
    OR (
      _author_seat_active(p_user)
      AND EXISTS (SELECT 1 FROM author_seats s WHERE s.user_id = p_user AND s.can_import)
    )
  );
$$;

REVOKE ALL ON FUNCTION _can_import(UUID) FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION can_import_course()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _can_import((SELECT auth.uid()));
$$;

REVOKE ALL ON FUNCTION can_import_course() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION can_import_course() TO authenticated;


-- ── 3. The admin switch ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_author_seat_import(p_user UUID, p_on BOOLEAN)
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
  IF p_on IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_value');
  END IF;

  UPDATE author_seats SET can_import = p_on, updated_at = now() WHERE user_id = p_user;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'seat_not_found');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION set_author_seat_import(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_author_seat_import(UUID, BOOLEAN) TO authenticated;


-- ── 4. author_seats_list, with can_import (re-emitted from 082) ─────────
-- A new output column changes the row type, which CREATE OR REPLACE cannot do.
DROP FUNCTION IF EXISTS author_seats_list();

CREATE FUNCTION author_seats_list()
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
  linked_students INTEGER,
  can_import      BOOLEAN
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
      WHERE l.teacher_id = s.user_id AND l.ended_at IS NULL),
    s.can_import
  FROM author_seats s
  ORDER BY (s.kind = 'house') DESC, lower(s.public_name), s.user_id;
END;
$$;

REVOKE ALL ON FUNCTION author_seats_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION author_seats_list() TO authenticated;

COMMIT;
