import { notFound } from "next/navigation";
import { SidebarProvider } from "@/app/components/ui/sidebar";
import { getCourseAccess } from "@/lib/courseAccess";
import { StudioSidebar, StudioTopbar } from "./StudioSidebar";

// The Studio gate (SHELL-020, docs/decisions/0109 Decision 3). proxy.ts
// sends a signed-out visitor to /login first; this is the second layer: a
// signed-in user who is neither an admin nor holds a course_editors grant
// gets a 404, not a "Forbidden" page, so Studio's existence isn't advertised
// to learners. getCourseAccess() mirrors can_edit_course (029); the per-course
// pages below still check can_edit_course(id) itself, and RLS underneath
// both is the actual boundary.
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin, editableCourseIds } = await getCourseAccess();
  if (!isAdmin && editableCourseIds.length === 0) notFound();

  return (
    <SidebarProvider>
      <StudioSidebar isAdmin={isAdmin} />
      {/* min-w-0: same reason as the Colloquiz (main) layout — a flex item
          otherwise refuses to shrink below its widest unbreakable content. */}
      <div className="flex min-w-0 min-h-svh flex-1 flex-col">
        <StudioTopbar />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-5 py-8">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
}
