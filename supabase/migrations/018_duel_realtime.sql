-- ============================================================
-- 018_duel_realtime.sql
--
-- Makes the duel loop live and transparent. Three changes, all additive:
--
--   1. Publish the notifications table on supabase_realtime, so the client can
--      subscribe to its own new rows. This is the app's FIRST realtime usage —
--      every duel transition already writes a notification to the user who
--      cares (challenge → opponent, accept/decline → challenger, resolve →
--      both), so one subscription on notifications INSERTs is enough to drive a
--      toast, the bell dot, and a router.refresh() that re-renders every open
--      server surface. Delivery is scoped by the existing owner-read RLS policy
--      on notifications (010), so a client only ever receives its own rows.
--
--   2. A lapsed pending challenge now notifies the challenger (duel_expired).
--      Previously expire_duels flipped it to 'expired' silently.
--
--   3. start_duel_leg_for_quiz returns the duel context (started_at, limit,
--      deadline, opponent) instead of VOID, so the quiz page can render a
--      "Duel vs X" banner and a live countdown without a second round-trip.
--
-- Safe to re-apply.
--
-- Run via Supabase SQL Editor, or:
--   npx supabase db push
-- ============================================================


-- ── 1. Realtime on notifications ────────────────────────────
-- Idempotent: ADD TABLE errors if the table is already a member, so guard on
-- pg_publication_tables. Default replica identity is sufficient — we only
-- subscribe to INSERT, which carries the full new row.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;


-- ── 2. expire_duels: notify the challenger on a lapsed challenge ──
-- Same lazy sweep as 017 (no pg_cron in this project), with the pending-expire
-- branch turned into a loop that emits duel_expired. The active-overdue branch
-- is unchanged: it resolves directly, and resolve_duel already notifies both.
CREATE OR REPLACE FUNCTION expire_duels()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d RECORD;
BEGIN
  -- Accepted-but-overdue duels forfeit and resolve (duel_resolved to both).
  FOR d IN
    SELECT id FROM duels
    WHERE status = 'active' AND deadline_at IS NOT NULL AND NOW() >= deadline_at
  LOOP
    PERFORM resolve_duel(d.id);
  END LOOP;

  -- A challenge nobody answered within a week lapses; no rating changes, but
  -- the challenger is told rather than left to wonder.
  FOR d IN
    SELECT id, challenger_id FROM duels
    WHERE status = 'pending' AND created_at < NOW() - INTERVAL '7 days'
  LOOP
    UPDATE duels SET status = 'expired', resolved_at = NOW() WHERE id = d.id;
    PERFORM notify(d.challenger_id, 'duel_expired', jsonb_build_object('duel_id', d.id));
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION expire_duels() FROM public, anon;
GRANT EXECUTE ON FUNCTION expire_duels() TO authenticated;


-- ── 3. start_duel_leg_for_quiz: stamp the clock AND return context ──
-- Return type changes from VOID to JSONB, which CREATE OR REPLACE cannot do, so
-- drop first. Behaviour is otherwise the 017 function: idempotent clock stamp
-- (COALESCE keeps the original start on resume), silent no-op for an ordinary
-- quiz — now reported as { is_duel: false }. When it IS a duel leg it returns
-- the fields the quiz page needs for the banner and the server-anchored
-- countdown (started_at + time_limit_seconds).
DROP FUNCTION IF EXISTS start_duel_leg_for_quiz(TEXT);

CREATE FUNCTION start_duel_leg_for_quiz(p_quiz_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       UUID := auth.uid();
  v_duel     UUID;
  v_started  TIMESTAMPTZ;
  v_limit    INT;
  v_deadline TIMESTAMPTZ;
  v_opp      TEXT;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('is_duel', false);
  END IF;

  -- Stamp started_at idempotently and capture the duel's clock fields in one
  -- statement. RETURNING may reference the FROM-joined duels row.
  UPDATE duel_participants dp
  SET started_at = COALESCE(dp.started_at, NOW())
  FROM duels d
  WHERE d.id = dp.duel_id
    AND d.quiz_id = p_quiz_id
    AND d.status = 'active'
    AND dp.user_id = v_me
    AND dp.submitted_at IS NULL
  RETURNING d.id, dp.started_at, d.time_limit_seconds, d.deadline_at
  INTO v_duel, v_started, v_limit, v_deadline;

  IF v_duel IS NULL THEN
    RETURN jsonb_build_object('is_duel', false);
  END IF;

  SELECT COALESCE(op.display_name, 'A learner')
  INTO v_opp
  FROM duels d
  JOIN profiles op
    ON op.id = CASE WHEN d.challenger_id = v_me THEN d.opponent_id ELSE d.challenger_id END
  WHERE d.id = v_duel;

  RETURN jsonb_build_object(
    'is_duel', true,
    'duel_id', v_duel,
    'started_at', v_started,
    'time_limit_seconds', v_limit,
    'deadline_at', v_deadline,
    'opponent_name', v_opp
  );
END;
$$;

REVOKE ALL ON FUNCTION start_duel_leg_for_quiz(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION start_duel_leg_for_quiz(TEXT) TO authenticated;
