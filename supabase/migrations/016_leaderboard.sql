-- ============================================================
-- 016_leaderboard.sql
--
-- Read paths for the casual XP leaderboards, on top of the economy in 015.
--
-- Why RPCs rather than a view + RLS policy: profiles is readable only by its
-- owner, by a linked tutor (006) and by group co-members (014). A board needs
-- one name and one number for people you have no relationship with, and
-- widening the profiles SELECT policy to "everyone" would expose every column
-- (full_name, city, role, streaks...) to every user. A SECURITY DEFINER
-- function returns exactly (rank, user_id, display_name, xp, tier) and nothing
-- else, so no policy has to be loosened. Same pattern as create_group /
-- accept_group_invite in 014.
--
-- The board shows display_name and NEVER full_name. full_name is what the
-- Dashboard profile form writes and is typically a real name; display_name is
-- repurposed here as the public handle.
--
-- Scopes:  'global' — everyone who has opted in
--          'group'  — co-members of p_group_id, ranked on the SAME global XP,
--                     so the two boards can never disagree
-- Windows: 'all' | '30d' | '7d'  (rolling, from results.taken_at)
-- Subject: NULL = all subjects; otherwise a subject id, and only results whose
--          quiz was single-subject count (mixed quizzes carry subject IS NULL
--          and appear on the all-subjects board only).
--
-- Safe to re-apply.
-- ============================================================


-- ── get_leaderboard: one page of standings ──────────────────
-- tier is reserved for the competitive ladder (017) and is NULL until then. It
-- is declared now so adding it later does not require dropping the function
-- (changing a RETURNS TABLE signature forces a DROP, which breaks any client
-- mid-deploy).
CREATE OR REPLACE FUNCTION get_leaderboard(
  p_scope    TEXT DEFAULT 'global',
  p_group_id UUID DEFAULT NULL,
  p_subject  TEXT DEFAULT NULL,
  p_window   TEXT DEFAULT 'all',
  p_limit    INT  DEFAULT 100,
  p_offset   INT  DEFAULT 0
)
RETURNS TABLE (
  rank         BIGINT,
  user_id      UUID,
  display_name TEXT,
  xp           BIGINT,
  tier         TEXT,
  is_me        BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_me    UUID := auth.uid();
  v_since TIMESTAMPTZ;
BEGIN
  -- Authenticated only: the board is not public.
  IF v_me IS NULL THEN
    RETURN;
  END IF;

  -- A group board is visible only to that group's members. Reuses 014's helper
  -- rather than re-implementing the membership check.
  IF p_scope = 'group' AND (p_group_id IS NULL OR NOT is_group_member(p_group_id, v_me)) THEN
    RETURN;
  END IF;

  v_since := CASE p_window
               WHEN '7d'  THEN NOW() - INTERVAL '7 days'
               WHEN '30d' THEN NOW() - INTERVAL '30 days'
               ELSE NULL
             END;

  RETURN QUERY
  WITH totals AS (
    SELECT r.user_id AS uid, SUM(r.xp_awarded)::BIGINT AS total
    FROM results r
    JOIN profiles pr ON pr.id = r.user_id
    WHERE r.leaderboard_eligible
      -- Opted-out users are removed BEFORE ranking, so the visible ranks are
      -- 1,2,3... with no unexplained gaps where a hidden user sits.
      AND NOT pr.leaderboard_opt_out
      AND (v_since IS NULL OR r.taken_at >= v_since)
      AND (p_subject IS NULL OR r.subject = p_subject)
      AND (
        p_scope <> 'group'
        OR EXISTS (
          SELECT 1 FROM group_members m
          WHERE m.group_id = p_group_id AND m.user_id = r.user_id
        )
      )
    GROUP BY r.user_id
    HAVING SUM(r.xp_awarded) > 0
  )
  SELECT
    RANK() OVER (ORDER BY t.total DESC)::BIGINT,
    t.uid,
    pr.display_name,
    t.total,
    NULL::TEXT,
    t.uid = v_me
  FROM totals t
  JOIN profiles pr ON pr.id = t.uid
  ORDER BY t.total DESC, pr.display_name
  LIMIT GREATEST(p_limit, 0) OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION get_leaderboard(TEXT, UUID, TEXT, TEXT, INT, INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_leaderboard(TEXT, UUID, TEXT, TEXT, INT, INT) TO authenticated;


-- ── get_my_rank: the caller's standing, at any depth ────────
-- Separate from get_leaderboard so the "you" row can be shown even when the
-- caller sits far outside the requested page. Returns no row when the caller
-- has no eligible XP in this scope/window, or has opted out — the UI reads an
-- empty result as "not on this board".
CREATE OR REPLACE FUNCTION get_my_rank(
  p_scope    TEXT DEFAULT 'global',
  p_group_id UUID DEFAULT NULL,
  p_subject  TEXT DEFAULT NULL,
  p_window   TEXT DEFAULT 'all'
)
RETURNS TABLE (
  rank         BIGINT,
  user_id      UUID,
  display_name TEXT,
  xp           BIGINT,
  tier         TEXT,
  total_ranked BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_me    UUID := auth.uid();
  v_since TIMESTAMPTZ;
BEGIN
  IF v_me IS NULL THEN
    RETURN;
  END IF;

  IF p_scope = 'group' AND (p_group_id IS NULL OR NOT is_group_member(p_group_id, v_me)) THEN
    RETURN;
  END IF;

  v_since := CASE p_window
               WHEN '7d'  THEN NOW() - INTERVAL '7 days'
               WHEN '30d' THEN NOW() - INTERVAL '30 days'
               ELSE NULL
             END;

  RETURN QUERY
  WITH totals AS (
    SELECT r.user_id AS uid, SUM(r.xp_awarded)::BIGINT AS total
    FROM results r
    JOIN profiles pr ON pr.id = r.user_id
    WHERE r.leaderboard_eligible
      AND NOT pr.leaderboard_opt_out
      AND (v_since IS NULL OR r.taken_at >= v_since)
      AND (p_subject IS NULL OR r.subject = p_subject)
      AND (
        p_scope <> 'group'
        OR EXISTS (
          SELECT 1 FROM group_members m
          WHERE m.group_id = p_group_id AND m.user_id = r.user_id
        )
      )
    GROUP BY r.user_id
    HAVING SUM(r.xp_awarded) > 0
  ),
  ranked AS (
    SELECT
      RANK() OVER (ORDER BY t.total DESC)::BIGINT AS rnk,
      COUNT(*) OVER ()::BIGINT                    AS field_size,
      t.uid,
      t.total
    FROM totals t
  )
  SELECT rk.rnk, rk.uid, pr.display_name, rk.total, NULL::TEXT, rk.field_size
  FROM ranked rk
  JOIN profiles pr ON pr.id = rk.uid
  WHERE rk.uid = v_me;
END;
$$;

REVOKE ALL ON FUNCTION get_my_rank(TEXT, UUID, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_my_rank(TEXT, UUID, TEXT, TEXT) TO authenticated;


-- ── subjects that actually have a board ─────────────────────
-- Only offer a subject filter for subjects with recorded eligible XP; most of
-- the 19 subjects in data/subjects.json have no questions at all, and a filter
-- that always returns nothing is worse than no filter.
CREATE OR REPLACE FUNCTION get_leaderboard_subjects()
RETURNS TABLE (subject TEXT, players BIGINT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT r.subject, COUNT(DISTINCT r.user_id)::BIGINT
  FROM results r
  JOIN profiles pr ON pr.id = r.user_id
  WHERE r.leaderboard_eligible
    AND r.subject IS NOT NULL
    AND NOT pr.leaderboard_opt_out
  GROUP BY r.subject
  ORDER BY COUNT(DISTINCT r.user_id) DESC, r.subject;
$$;

REVOKE ALL ON FUNCTION get_leaderboard_subjects() FROM public, anon;
GRANT EXECUTE ON FUNCTION get_leaderboard_subjects() TO authenticated;
