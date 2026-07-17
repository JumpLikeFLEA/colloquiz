-- ============================================================
-- 013_notification_triggers.sql
--
-- Turns the generic notifications stub (010) into a working notification
-- center by wiring the app's key events to it via DB triggers. Triggers are
-- used instead of app-layer writes because notifications has no user INSERT
-- policy (INSERT is not granted to authenticated) — a SECURITY DEFINER path is
-- the only way to write a row, and doing it in-database keeps the write
-- unforgeable and independent of which API route caused the event.
--
-- MVP notification types written here (report_resolved is already written by
-- resolve_question_reports() in 010 and is left untouched):
--   • invite_accepted     → tutor, when a student accepts their invite
--   • assignment_created   → student, when a tutor assigns them a quiz
--   • assignment_completed → tutor, when a student completes an assignment
--   • achievement_unlocked → learner, when an achievement row is inserted
--   • question_reviewed    → author, when their question leaves 'pending'
--
-- Safe to re-apply: all operations are idempotent.
--
-- Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================


-- ── notify(): the single privileged writer ──────────────────
-- SECURITY DEFINER so it can INSERT into notifications (no user INSERT policy).
-- Also opportunistically caps each user's row count at the newest 50, so the
-- table is self-maintaining with no scheduled job. Not granted to any client
-- role — it is called only from the SECURITY DEFINER trigger functions below.
CREATE OR REPLACE FUNCTION notify(
  p_user_id UUID,
  p_type    TEXT,
  p_payload JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO notifications (user_id, type, payload)
  VALUES (p_user_id, p_type, p_payload);

  -- Opportunistic purge: keep only this user's newest 50 rows.
  DELETE FROM notifications
  WHERE user_id = p_user_id
    AND id NOT IN (
      SELECT id FROM notifications
      WHERE user_id = p_user_id
      ORDER BY created_at DESC
      LIMIT 50
    );
END;
$$;

REVOKE ALL ON FUNCTION notify(UUID, TEXT, JSONB) FROM public, anon, authenticated;


-- ── invite_accepted → tutor ─────────────────────────────────
-- Fires only when a link row is actually inserted (accept_tutor_invite's
-- ON CONFLICT DO NOTHING makes a re-accept a no-op, so no duplicate notice).
CREATE OR REPLACE FUNCTION tg_notify_invite_accepted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_name TEXT;
BEGIN
  SELECT COALESCE(display_name, full_name, 'A student')
  INTO v_student_name
  FROM profiles WHERE id = NEW.student_id;

  PERFORM notify(NEW.tutor_id, 'invite_accepted', jsonb_build_object(
    'student_id',   NEW.student_id,
    'student_name', v_student_name
  ));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_invite_accepted ON tutor_students;
CREATE TRIGGER notify_invite_accepted
  AFTER INSERT ON tutor_students
  FOR EACH ROW EXECUTE FUNCTION tg_notify_invite_accepted();


-- ── assignment_created → student ────────────────────────────
CREATE OR REPLACE FUNCTION tg_notify_assignment_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz_title TEXT;
  v_tutor_name TEXT;
BEGIN
  SELECT title INTO v_quiz_title FROM quizzes  WHERE id = NEW.quiz_id;
  SELECT COALESCE(full_name, display_name, 'Your tutor')
  INTO v_tutor_name FROM profiles WHERE id = NEW.tutor_id;

  PERFORM notify(NEW.student_id, 'assignment_created', jsonb_build_object(
    'assignment_id', NEW.id,
    'quiz_id',       NEW.quiz_id,
    'quiz_title',    v_quiz_title,
    'tutor_name',    v_tutor_name,
    'due_at',        NEW.due_at
  ));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_assignment_created ON assignments;
CREATE TRIGGER notify_assignment_created
  AFTER INSERT ON assignments
  FOR EACH ROW EXECUTE FUNCTION tg_notify_assignment_created();


-- ── assignment_completed → tutor ────────────────────────────
CREATE OR REPLACE FUNCTION tg_notify_assignment_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz_title   TEXT;
  v_student_name TEXT;
BEGIN
  SELECT title INTO v_quiz_title FROM quizzes  WHERE id = NEW.quiz_id;
  SELECT COALESCE(display_name, full_name, 'A student')
  INTO v_student_name FROM profiles WHERE id = NEW.student_id;

  PERFORM notify(NEW.tutor_id, 'assignment_completed', jsonb_build_object(
    'assignment_id', NEW.id,
    'quiz_id',       NEW.quiz_id,
    'quiz_title',    v_quiz_title,
    'student_id',    NEW.student_id,
    'student_name',  v_student_name,
    'result_id',     NEW.result_id
  ));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_assignment_completed ON assignments;
CREATE TRIGGER notify_assignment_completed
  AFTER UPDATE ON assignments
  FOR EACH ROW
  WHEN (OLD.status = 'assigned' AND NEW.status = 'completed')
  EXECUTE FUNCTION tg_notify_assignment_completed();


-- ── achievement_unlocked → learner ──────────────────────────
-- Payload carries only the id; the client renders title/icon/xp from the
-- ACHIEVEMENTS table in lib/achievements.ts. Streak milestones are covered
-- here too (streak_3 / streak_7 / streak_30 are achievements).
CREATE OR REPLACE FUNCTION tg_notify_achievement_unlocked()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM notify(NEW.user_id, 'achievement_unlocked', jsonb_build_object(
    'achievement_id', NEW.achievement_id
  ));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_achievement_unlocked ON user_achievements;
CREATE TRIGGER notify_achievement_unlocked
  AFTER INSERT ON user_achievements
  FOR EACH ROW EXECUTE FUNCTION tg_notify_achievement_unlocked();


-- ── question_reviewed → author ──────────────────────────────
-- Only when a pending question is approved/rejected, the question has an
-- author, and the reviewer is not that author (an admin reviewing their own
-- submission gets no self-notice). WHEN handles all the gating.
CREATE OR REPLACE FUNCTION tg_notify_question_reviewed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM notify(NEW.created_by, 'question_reviewed', jsonb_build_object(
    'question_id',      NEW.id,
    'question_snippet', left(NEW.question, 80),
    'status',           NEW.status,
    'critic_notes',     NEW.critic_notes
  ));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_question_reviewed ON questions;
CREATE TRIGGER notify_question_reviewed
  AFTER UPDATE ON questions
  FOR EACH ROW
  WHEN (
    OLD.status = 'pending'
    AND NEW.status IN ('approved', 'rejected')
    AND NEW.created_by IS NOT NULL
    AND NEW.created_by IS DISTINCT FROM NEW.reviewed_by
  )
  EXECUTE FUNCTION tg_notify_question_reviewed();
