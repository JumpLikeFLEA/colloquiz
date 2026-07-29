import { SidebarProvider } from "@/app/components/ui/sidebar";
import { AppSidebar, type UserProfile } from "@/app/components/AppSidebar";
import { Topbar } from "@/app/components/Topbar";
import { StartQuizProvider } from "@/app/components/StartQuizProvider";
import { ActiveQuizBanner } from "@/app/components/ActiveQuizBanner";
import { Toaster } from "@/app/components/ui/sonner";
import { DuelRealtime } from "@/app/components/DuelRealtime";
import { ThemeSync } from "@/app/components/ThemeSync";
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
      avatarUrl: data.avatar_url,
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
        {/* min-w-0 is load-bearing. This is a flex item, so its min-width
            defaults to `auto`, meaning it refuses to shrink below the
            min-content width of everything inside it — and one unbreakable
            string anywhere on any page then makes the WHOLE SHELL wider than
            the viewport, scrolling the sidebar and top bar off screen. A child
            using `min-w-0 truncate` cannot save itself from this: that lets an
            item shrink inside a definite-width parent, it does not stop the
            parent being content-sized. Measured on Admin > Feedback, where a
            1600-character message with no spaces gave one row a min-content
            width of 10338px. `main` below already has overflow-x: auto, so with
            this in place over-wide content scrolls inside the content area
            instead of dragging the layout with it. */}
        <div className="flex min-w-0 min-h-svh flex-1 flex-col">
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
        {/* Renders nothing. Adopts a theme chosen on another device, once per
            load — the local copy still wins first paint, which is what keeps the
            page from flashing. */}
        <ThemeSync preference={data?.theme_preference ?? null} />
      </StartQuizProvider>
    </SidebarProvider>
  );
}
