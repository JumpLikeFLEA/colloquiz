import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { listAuthoredCourses } from "@/lib/courseAuthoring";
import { CoursesListView } from "./CoursesListView";

// Admin-only, matching every other /app/admin/** page (review, feedback,
// quiz-builder). Not gated on can_edit_course: docs/decisions/0025 keeps this
// first authoring surface admin-only, since delegated editors have no course
// to be granted access to until an admin creates one here.
export default async function AdminCoursesPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="size-12 text-muted-foreground mb-4" />
        <h1 className="text-xl font-semibold">Forbidden</h1>
        <p className="text-muted-foreground mt-2">
          You need admin privileges to access this page.
        </p>
      </div>
    );
  }

  const courses = await listAuthoredCourses();

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <CoursesListView courses={courses} />
    </div>
  );
}
