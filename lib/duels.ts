import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { TierId } from "@/lib/glicko2";

// Everything here goes through the SECURITY DEFINER RPCs in migration 017.
// player_ratings has no grants at all, so there is no path that could read a
// rating number even by accident — only tiers cross this boundary.

export type DuelStatus =
  | "pending"
  | "active"
  | "resolved"
  | "declined"
  | "expired"
  | "cancelled";
export type DuelOutcome = "win" | "loss" | "draw" | null;

export type Duel = {
  duel_id: string;
  quiz_id: string;
  group_id: string;
  group_name: string;
  status: DuelStatus;
  subject: string | null;
  difficulty: string;
  size: number;
  is_challenger: boolean;
  opponent_name: string;
  outcome: DuelOutcome;
  my_correct: number | null;
  their_correct: number | null;
  my_elapsed: number | null;
  their_elapsed: number | null;
  i_submitted: boolean;
  deadline_at: string | null;
  created_at: string;
};

export type MyTier = {
  tier: TierId;
  matches_played: number;
  placement_remaining: number;
};

/**
 * Does this duel need the current user to do something? A challenge waiting for
 * their answer, or an accepted duel whose leg they haven't played. Used for the
 * sidebar's action-needed badge.
 */
export function isActionableDuel(d: Duel): boolean {
  return (
    (d.status === "pending" && !d.is_challenger) ||
    (d.status === "active" && !d.i_submitted)
  );
}

export type CompetitiveRow = {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  tier: TierId;
  matches_played: number;
  is_me: boolean;
};

/**
 * Settles anything overdue: resolves active duels past their deadline and lapses
 * week-old pending challenges. Idempotent.
 *
 * Deliberately NOT bundled into getMyDuels: this is a write-path RPC (it takes
 * row locks on `duels` and fires notifications), and getMyDuels used to run it
 * before every read — including the app-wide sidebar badge in (main)/layout.tsx,
 * so the sweep executed on *every* authenticated navigation and serialized under
 * production concurrency. The periodic settling is now driven by pg_cron
 * (migration 033); this call remains for the /duels inbox, where an active
 * viewer gets their overdue duels settled immediately rather than waiting for
 * the next cron tick. Callers that only read (the badge, the duel detail page)
 * must NOT call this.
 */
export async function sweepDuels(client?: SupabaseClient): Promise<void> {
  const supabase = client ?? (await createClient());
  await supabase.rpc("expire_duels");
}

/**
 * Reads the caller's duels. Pure read — does not settle overdue duels (see
 * sweepDuels). Safe to call on hot paths like the sidebar badge.
 */
export async function getMyDuels(client?: SupabaseClient): Promise<Duel[]> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase.rpc("get_my_duels");
  if (error) throw new Error(error.message);
  return (data ?? []) as Duel[];
}

export async function getMyTier(client?: SupabaseClient): Promise<MyTier> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase.rpc("get_my_tier");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as MyTier[];
  return rows[0] ?? { tier: "unranked", matches_played: 0, placement_remaining: 5 };
}

export async function getCompetitiveLeaderboard(
  opts: { scope?: "global" | "group"; groupId?: string | null; limit?: number } = {},
): Promise<CompetitiveRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_competitive_leaderboard", {
    p_scope: opts.scope ?? "global",
    p_group_id: opts.groupId ?? null,
    p_limit: opts.limit ?? 100,
    p_offset: 0,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as CompetitiveRow[];
}

// The RPCs return { ok, error? } rather than raising, mirroring create_group /
// accept_group_invite in 014, so callers branch on ok instead of catching.
export type RpcResult = { ok: boolean; error?: string; [k: string]: unknown };

export async function createDuel(
  supabase: SupabaseClient,
  args: { opponentId: string; groupId: string; subject: string | null; difficulty: string; size: number },
): Promise<RpcResult> {
  const { data, error } = await supabase.rpc("create_duel", {
    p_opponent_id: args.opponentId,
    p_group_id: args.groupId,
    p_subject: args.subject,
    p_difficulty: args.difficulty,
    p_size: args.size,
  });
  if (error) return { ok: false, error: error.message };
  return data as RpcResult;
}

export async function respondToDuel(
  supabase: SupabaseClient,
  duelId: string,
  accept: boolean,
): Promise<RpcResult> {
  const { data, error } = await supabase.rpc("respond_to_duel", {
    p_duel_id: duelId,
    p_accept: accept,
  });
  if (error) return { ok: false, error: error.message };
  return data as RpcResult;
}

// The challenger withdraws their own pending challenge (migration 019).
export async function cancelDuel(
  supabase: SupabaseClient,
  duelId: string,
): Promise<RpcResult> {
  const { data, error } = await supabase.rpc("cancel_duel", { p_duel_id: duelId });
  if (error) return { ok: false, error: error.message };
  return data as RpcResult;
}

// NOTE there is no startDuelLeg wrapper: the duel clock is stamped by
// start_duel_leg_for_quiz(), called from the quiz page once the session is
// confirmed. Doing it from a button would start the timer even when the player
// is bounced to /my-quizzes because another quiz is already active.

/** Human-readable failures for the RPC error codes above. */
export const DUEL_ERRORS: Record<string, string> = {
  not_authenticated: "You need to be signed in.",
  cannot_duel_yourself: "You can't duel yourself.",
  not_group_members: "You can only duel people in your group.",
  invalid_size: "Pick between 1 and 50 questions.",
  duel_already_open: "You already have an open duel with this person.",
  no_questions: "No questions match that subject and difficulty.",
  not_pending: "That challenge is no longer open.",
  not_a_participant: "You're not part of that duel.",
  not_active: "That duel isn't active.",
  not_cancelable: "This challenge can no longer be cancelled.",
};
