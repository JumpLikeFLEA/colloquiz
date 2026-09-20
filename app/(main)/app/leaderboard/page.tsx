import { redirect } from "next/navigation";
import { getSubjects } from "@/lib/questions";
import { getProfile } from "@/lib/supabase/queries";
import {
  getLeaderboard,
  getLeaderboardSubjects,
  getMyRank,
  type LeaderboardWindow,
} from "@/lib/leaderboard";
import { getCompetitiveLeaderboard, getMyTier } from "@/lib/duels";
import { LeaderboardView } from "./LeaderboardView";

const WINDOWS: LeaderboardWindow[] = ["7d", "30d", "all"];

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; window?: string; tab?: string }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const { subject: subjectParam, window: windowParam, tab } = await searchParams;

  // Only subjects that actually have recorded XP get a filter, so a filter can
  // never lead to a permanently empty board.
  const available = await getLeaderboardSubjects();
  const allowed = new Set(available.map((s) => s.subject));
  const subject = subjectParam && allowed.has(subjectParam) ? subjectParam : null;
  const win: LeaderboardWindow = WINDOWS.includes(windowParam as LeaderboardWindow)
    ? (windowParam as LeaderboardWindow)
    : "7d";

  // Competitive data degrades to empty rather than throwing, so a duel problem
  // (or a deploy landing before migration 017) leaves the casual board working.
  const [rows, myRank, competitive, myTier] = await Promise.all([
    getLeaderboard({ subject, window: win, limit: 100 }),
    getMyRank({ subject, window: win }),
    getCompetitiveLeaderboard({ limit: 100 }).catch(() => []),
    getMyTier().catch(() => ({
      tier: "unranked" as const,
      matches_played: 0,
      placement_remaining: 5,
    })),
  ]);

  const nameById = new Map(getSubjects().map((s) => [s.id, s.name]));
  const subjects = available.map((s) => ({
    id: s.subject,
    name: nameById.get(s.subject) ?? s.subject,
    players: s.players,
  }));

  return (
    <LeaderboardView
      rows={rows}
      myRank={myRank}
      subjects={subjects}
      activeSubject={subject}
      activeWindow={win}
      userId={profile.id}
      publicName={profile.display_name}
      optedOut={profile.leaderboard_opt_out}
      activeTab={tab === "competitive" ? "competitive" : "casual"}
      competitive={competitive}
      myTier={myTier}
    />
  );
}
