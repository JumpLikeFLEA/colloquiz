import { ShieldAlert } from "lucide-react";
import { getCourseAccess } from "@/lib/courseAccess";
import { listAuthoredCourses } from "@/lib/courseAuthoring";
import { CoursesListView } from "./CoursesListView";

// Admin sees every course; a non-admin course_editors delegate sees only the
// courses they hold a grant for (AUTH-007, docs/decisions/0041, reopening
// 0025 Decision 1). Signed-out or neither → Forbidden. `getCourseAccess`
// mirrors the SQL `can_edit_course` grant model (own course_editors rows,
// self-filtered — see lib/courseAccess.ts), not a re-derived permission.
export default async function AdminCoursesPage() {
  const { isAdmin, editableCourseIds } = await getCourseAccess();

  if (!isAdmin && editableCourseIds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="size-12 text-muted-foreground mb-4" />
        <h1 className="text-xl font-semibold">Forbidden</h1>
        <p className="text-muted-foreground mt-2">
          You need admin or delegated-editor access to see this page.
        </p>
      </div>
    );
  }

  const courses = await listAuthoredCourses(isAdmin ? undefined : editableCourseIds);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <CoursesListView courses={courses} isAdmin={isAdmin} />
    </div>
  );
}
