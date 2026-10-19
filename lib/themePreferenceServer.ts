import { cache } from "react";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { asThemePreference, type ThemePreference } from "@/lib/theme";

/**
 * The signed-in learner's saved theme (profiles.theme_preference), for the
 * English root layout's inline theme script (docs/decisions/0181). Null when
 * nobody is signed in, when the learner never chose one, or when the read
 * fails: the script then keeps this device's own choice, so a failure here
 * costs only the cross-device read-back, never the page.
 *
 * An anonymous visitor pays no network call: with no session cookie,
 * getClaims() returns before any JWKS fetch (the same path lib/signedInAccount.ts
 * documents). Deliberately separate from getSignedInAccount: the layout
 * calling that would populate its cache() before /my/messages/[teacherId]
 * marks a thread read, freezing the old unread count for the request
 * (lib/signedInAccount.ts).
 */
export const getThemePreference = cache(async (): Promise<ThemePreference | null> => {
  try {
    const supabase = await createClient();
    const user = await authUserFrom(supabase);
    if (!user) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select("theme_preference")
      .eq("id", user.id)
      .maybeSingle();
    if (error) return null;
    return asThemePreference(data?.theme_preference);
  } catch {
    return null;
  }
});
