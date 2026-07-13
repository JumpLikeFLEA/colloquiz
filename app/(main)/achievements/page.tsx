import { createClient } from "@/lib/supabase/server";
import { liveStreak } from "@/lib/streak";
import { redirect } from "next/navigation";
import { AchievementsView } from "./AchievementsView";

export default async function AchievementsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileRes, unlocksRes, resultsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("total_xp, current_streak, last_quiz_at")
      .eq("id", user.id)
      .single(),
    supabase
      .from("user_achievements")
      .select("achievement_id, unlocked_at")
      .eq("user_id", user.id),
    supabase
      .from("results")
      .select("score, time_taken")
      .eq("user_id", user.id),
  ]);

  const profile = profileRes.data ?? { total_xp: 0, current_streak: 0, last_quiz_at: null };
  const unlocks = unlocksRes.data ?? [];
  const results = resultsRes.data ?? [];

  const unlockedMap: Record<string, string> = Object.fromEntries(
    unlocks.map((u) => [u.achievement_id, u.unlocked_at]),
  );
  const avgScore = results.length
    ? Math.round((results.reduce((s, r) => s + r.score, 0) / results.length) * 100)
    : 0;
  const totalTimeSeconds = results.reduce((s, r) => s + (r.time_taken ?? 0), 0);

  return (
    <AchievementsView
      totalXp={profile.total_xp}
      currentStreak={liveStreak(profile.last_quiz_at, profile.current_streak)}
      quizCount={results.length}
      avgScore={avgScore}
      totalTimeSeconds={totalTimeSeconds}
      unlockedMap={unlockedMap}
    />
  );
}
