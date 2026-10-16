import { notFound } from "next/navigation";
import { getCourseAccess } from "@/lib/courseAccess";
import { AssignHomeworkButton } from "./AssignHomework";
import { HomeworkCard } from "./HomeworkCard";
import { loadAssignContext, loadHomeworkViews } from "./data";

// /studio/homework — what the teacher assigned and who has done it (TCH-005,
// docs/decisions/0152). Who receives an assignment, whether a lesson is done
// and the best score are all decided in SQL (080, 075); this page lists them.
// A teacher sees their own assignments only: teacher_homework_list() is scoped
// to the caller, so another teacher's never come back.

export const metadata = { title: "Homework" };

export default async function HomeworkPage() {
  const { isAdmin, editableCourseIds } = await getCourseAccess();
  if (!isAdmin && editableCourseIds.length === 0) notFound();

  const [{ views, labelOf, groupNames }, assign] = await Promise.all([loadHomeworkViews(), loadAssignContext()]);
  const today = new Date();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h1 className="text-2xl font-bold text-foreground">Homework</h1>
          <p className="text-sm text-muted-foreground">
            Lessons and courses you assigned to your linked students. A due date is information only: nothing locks,
            and a lesson done before it was assigned counts as done.
          </p>
        </div>
        <AssignHomeworkButton courses={assign.courses} students={assign.students} groups={assign.groups} />
      </div>

      {views.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border text-sm text-center px-4">
          No homework yet. Assign a lesson or a course to a student or a group.
        </div>
      ) : (
        <div className="space-y-3">
          {views.map((h) => (
            <HomeworkCard key={h.id} homework={h} labelOf={labelOf} groupNames={groupNames} today={today} />
          ))}
        </div>
      )}
    </div>
  );
}
