import { SidebarProvider } from "@/app/components/ui/sidebar";
import { AppSidebar, type UserProfile } from "@/app/components/AppSidebar";
import { Topbar } from "@/app/components/Topbar";
import { StartQuizProvider } from "@/app/components/StartQuizProvider";
import { ActiveQuizBanner } from "@/app/components/ActiveQuizBanner";
import { Toaster } from "@/app/components/ui/sonner";
import { DuelRealtime } from "@/app/components/DuelRealtime";
import { getProfile } from "@/lib/supabase/queries";
import { getMyDuels, isActionableDuel } from "@/lib/duels";
import { getLevelProgress } from "@/lib/levels";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = await getProfile();

  let profile: UserProfile = {
    displayName: "Student",
    xp: 0,
    level: 1,
    xpToNext: getLevelProgress(0).xpToNext,
    progress: 0,
  };
  let isAdmin = false;
  let isAuthor = false;

  if (data) {
    const xp = data.total_xp ?? 0;
    const { level, xpToNext, progress } = getLevelProgress(xp);
    profile = {
      displayName: data.display_name ?? "Student",
      xp,
      level,
      xpToNext,
      progress,
    };
    isAdmin = data.role === "admin";
    isAuthor = !!data.is_author || data.role === "admin";
  }

  // Duels awaiting this user's move, for the sidebar badge. getMyDuels also runs
  // the lazy expire sweep; degrade to 0 so a duel hiccup never breaks the shell.
  const duelCount = data
    ? await getMyDuels()
        .then((duels) => duels.filter(isActionableDuel).length)
        .catch(() => 0)
    : 0;

  return (
    <SidebarProvider>
      <StartQuizProvider>
        <AppSidebar profile={profile} isAdmin={isAdmin} isAuthor={isAuthor} duelCount={duelCount} />
        <div className="flex min-h-svh flex-1 flex-col">
          <Topbar displayName={profile.displayName} />
          <ActiveQuizBanner />
          <main className="flex-1 overflow-y-auto">
            <div className="max-w-6xl mx-auto px-5 py-8">
              {children}
            </div>
          </main>
        </div>
        <Toaster />
        {data?.id && <DuelRealtime userId={data.id} />}
      </StartQuizProvider>
    </SidebarProvider>
  );
}
