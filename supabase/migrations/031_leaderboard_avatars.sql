-- ============================================================
-- 031_leaderboard_avatars.sql
--
-- Adds profiles.avatar_url to the three roster-reading RPCs so leaderboard
-- rows can render the uploaded picture instead of always falling back to the
-- initials chip. Before this, only the sidebar (which reads its own profile
-- row directly) picked up a new avatar — a user who changed their picture in
-- Settings still saw the "letter" avatar next to their own name on every
-- leaderboard, and so did everyone else.
--
-- The three functions each return a fresh column, so their RETURNS TABLE
-- signature changes. That is not a CREATE OR REPLACE-safe change — Postgres
-- requires the same OUT columns — so each one is DROPped first. The window is
-- a single deploy race; there is no long-lived caller mid-request that would
-- notice.
--
-- avatar_url is a public storage URL (migration 022). It is not sensitive —
-- profiles.avatar_url is column-granted UPDATE only, and the bucket is public
-- read by design — so returning it alongside display_name is no leak.
--
-- Safe to re-apply.
-- ============================================================


-- ── get_leaderboard: casual XP board ────────────────────────
DROP FUNCTION IF EXISTS get_leaderboard(TEXT, UUID, TEXT, TEXT, INT, INT);
CREATE FUNCTION get_leaderboard(
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
  avatar_url   TEXT,
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
  )
  SELECT
    RANK() OVER (ORDER BY t.total DESC)::BIGINT,
    t.uid,
    pr.display_name,
    pr.avatar_url,
    t.total,
    CASE WHEN plr.user_id IS NULL THEN NULL
         ELSE NULLIF(tier_for(plr.rating, plr.matches_played), 'unranked') END,
    t.uid = v_me
  FROM totals t
  JOIN profiles pr ON pr.id = t.uid
  LEFT JOIN player_ratings plr ON plr.user_id = t.uid
  ORDER BY t.total DESC, pr.display_name
  LIMIT GREATEST(p_limit, 0) OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION get_leaderboard(TEXT, UUID, TEXT, TEXT, INT, INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_leaderboard(TEXT, UUID, TEXT, TEXT, INT, INT) TO authenticated;


-- ── get_my_rank: the caller's row when they sit outside the page ─
DROP FUNCTION IF EXISTS get_my_rank(TEXT, UUID, TEXT, TEXT);
CREATE FUNCTION get_my_rank(
  p_scope    TEXT DEFAULT 'global',
  p_group_id UUID DEFAULT NULL,
  p_subject  TEXT DEFAULT NULL,
  p_window   TEXT DEFAULT 'all'
)
RETURNS TABLE (
  rank         BIGINT,
  user_id      UUID,
  display_name TEXT,
  avatar_url   TEXT,
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
  SELECT rk.rnk, rk.uid, pr.display_name, pr.avatar_url, rk.total, NULL::TEXT, rk.field_size
  FROM ranked rk
  JOIN profiles pr ON pr.id = rk.uid
  WHERE rk.uid = v_me;
END;
$$;

REVOKE ALL ON FUNCTION get_my_rank(TEXT, UUID, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_my_rank(TEXT, UUID, TEXT, TEXT) TO authenticated;


-- ── get_competitive_leaderboard: duel tier board ────────────
DROP FUNCTION IF EXISTS get_competitive_leaderboard(TEXT, UUID, INT, INT);
CREATE FUNCTION get_competitive_leaderboard(
  p_scope    TEXT DEFAULT 'global',
  p_group_id UUID DEFAULT NULL,
  p_limit    INT  DEFAULT 100,
  p_offset   INT  DEFAULT 0
)
RETURNS TABLE (
  rank           BIGINT,
  user_id        UUID,
  display_name   TEXT,
  avatar_url     TEXT,
  tier           TEXT,
  matches_played INT,
  is_me          BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RETURN;
  END IF;
  IF p_scope = 'group' AND (p_group_id IS NULL OR NOT is_group_member(p_group_id, v_me)) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    RANK() OVER (ORDER BY pr.rating DESC)::BIGINT,
    pr.user_id,
    p.display_name,
    p.avatar_url,
    tier_for(pr.rating, pr.matches_played),
    pr.matches_played,
    pr.user_id = v_me
  FROM player_ratings pr
  JOIN profiles p ON p.id = pr.user_id
  WHERE pr.matches_played >= 5
    AND NOT p.leaderboard_opt_out
    AND (
      p_scope <> 'group'
      OR EXISTS (
        SELECT 1 FROM group_members m
        WHERE m.group_id = p_group_id AND m.user_id = pr.user_id
      )
    )
  ORDER BY pr.rating DESC, p.display_name
  LIMIT GREATEST(p_limit, 0) OFFSET GREATEST(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION get_competitive_leaderboard(TEXT, UUID, INT, INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_competitive_leaderboard(TEXT, UUID, INT, INT) TO authenticated;
