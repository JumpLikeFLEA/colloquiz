import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { liveStreak } from "@/lib/streak";

// Per-request memoized user + profile.
//
// `supabase.auth.getUser()` and the profiles lookup each cost a round-trip and
// are needed by the (main) layout AND the page it wraps. React's cache() dedupes
// them to a single call within one server render, so a navigation pays each once
// instead of once per component. (The proxy's getUser runs in a separate request
// context and is not deduped here.)

export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
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
      "id, full_name, display_name, city, role, total_xp, current_streak, last_quiz_at, created_at, is_author",
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
