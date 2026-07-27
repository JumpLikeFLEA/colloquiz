import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom, type AuthUser } from "@/lib/auth";
import { liveStreak } from "@/lib/streak";

// Per-request memoized user + profile.
//
// The profiles lookup costs a round-trip and is needed by the (main) layout AND
// the page it wraps. React's cache() dedupes it to a single call within one
// server render, so a navigation pays it once instead of once per component.
//
// The user no longer costs a round-trip at all — authUserFrom() verifies the JWT
// locally rather than asking Supabase Auth to. cache() is kept because it also
// dedupes the client construction and the verify, and because getProfile()
// depends on it.

export const getUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();
  return authUserFrom(supabase);
});

export type FullProfile = {
  id: string;
  full_name: string | null;
  display_name: string;
  city: string | null;
  role: string | null;
  total_xp: number;
  /** Already lapsed — 0 if the last completed quiz is older than yesterday. */
  current_streak: number;
  last_quiz_at: string | null;
  created_at: string;
  is_author: boolean;
  /** Hidden from every leaderboard when true (migration 015). */
  leaderboard_opt_out: boolean;
};

// Superset of the columns the layout and the various (main) pages need, fetched
// once per request. Callers read whichever subset they care about.
export const getProfile = cache(async (): Promise<FullProfile | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select(
      "id, full_name, display_name, city, role, total_xp, current_streak, last_quiz_at, created_at, is_author, leaderboard_opt_out",
    )
    .eq("id", user.id)
    .single();
  if (!data) return null;
  const profile = data as FullProfile;
  // The stored column is only valid as of last_quiz_at; nothing expires it at
  // midnight, so lapse it here rather than showing a streak the user has lost.
  return {
    ...profile,
    current_streak: liveStreak(profile.last_quiz_at, profile.current_streak),
  };
});
