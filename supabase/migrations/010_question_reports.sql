-- ============================================================
-- 010_question_reports.sql
--
-- Lets any user report a "bad" question they hit during a quiz, and
-- gives admins a moderation queue to edit / remove / dismiss it:
--   • question_reports table (category + optional comment + the answer
--     the reporter had selected), one OPEN report per (user, question)
--   • notifications table (generic stub for a future notification center;
--     a "report_resolved" row is written per reporter when a report closes)
--   • resolve_question_reports() RPC: atomically closes all open reports on
--     a question, optionally rejects the question, and notifies reporters
--
-- Reported questions stay in the public pool (status = 'approved') until an
-- admin acts — reporting alone never pulls a question.
--
-- Safe to re-apply: all operations are idempotent.
--
-- Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================


-- ── question_reports ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS question_reports (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id     TEXT        NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  category        TEXT        NOT NULL
                    CHECK (category IN ('wrong_answer', 'unclear', 'typo', 'outdated', 'other')),
  comment         TEXT,
  -- The option the reporter had selected, stored as answer TEXT (not the
  -- per-quiz shuffled index, which is meaningless out of context). NULL if
  -- they reported before answering.
  reported_answer TEXT,
  status          TEXT        NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'resolved')),
  resolution      TEXT        CHECK (resolution IN ('edited', 'removed', 'dismissed')),
  admin_note      TEXT,
  resolved_by     UUID        REFERENCES profiles(id),
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A report has a resolution iff it is resolved.
  CHECK ((status = 'open') = (resolution IS NULL))
);

-- One OPEN report per (user, question). A user can report again only after
-- the previous report has been resolved (e.g. the admin's fix didn't work).
CREATE UNIQUE INDEX IF NOT EXISTS question_reports_one_open
  ON question_reports (user_id, question_id) WHERE status = 'open';

-- Admin queue lookup: open reports fetched and grouped by question.
CREATE INDEX IF NOT EXISTS question_reports_open_by_question_idx
  ON question_reports (question_id, created_at) WHERE status = 'open';

ALTER TABLE question_reports ENABLE ROW LEVEL SECURITY;

-- Reporters may file a report as themselves and read their own reports.
-- Resolution happens only through resolve_question_reports() (SECURITY
-- DEFINER), so there is deliberately no user UPDATE/DELETE policy.
DROP POLICY IF EXISTS "question_reports: reporter insert"   ON question_reports;
CREATE POLICY "question_reports: reporter insert"
  ON question_reports FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "question_reports: reporter read own" ON question_reports;
CREATE POLICY "question_reports: reporter read own"
  ON question_reports FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "question_reports: admin all" ON question_reports;
CREATE POLICY "question_reports: admin all"
  ON question_reports FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ── notifications (generic stub) ────────────────────────────
-- A future notification center reads from here. For now the only writer is
-- resolve_question_reports() (type = 'report_resolved'). Kept intentionally
-- generic (type + payload JSONB) so other features can write their own kinds.
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  payload    JSONB       NOT NULL DEFAULT '{}',
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx
  ON notifications (user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Owners read their notifications and may only flip read_at (never forge
-- type/payload). Column-scoped UPDATE mirrors the profiles/assignments trick.
-- There is no user INSERT policy: rows are written only by the definer RPC.
REVOKE UPDATE ON notifications FROM authenticated;
GRANT UPDATE (read_at) ON notifications TO authenticated;

DROP POLICY IF EXISTS "notifications: owner read"   ON notifications;
CREATE POLICY "notifications: owner read"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications: owner update" ON notifications;
CREATE POLICY "notifications: owner update"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── resolve_question_reports: close a question's open reports ─
-- SECURITY DEFINER so a single admin action can, in one transaction:
--   1. mark every open report on the question resolved,
--   2. (if removed) reject the question so it leaves the sampling pool,
--   3. notify each distinct reporter (notifications has no user INSERT policy).
-- Resolving happens BEFORE the question is touched, so a double-click or a
-- second concurrent admin gets 'no_open_reports' and never re-rejects or
-- double-notifies.
CREATE OR REPLACE FUNCTION resolve_question_reports(
  p_question_id TEXT,
  p_resolution  TEXT,
  p_note        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin   UUID := auth.uid();
  v_snippet TEXT;
  v_users   UUID[];
BEGIN
  IF v_admin IS NULL OR NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_admin AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_resolution NOT IN ('edited', 'removed', 'dismissed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_resolution');
  END IF;

  SELECT left(question, 120) INTO v_snippet FROM questions WHERE id = p_question_id;
  IF v_snippet IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'question_not_found');
  END IF;

  WITH resolved AS (
    UPDATE question_reports
    SET status      = 'resolved',
        resolution  = p_resolution,
        admin_note  = p_note,
        resolved_by = v_admin,
        resolved_at = NOW()
    WHERE question_id = p_question_id AND status = 'open'
    RETURNING user_id
  )
  SELECT array_agg(DISTINCT user_id) INTO v_users FROM resolved;

  IF v_users IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_open_reports');
  END IF;

  IF p_resolution = 'removed' THEN
    UPDATE questions
    SET status = 'rejected', reviewed_at = NOW(), reviewed_by = v_admin
    WHERE id = p_question_id;
  END IF;

  INSERT INTO notifications (user_id, type, payload)
  SELECT unnest(v_users), 'report_resolved',
         jsonb_build_object(
           'question_id',      p_question_id,
           'question_snippet', v_snippet,
           'resolution',       p_resolution,
           'note',             p_note
         );

  RETURN jsonb_build_object('ok', true, 'resolved_count', cardinality(v_users));
END;
$$;

REVOKE ALL ON FUNCTION resolve_question_reports(TEXT, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION resolve_question_reports(TEXT, TEXT, TEXT) TO authenticated;
