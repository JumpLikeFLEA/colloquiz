import { ShieldAlert } from "lucide-react";
import { canEnterStudio, getCourseAccess } from "@/lib/courseAccess";
import { listAuthoredCourses } from "@/lib/courseAuthoring";
import { CoursesListView } from "./CoursesListView";

// Admin sees every course; a non-admin course_editors delegate sees only the
// courses they hold a grant for (AUTH-007, docs/decisions/0041, reopening
// 0025 Decision 1). Signed-out or neither → Forbidden. `getCourseAccess`
// mirrors the SQL `can_edit_course` grant model (own course_editors rows,
// self-filtered — see lib/courseAccess.ts), not a re-derived permission.
// Everyone past that gate sees "New course"; create_course (082) lets an
// admin or an active author seat through and answers anyone else with its own
// message (docs/decisions/0125 D2, 0154).
export default async function AdminCoursesPage() {
  const access = await getCourseAccess();
  const { isAdmin, editableCourseIds } = access;

  if (!canEnterStudio(access)) {
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
      <CoursesListView courses={courses} />
    </div>
  );
}
