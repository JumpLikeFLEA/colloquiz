import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Read side of the casual XP leaderboards. Every query goes through the
// SECURITY DEFINER RPCs in migration 016 — profiles stays owner/tutor/co-member
// readable, and the boards see only (rank, display_name, xp, tier).
//
// Deliberately NOT wrapped in unstable_cache, unlike getSubjectStats: these
// RPCs key off auth.uid() for the scope check and the is_me flag, and
// unstable_cache forbids cookies(), so it can only be given the anon client —
// under which the RPCs correctly return nothing. Caching would need a
// separate auth-free variant of the function; at this data volume the
// aggregate is a sub-millisecond group-by over an indexed partial scan, so it
// buys nothing yet. Revisit when the results table is large.

// NOTE this module imports the server Supabase client (and therefore
// next/headers), so client components must import from it with `import type`
// only. The window labels live in LeaderboardView for that reason.
export type LeaderboardScope = "global" | "group";
export type LeaderboardWindow = "all" | "30d" | "7d";

export type LeaderboardRow = {
  rank: number;
  user_id: string;
  display_name: string;
  xp: number;
  tier: string | null;
  is_me: boolean;
};

export type MyRank = {
  rank: number;
  user_id: string;
  display_name: string;
  xp: number;
  tier: string | null;
  total_ranked: number;
};

export type LeaderboardQuery = {
  scope?: LeaderboardScope;
  groupId?: string | null;
  subject?: string | null;
  window?: LeaderboardWindow;
  limit?: number;
  offset?: number;
};

export async function getLeaderboard(q: LeaderboardQuery = {}): Promise<LeaderboardRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_leaderboard", {
    p_scope: q.scope ?? "global",
    p_group_id: q.groupId ?? null,
    p_subject: q.subject ?? null,
    p_window: q.window ?? "all",
    p_limit: q.limit ?? 100,
    p_offset: q.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as LeaderboardRow[];
}

export async function getMyRank(q: LeaderboardQuery = {}): Promise<MyRank | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_rank", {
    p_scope: q.scope ?? "global",
    p_group_id: q.groupId ?? null,
    p_subject: q.subject ?? null,
    p_window: q.window ?? "all",
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as MyRank[];
  return rows[0] ?? null;
}

/**
 * Subjects that actually have recorded XP. Most subjects in data/subjects.json
 * have no questions, so offering all of them would mean filters that can only
 * ever return an empty board.
 */
export const getLeaderboardSubjects = cache(
  async (): Promise<{ subject: string; players: number }[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_leaderboard_subjects");
    if (error) throw new Error(error.message);
    return (data ?? []) as { subject: string; players: number }[];
  },
);
