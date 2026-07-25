import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser, getProfile } from "@/lib/supabase/queries";
import { getEnrichedResults } from "@/lib/questions";
import { getMyRank } from "@/lib/leaderboard";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/app/components/ui/skeleton";
import { DashboardView } from "./DashboardView";
import { AchievementsView } from "./AchievementsView";

type Tab = "stats" | "achievements";

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

export default async function ProgressPage({ searchParams }: Props) {
  const user = await getUser();
  if (!user) redirect("/login");

  // Allow-list normalize: only "achievements" selects that tab; anything else
  // (missing, "", "banana") falls back to Stats rather than rendering blank.
  const { tab: tabParam } = await searchParams;
  const tab: Tab = tabParam === "achievements" ? "achievements" : "stats";

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-foreground">Progress</h1>
        <p className="text-muted-foreground mt-1">Your stats, history, and achievements</p>
      </div>

      {/* Tabs — real navigations (URL-driven), so links with aria-current, not an ARIA tablist */}
      <div className="flex items-center gap-2">
        <TabLink href="/progress?tab=stats" active={tab === "stats"}>
          Stats
        </TabLink>
        <TabLink href="/progress?tab=achievements" active={tab === "achievements"}>
          Achievements
        </TabLink>
      </div>

      {/* key={tab} remounts the boundary on switch, so the skeleton shows while the
          new tab's server data streams instead of stalling on a blank page. */}
      <Suspense key={tab} fallback={<TabSkeleton />}>
        {tab === "achievements" ? <AchievementsTab /> : <StatsTab />}
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

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center rounded-xl px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-brand-subtle text-brand"
          : "text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </Link>
  );
}

// Generic placeholder shaped like both tabs' content (a banner-ish block over a
// grid of cards), shown while the active tab's server data streams in.
function TabSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-40 rounded-2xl" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
