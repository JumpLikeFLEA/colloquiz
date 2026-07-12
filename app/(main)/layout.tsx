import { SidebarProvider } from "@/app/components/ui/sidebar";
import { AppSidebar, type UserProfile } from "@/app/components/AppSidebar";
import { Topbar } from "@/app/components/Topbar";
import { StartQuizProvider } from "@/app/components/StartQuizProvider";
import { ActiveQuizBanner } from "@/app/components/ActiveQuizBanner";
import { Toaster } from "@/app/components/ui/sonner";
import { getProfile } from "@/lib/supabase/queries";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = await getProfile();

  let profile: UserProfile = { displayName: "Student", xp: 0, level: 1 };
  let isAdmin = false;
  let isAuthor = false;

  if (data) {
    const xp = data.total_xp ?? 0;
    profile = {
      displayName: data.display_name ?? "Student",
      xp,
      level: Math.floor(xp / 500) + 1,
    };
    isAdmin = data.role === "admin";
    isAuthor = !!data.is_author || data.role === "admin";
  }

  return (
    <SidebarProvider>
      <StartQuizProvider>
        <AppSidebar profile={profile} isAdmin={isAdmin} isAuthor={isAuthor} />
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
      </StartQuizProvider>
    </SidebarProvider>
  );
}
