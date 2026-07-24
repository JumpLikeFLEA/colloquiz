-- ============================================================
-- 019_duel_cancel.sql
--
-- Lets the challenger withdraw a pending duel they sent (e.g. a misclick, or
-- wanting a different opponent). respond_to_duel is opponent-only, so the
-- challenger had no way out — the pair stayed blocked by the one-open-duel-per-
-- pair rule until the 7-day expiry.
--
-- A cancelled duel is a new terminal state, so:
--   • it leaves the (pending/active) "open" set → the pair can be re-challenged
--     immediately and the /duels picker re-enables that member;
--   • the row still EXISTS, so the opponent's existing duel_challenge
--     notification still resolves to a page (showing "withdrawn") instead of 404;
--   • the opponent is notified, so a challenge sitting on their screen clears
--     live like every other duel transition.
--
-- Safe to re-apply.
-- ============================================================


-- ── 'cancelled' status ──────────────────────────────────────
-- The inline CHECK from 017 is auto-named duels_status_check. Replace it.
ALTER TABLE duels DROP CONSTRAINT IF EXISTS duels_status_check;
ALTER TABLE duels ADD CONSTRAINT duels_status_check
  CHECK (status IN ('pending', 'active', 'resolved', 'declined', 'expired', 'cancelled'));


-- ── cancel_duel: the challenger withdraws a pending challenge ─
CREATE OR REPLACE FUNCTION cancel_duel(p_duel_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_d  duels%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_d FROM duels WHERE id = p_duel_id;
  -- Only the challenger may cancel, and only while it is still pending: once
  -- accepted (active) it is a real match and resolves through the normal path.
  IF v_d.id IS NULL OR v_d.challenger_id <> v_me OR v_d.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_cancelable');
  END IF;

  UPDATE duels SET status = 'cancelled', resolved_at = NOW() WHERE id = p_duel_id;

  PERFORM notify(v_d.opponent_id, 'duel_cancelled', jsonb_build_object(
    'duel_id', p_duel_id,
    'by', (SELECT COALESCE(display_name, 'Your opponent') FROM profiles WHERE id = v_me)
  ));

  RETURN jsonb_build_object('ok', true, 'status', 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION cancel_duel(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION cancel_duel(UUID) TO authenticated;
