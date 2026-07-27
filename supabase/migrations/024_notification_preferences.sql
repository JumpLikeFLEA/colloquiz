-- ============================================================
-- 024_notification_preferences.sql
--
-- Settings > Notifications: per-user, per-event delivery preferences.
--
-- THE GATE IS AT WRITE TIME, NOT READ TIME. notify() (013) is the single
-- privileged writer for every notification in the app, so checking the
-- preference there means a muted event produces NO ROW AT ALL. That matters
-- because the bell is not the only consumer: DuelRealtime subscribes to
-- notifications INSERTs and fires a sonner toast plus a router.refresh() on
-- every row. Filtering in the bell's query would leave the toast popping up for
-- an event the user just turned off — a preference that visibly does nothing.
-- No row means no bell entry, no unread count, no toast, no refresh.
--
-- The cost of write-time gating is that muting is not retroactive and not
-- reversible: notifications missed while an event was off are never
-- backfilled. That is the ordinary meaning of turning a notification off.
--
-- DEFAULTS ARE IMPLIED BY ABSENCE. No row means "in-app on", so a new user is
-- correct with zero rows written, existing users need no backfill, and the
-- signup trigger stays untouched. A row is written only when a user actually
-- changes something.
--
-- NO EMAIL COLUMN, DELIBERATELY. The app sends no transactional email for any
-- of these events — there is no mail dependency, no edge function and no
-- webhook; the only mail is Supabase Auth's own confirmation/reset. Storing an
-- email preference would be storing a value nothing reads. The UI shows the
-- column disabled with the reason. When email delivery is built, add the
-- BOOLEAN column here and enable the column there.
--
-- ⚠ THIS FILE REDEFINES notify() FROM 013. Re-applying 013 afterwards would
-- silently restore the ungated version and every muted notification would come
-- back. If you edit notify() again, edit the copy below.
--
-- Safe to re-apply: all operations are idempotent.
--
-- Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================


-- ── notification_preferences ────────────────────────────────
-- One row per (user, event) the user has changed. Sparse on purpose: see the
-- note on defaults above.
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event      TEXT        NOT NULL CHECK (event IN (
                           'duel_challenge',
                           'duel_result',
                           'group_activity',
                           'achievement',
                           'quiz_received'
                         )),
  in_app     BOOLEAN     NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, event)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Owner-only, split by verb so INSERT gets a WITH CHECK. A single FOR ALL
-- USING(...) policy would leave INSERT unprotected — USING is not consulted for
-- inserts — which is how a user could write a row against someone else's id.
DROP POLICY IF EXISTS "notification_preferences: owner read" ON notification_preferences;
CREATE POLICY "notification_preferences: owner read"
  ON notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notification_preferences: owner insert" ON notification_preferences;
CREATE POLICY "notification_preferences: owner insert"
  ON notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notification_preferences: owner update" ON notification_preferences;
CREATE POLICY "notification_preferences: owner update"
  ON notification_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Table-level privileges are checked BEFORE RLS, so the policies above do
-- nothing without these. No DELETE: turning a preference back on writes
-- in_app = TRUE rather than removing the row, so the client needs no delete.
GRANT SELECT, INSERT, UPDATE ON notification_preferences TO authenticated;


-- ── notification type → preference key ──────────────────────
-- THE SOURCE OF TRUTH for which notification types a preference covers.
-- lib/notificationPrefs.ts describes these groupings in the UI copy; keep the
-- two in step.
--
-- A type that maps to NULL is ungated and always delivered. That is the right
-- default for the types with no preference row in the matrix — question
-- verdicts, tutor-side notices, resolved reports: silently dropping those would
-- be a bug, not a preference.
--
-- ⚠ 'report_resolved' is the one type that does NOT go through notify() —
-- resolve_question_reports() (010) INSERTs into notifications directly. It is
-- ungated today so that makes no difference, but adding it to the map below
-- would NOT gate it. Route it through notify() first if it ever needs a
-- preference.
CREATE OR REPLACE FUNCTION notification_pref_key(p_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_type
    -- "Duel challenges": the challenge itself, and the reply that turns it
    -- into your move to make.
    WHEN 'duel_challenge'      THEN 'duel_challenge'
    WHEN 'duel_accepted'       THEN 'duel_challenge'
    -- "Duel results": every way a duel ends. Grouped so muting results does
    -- not leave decline/expire/cancel leaking through.
    WHEN 'duel_resolved'       THEN 'duel_result'
    WHEN 'duel_declined'       THEN 'duel_result'
    WHEN 'duel_expired'        THEN 'duel_result'
    WHEN 'duel_cancelled'      THEN 'duel_result'
    -- "Group activity": groups are joined by link, so there is no invite
    -- notification to gate — this is the owner-side "someone joined".
    WHEN 'group_member_joined' THEN 'group_activity'
    WHEN 'achievement_unlocked' THEN 'achievement'
    -- "Quizzes sent to me": the dormant tutor assignment path and the live
    -- group share path both land here.
    WHEN 'assignment_created'  THEN 'quiz_received'
    WHEN 'quiz_shared'         THEN 'quiz_received'
    ELSE NULL
  END;
$$;


-- ── notify(): 013's writer, now preference-aware ────────────
-- Unchanged from 013 except for the preference check. SECURITY DEFINER runs as
-- the table owner, which bypasses RLS, so it can read any recipient's row —
-- and if that read somehow returned nothing the EXISTS is false and the
-- notification is DELIVERED. Failing open is the right direction here: a
-- surplus notification is noise, a dropped one is lost information.
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
DECLARE
  v_key TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  v_key := notification_pref_key(p_type);
  IF v_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM notification_preferences
    WHERE user_id = p_user_id
      AND event   = v_key
      AND in_app  = FALSE
  ) THEN
    RETURN;                                   -- muted: write nothing at all
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
