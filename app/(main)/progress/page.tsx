import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser, getProfile } from "@/lib/supabase/queries";
import { getEnrichedResults } from "@/lib/questions";
import { getMyRank } from "@/lib/leaderboard";
import { aggregateBySubject, byAvgScoreDesc, toRadarPoints } from "@/lib/subjectStats";
import { getHistorySubjects, getQuizHistory, parseHistoryFilters } from "@/lib/history";
import { hasActiveFilters } from "@/lib/historyFilters";
import { Skeleton } from "@/app/components/ui/skeleton";
import { DashboardView } from "./DashboardView";
import { AchievementsView } from "./AchievementsView";
import { HistoryView } from "./HistoryView";
import { ProgressTabs, type ProgressTab } from "./ProgressTabs";

interface Props {
  searchParams: Promise<{
    tab?: string;
    subject?: string;
    difficulty?: string;
    page?: string;
  }>;
}

export default async function ProgressPage({ searchParams }: Props) {
  const user = await getUser();
  if (!user) redirect("/login");

  // Allow-list normalize: only "achievements" and "history" select those tabs;
  // anything else (missing, "", "banana") falls back to Stats rather than
  // rendering blank.
  const params = await searchParams;
  const tab: ProgressTab =
    params.tab === "achievements" || params.tab === "history" ? params.tab : "stats";

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-foreground">Progress</h1>
        <p className="text-muted-foreground mt-1">Your stats, history, and achievements</p>
      </div>

      <ProgressTabs tab={tab} />

      {/* Deliberately NOT keyed on `tab`. A key remounts the boundary on every
          switch, which tears the current tab down to a skeleton for the ~300ms
          the server takes — a flash of grey where readable content already was.
          Unkeyed, React holds the rendered tab until the new one is ready, and
          ProgressTabs moves the pill immediately so the click still registers.
          The fallback then only runs where nothing is on screen yet (a page load
          or arriving from another route), and even there it stays invisible
          until the wait is worth reporting. */}
      {/* Keyed on the filters so a filter change re-suspends and shows the
          skeleton, rather than holding a stale page of rows. The tab itself is
          deliberately NOT part of the key — see above. */}
      <Suspense
        fallback={<TabSkeleton />}
        key={tab === "history" ? `${params.subject}|${params.difficulty}|${params.page}` : undefined}
      >
        {tab === "achievements" ? (
          <AchievementsTab />
        ) : tab === "history" ? (
          <HistoryTab params={params} />
        ) : (
          <StatsTab />
        )}
      </Suspense>
    </div>
  );
}

async function StatsTab() {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const [profile, results, myRank] = await Promise.all([
    getProfile(),
    getEnrichedResults(supabase, user.id),
    // The rolling 7-day board is the one worth surfacing here: an all-time rank
    // barely moves, so it reads as static and nobody clicks it. Degrades to null
    // rather than throwing so a leaderboard hiccup can't take the tab down.
    getMyRank({ window: "7d" }).catch(() => null),
  ]);

  if (!profile) {
    throw new Error("Could not load profile");
  }

  // One aggregate, two charts. Grouped here on the server from the results this
  // page already loaded — the radar and the bar chart are different slices of the
  // same numbers, so neither costs a query and they cannot disagree.
  const bySubject = aggregateBySubject(results);

  return (
    <DashboardView
      profile={profile}
      results={results}
      myRank={myRank}
      radarSubjects={toRadarPoints(bySubject)}
      scoreBySubject={byAvgScoreDesc(bySubject)}
    />
  );
}

async function HistoryTab({
  params,
}: {
  params: { subject?: string; difficulty?: string; page?: string };
}) {
  const user = await getUser();
  if (!user) return null;

  const filters = parseHistoryFilters(params);
  // One page of rows (with its filtered total) plus the subject list for the
  // dropdown. Both are RPCs from migration 021 — the full table is never read.
  const [page, subjects] = await Promise.all([
    getQuizHistory(filters),
    getHistorySubjects(),
  ]);

  return (
    <HistoryView
      page={page}
      filters={filters}
      subjects={subjects}
      filtered={hasActiveFilters(filters)}
    />
  );
}

async function AchievementsTab() {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  // Profile comes from the cached getProfile() (deduped with the layout's call),
  // not a second raw profiles select. Its current_streak is ALREADY lapsed via
  // liveStreak, so it is passed straight through — do not re-wrap it.
  const [profile, unlocksRes, resultsRes] = await Promise.all([
    getProfile(),
    supabase
      .from("user_achievements")
      .select("achievement_id, unlocked_at")
      .eq("user_id", user.id),
    supabase
      .from("results")
      .select("score, time_taken")
      .eq("user_id", user.id),
  ]);

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
      totalXp={profile?.total_xp ?? 0}
      currentStreak={profile?.current_streak ?? 0}
      quizCount={results.length}
      avgScore={avgScore}
      totalTimeSeconds={totalTimeSeconds}
      unlockedMap={unlockedMap}
    />
  );
}

// Generic placeholder shaped like both tabs' content (a banner-ish block over a
// grid of cards), shown while the active tab's server data streams in.
// delayed-reveal holds it invisible for the first 400ms so a normal response
// never paints it — see globals.css.
function TabSkeleton() {
  return (
    <div className="delayed-reveal flex flex-col gap-5">
      <Skeleton className="h-40 rounded-2xl" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
