import { SidebarProvider } from "@/app/components/ui/sidebar";
import { AppSidebar, type UserProfile } from "@/app/components/AppSidebar";
import { Topbar } from "@/app/components/Topbar";
import { createClient } from "@/lib/supabase/server";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: UserProfile = { displayName: "Student", xp: 0, level: 1 };
  let isAdmin = false;

  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("display_name, role, total_xp")
      .eq("id", user.id)
      .single();
    if (data) {
      const xp = data.total_xp ?? 0;
      profile = {
        displayName: data.display_name ?? "Student",
        xp,
        level: Math.floor(xp / 500) + 1,
      };
      isAdmin = data.role === "admin";
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar profile={profile} isAdmin={isAdmin} />
      <div className="flex min-h-svh flex-1 flex-col">
        <Topbar displayName={profile.displayName} />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-5 py-8">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
