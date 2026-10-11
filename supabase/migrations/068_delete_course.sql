-- ============================================================
-- 068_delete_course.sql
--
-- AUTH-018 (docs/decisions/0125 Decision 8). An editor deletes a draft
-- course nobody has played. Choices made while writing this are in
-- docs/decisions/0129.
--
-- Print rule (scripts/board/backlog.mjs, M3 section header), at write time
-- and again before commit:
--   latest migration before this one        -> 067_editor_create_course.sql
--   latest body of the account-delete RPC   -> 061_run_final_comments.sql
-- Re-emitted bodies: none. delete_my_account is NOT touched: no new table,
-- no new user-keyed row. The access function is NOT touched.
--
-- ── Why a guard, not the schema ─────────────────────────────────────────
-- Every foreign key into courses, lessons, lesson_versions and course_runs
-- is ON DELETE CASCADE, except signup_acquisitions.course_id (053, SET
-- NULL). A bare DELETE FROM courses would take learner data with it. The
-- blocker list below is that FK list, derived at work time with
--   rg -n -i "REFERENCES\s+[a-z_.\"]*(courses|lessons|lesson_versions|course_runs)\b" supabase/migrations
-- and cross-checked against pg_constraint on the local stack (both in
-- #186's evidence). Each referencing table is one of:
--
--   the course's own authoring structure, deleted with it, NOT a blocker:
--     lessons.course_id                     041  CASCADE
--     lesson_versions.lesson_id             041  CASCADE
--     lessons.published_version_id          041  SET NULL (self-reference)
--     course_editors.course_id              029  CASCADE
--     course_runs.course_id                 058  CASCADE
--     run_calls.run_id                      058  CASCADE
--
--   learner or learner-facing data, a BLOCKER (reason code in brackets):
--     course_entitlements.course_id         041  CASCADE   [entitlements]
--     run_enrolments.run_id                 058  CASCADE   [enrolments]
--     run_invites.run_id                    059  CASCADE   [invites]
--     voice_submissions.course_id/lesson_id/lesson_version_id
--                                           060  CASCADE   [recordings]
--     run_final_comments.course_id/run_id   061  CASCADE   [final_comments]
--     lesson_attempts.lesson_version_id     048  CASCADE   [attempts]
--     lesson_opens.lesson_id                056  CASCADE   [opens]
--     signup_acquisitions.course_id         053  SET NULL  [signups]
--
--   plus two that are not a referencing row:
--     courses.status = 'published'                         [published]
--     an unexpired pending_claims row (049) whose JSON payload names one of
--     the course's lesson versions. No FK (the payload is JSONB), but it is
--     an anonymous learner's attempts waiting for their sign-up to claim
--     them, which a delete would make unclaimable.     [pending_claims]
--
-- voice_feedback (060) references voice_submissions, and run_invites /
-- voice_submissions / run_final_comments also reference run_enrolments;
-- all are covered because their parent row is itself a blocker.
--
-- ── 1. course_delete_blockers ───────────────────────────────────────────
-- Returns { ok, blockers: [reason, ...] } in a fixed order; an empty array
-- means deletable. Gated on can_edit_course before anything else is
-- revealed (058's convention). The course editor calls it to decide
-- between the delete dialog and the muted "can't be deleted" line; the
-- delete itself re-checks through the same function.
--
-- ── 2. delete_course(course, confirm title) ─────────────────────────────
-- Locks the course row FOR UPDATE, then the course's lessons, versions and
-- runs FOR UPDATE. Every insert that would create a blocker row takes a
-- FOR KEY SHARE lock on the row it references (courses for an entitlement
-- or a sign-up, lessons for an open, lesson_versions for an attempt or a
-- recording, course_runs for an enrolment or an invite), and FOR KEY SHARE
-- conflicts with FOR UPDATE. So no blocker row can appear between the
-- re-check and the DELETE: a concurrent insert waits, then fails its FK
-- check once the row is gone. pending_claims has no FK and is not covered
-- by this; see 0129.
--
-- The confirm title is compared after btrim, case-sensitively: it is what
-- the author typed off the screen.
--
-- Runs are deleted before the course. lessons_recompute_run_ends (058) is
-- an AFTER DELETE trigger on lessons that UPDATEs the course's upcoming
-- runs; deleting the runs first means the cascade's lesson deletes find no
-- run to touch, instead of relying on the cascade's internal order.
--
-- Storage is NOT touched here: the route purges <course_id>/ from the
-- lesson-images bucket after this returns ok (the account-delete
-- precedent: SQL first, objects second).
--
-- 0124's invariant holds: a course with any entitlement or enrolment row,
-- revoked or not, is refused, so this never removes an entitled learner's
-- access. delete_course joins 0124's inventory.
--
-- Per the house rule, this file is written and handed off; migrations are
-- applied by the owner, never by a session.
--
-- Safe to re-apply: CREATE OR REPLACE, then REVOKE/GRANT, both idempotent.
-- ============================================================

BEGIN;

-- ── 1. course_delete_blockers ───────────────────────────────────────────
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


-- ── 2. delete_course ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION delete_course(p_course_id UUID, p_confirm_title TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     UUID := (SELECT auth.uid());
  v_title  TEXT;
  v_check  JSONB;
BEGIN
  IF NOT can_edit_course(p_course_id, v_me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT title INTO v_title FROM courses WHERE id = p_course_id FOR UPDATE;
  IF v_title IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'course_not_found');
  END IF;
  IF p_confirm_title IS NULL OR btrim(p_confirm_title) <> btrim(v_title) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'title_mismatch');
  END IF;

  -- Hold every row a blocker insert would reference (header, section 2).
  PERFORM 1 FROM lessons WHERE course_id = p_course_id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM lesson_versions v JOIN lessons l ON l.id = v.lesson_id
    WHERE l.course_id = p_course_id ORDER BY v.id FOR UPDATE OF v;
  PERFORM 1 FROM course_runs WHERE course_id = p_course_id ORDER BY id FOR UPDATE;

  v_check := course_delete_blockers(p_course_id);
  IF NOT (v_check->>'ok')::BOOLEAN THEN
    RETURN v_check;
  END IF;
  IF jsonb_array_length(v_check->'blockers') > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_deletable', 'blockers', v_check->'blockers');
  END IF;

  DELETE FROM course_runs WHERE course_id = p_course_id;
  DELETE FROM courses WHERE id = p_course_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION delete_course(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION delete_course(UUID, TEXT) TO authenticated;

COMMIT;
