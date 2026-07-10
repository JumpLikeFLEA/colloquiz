import { createClient } from "@/lib/supabase/server";
import { getEnrichedResults } from "@/lib/questions";
import { getUser, getProfile } from "@/lib/supabase/queries";
import { redirect } from "next/navigation";
import { DashboardView } from "./DashboardView";

export default async function DashboardPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [profile, results] = await Promise.all([
    getProfile(),
    getEnrichedResults(supabase, user.id),
  ]);

  if (!profile) {
    throw new Error("Could not load profile");
  }

  return (
    <DashboardView
      userId={user.id}
      email={user.email ?? ""}
      profile={profile}
      results={results}
    />
  );
}
