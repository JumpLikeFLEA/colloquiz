import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

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
  current_streak: number;
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
      "id, full_name, display_name, city, role, total_xp, current_streak, created_at, is_author",
    )
    .eq("id", user.id)
    .single();
  return (data as FullProfile) ?? null;
});
