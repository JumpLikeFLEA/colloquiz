import { getUser, getProfile } from "@/lib/supabase/queries";
import { redirect } from "next/navigation";
import { SettingsView } from "./SettingsView";

export default async function SettingsPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  // Same cached getProfile() the (main) layout already called, so the identity
  // block costs no extra round-trip.
  const profile = await getProfile();
  if (!profile) throw new Error("Could not load profile");

  return (
    <SettingsView
      userId={user.id}
      email={user.email ?? ""}
      profile={profile}
    />
  );
}
