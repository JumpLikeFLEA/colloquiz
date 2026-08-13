import { Suspense } from "react";
import { SidebarProvider } from "@/app/components/ui/sidebar";
import { AppSidebar, type SidebarData } from "@/app/components/AppSidebar";
import { Topbar } from "@/app/components/Topbar";
import { StartQuizProvider } from "@/app/components/StartQuizProvider";
import { ActiveQuizBanner } from "@/app/components/ActiveQuizBanner";
import { Toaster } from "@/app/components/ui/sonner";
import { DuelRealtime } from "@/app/components/DuelRealtime";
import { ThemeSync } from "@/app/components/ThemeSync";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getUser } from "@/lib/supabase/queries";
import { getMyDuels, isActionableDuel } from "@/lib/duels";
import { getActiveSessionSummary } from "@/lib/quizSession";
import { getLevelProgress } from "@/lib/levels";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Only local, non-network awaits here: cookie read + JWT verify. Every
  // Supabase round trip below is handed down as an unresolved promise and
  // read with use() inside a Suspense boundary further down the tree, so the
  // shell — <head> asset links, sidebar frame, page skeleton — can flush at
  // ~TTFB instead of waiting on any of this data. See the streaming plan for
  // the full rationale (Next streaming guide, streaming.md#L247,299).
  const supabase = await createClient();
  const user = await getUser();

  const profilePromise = getProfile();

  const duelCountPromise = user
    ? // Duels awaiting this user's move, for the sidebar badge. Pure read (the
      // expire sweep moved to pg_cron); degrade to 0 so a hiccup never breaks
      // the shell.
      getMyDuels(supabase)
        .then((duels) => duels.filter(isActionableDuel).length)
        .catch(() => 0)
    : Promise.resolve(0);

  const unreadPromise: Promise<number> = user
    ? // Unread notification count for the bell dot. HEAD + count is the whole
      // payload — no rows cross the wire.
      Promise.resolve(
        supabase
          .from("notifications")
          .select("id", { head: true, count: "exact" })
          .eq("user_id", user.id)
          .is("read_at", null)
          .then(({ count }) => count ?? 0, () => 0),
      )
    : Promise.resolve(0);

  const sessionPromise = user
    ? getActiveSessionSummary(supabase, user.id).catch(() => null)
    : Promise.resolve(null);

  // "Has at least one course_editors row." Non-admin editors need the
  // /admin/courses nav entry to reach their editable courses (RLS "self read",
  // 029). NOT gated on COURSES_ENABLED: the editor entry links to /admin/courses
  // (which AppSidebar does not flag-filter — only the learner /courses nav is),
  // and the whole authoring surface works while the feature is dormant so
  // content can be prepared before launch. Chained off profilePromise (needs
  // isAdmin from the profile row) rather than awaited — still concurrent with
  // duelCountPromise/unreadPromise/sessionPromise, unlike the old serial
  // trailing query.
  const courseEditorPromise = profilePromise.then(async (profile) => {
    if (!profile || profile.role === "admin") return false;
    const { count } = await supabase
      .from("course_editors")
      .select("course_id", { head: true, count: "exact" });
    return (count ?? 0) > 0;
  });

  // The sidebar's three streamed slots (footer card, duels badge, role
  // sections) all read this one promise, so they resolve together instead of
  // each racing its own round trip.
  const sidebarPromise: Promise<SidebarData> = Promise.all([
    profilePromise,
    duelCountPromise,
    courseEditorPromise,
  ]).then(([data, duelCount, isCourseEditor]) => {
    if (!data) {
      return {
        profile: {
          displayName: "Student",
          xp: 0,
          level: 1,
          xpToNext: getLevelProgress(0).xpToNext,
          progress: 0,
        },
        isAdmin: false,
        isAuthor: false,
        isCourseEditor,
        duelCount,
      };
    }
    const xp = data.total_xp ?? 0;
    const { level, xpToNext, progress } = getLevelProgress(xp);
    return {
      profile: {
        displayName: data.display_name ?? "Student",
        xp,
        level,
        xpToNext,
        progress,
        avatarUrl: data.avatar_url,
      },
      isAdmin: data.role === "admin",
      isAuthor: !!data.is_author || data.role === "admin",
      isCourseEditor,
      duelCount,
    };
  });

  const themePromise = profilePromise.then((p) => p?.theme_preference ?? null);

  return (
    <SidebarProvider>
      <StartQuizProvider>
        <AppSidebar sidebarPromise={sidebarPromise} />
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
          <Topbar unreadPromise={unreadPromise} />
          {/* Absent in the common case anyway, so an empty fallback is correct. */}
          <Suspense fallback={null}>
            <ActiveQuizBanner sessionPromise={sessionPromise} />
          </Suspense>
          <main className="flex-1 overflow-y-auto">
            <div className="max-w-6xl mx-auto px-5 py-8">
              {children}
            </div>
          </main>
        </div>
        <Toaster />
        {user?.id && <DuelRealtime userId={user.id} />}
        {/* Renders nothing. Adopts a theme chosen on another device, once per
            load — the local copy still wins first paint, which is what keeps the
            page from flashing. */}
        <Suspense fallback={null}>
          <ThemeSync themePromise={themePromise} />
        </Suspense>
      </StartQuizProvider>
    </SidebarProvider>
  );
}
