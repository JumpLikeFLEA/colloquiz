import { createClient } from "@/lib/supabase/server";
import { getEnrichedResults } from "@/lib/questions";
import { getUser, getProfile } from "@/lib/supabase/queries";
import { getMyRank } from "@/lib/leaderboard";
import { redirect } from "next/navigation";
import { DashboardView } from "./DashboardView";

export default async function DashboardPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [profile, results, myRank] = await Promise.all([
    getProfile(),
    getEnrichedResults(supabase, user.id),
    // The rolling 7-day board is the one worth surfacing here: an all-time rank
    // barely moves, so it reads as static and nobody clicks it.
    //
    // Degrades to null rather than throwing: the rank strip is an addition to
    // this page, and a leaderboard problem (or a deploy that lands before the
    // migration) must not take the whole Dashboard down with it.
    getMyRank({ window: "7d" }).catch(() => null),
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
      myRank={myRank}
    />
  );
}
