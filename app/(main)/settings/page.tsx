import { redirect } from "next/navigation";
import type { UserIdentity } from "@supabase/supabase-js";
import { getUser, getProfile } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";
import { prefsFromRows } from "@/lib/notificationPrefs";
import { SettingsView } from "./SettingsView";

export default async function SettingsPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  // Same cached getProfile() the (main) layout already called, so the identity
  // block costs no extra round-trip.
  const profile = await getProfile();
  if (!profile) throw new Error("Could not load profile");

  // The linked sign-in methods come from Supabase's identities — the only
  // record of what can actually sign this account in. Read here rather than in
  // an effect so the list is right on first paint and cannot flash a wrong
  // state; a failure degrades to an empty list with the reason shown, which
  // also means the "last method" guard stays on rather than off.
  const supabase = await createClient();
  const { data: identityData, error: identityError } = await supabase.auth.getUserIdentities();
  const identities: UserIdentity[] = identityData?.identities ?? [];

  // Preferences are stored sparsely — a row exists only for an event the user
  // has changed — so an empty result is the normal state for a new account, not
  // a failure. prefsFromRows fills in the defaults.
  const { data: prefRows } = await supabase
    .from("notification_preferences")
    .select("event, in_app")
    .eq("user_id", user.id);

  return (
    <SettingsView
      userId={user.id}
      email={user.email ?? ""}
      profile={profile}
      identities={identities}
      identityError={identityError?.message ?? null}
      notificationPrefs={prefsFromRows(prefRows)}
    />
  );
}
