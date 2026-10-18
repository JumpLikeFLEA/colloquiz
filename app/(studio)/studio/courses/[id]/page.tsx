import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getCourseAccess, canEditCourse } from "@/lib/courseAccess";
import { getAuthoredCourseDetail } from "@/lib/courseAuthoring";
import { getCourseRuns } from "@/lib/courseRuns";
import { runPhase } from "@/lib/cohortSchedule";
import { createClient } from "@/lib/supabase/server";
import { homeworkForCourse } from "@/lib/homework/homework";
import { AssignHomeworkButton } from "../../homework/AssignHomework";
import { loadAssignContext, loadHomeworkViews } from "../../homework/data";
import { HomeworkSummary } from "../../homework/HomeworkSummary";
import { getCourseGrantees } from "@/lib/courseGrantsServer";
import { getLinkedStudents } from "@/lib/teacherLinksServer";
import { CourseDetailView } from "./CourseDetailView";
import { CourseGrantees } from "./CourseGrantees";
import { ListedSwitch } from "./ListedSwitch";
import { getCourseListing } from "@/lib/listedCoursesServer";

// Gated on can_edit_course(id) — admin or this course's delegated editor
// (AUTH-007, docs/decisions/0041, reopening 0025 Decision 1). See
// app/(studio)/studio/courses/page.tsx's header comment.
export default async function AdminCourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [{ isAdmin }, allowed] = await Promise.all([getCourseAccess(), canEditCourse(id)]);
  if (!allowed) {
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

  const [detail, runs, deleteBlockers, homework, grantees] = await Promise.all([
    getAuthoredCourseDetail(id, isAdmin),
    getCourseRuns(id),
    getDeleteBlockers(id),
    getHomeworkSection(id),
    getGranteesSection(id),
  ]);
  if (!detail) notFound();
  const listing = isAdmin ? await getListingSection(id) : null;
  // Display only (AUTH-010): which notice and locks to show. The RPCs
  // re-check the same condition themselves (docs/decisions/0106 Decision 2).
  const now = new Date();
  const runSummary = { count: runs.length, inProgress: runs.some((r) => runPhase(r, now) === "in_progress") };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <CourseDetailView detail={detail} isAdmin={isAdmin} runs={runSummary} deleteBlockers={deleteBlockers} />
      {listing && (
        <section className="mt-8 space-y-2 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-lg font-semibold text-foreground">Catalogue</h2>
          <ListedSwitch courseId={id} title={listing.title} published={listing.published} listed={listing.listed} />
        </section>
      )}
      {grantees && detail.course.format === "self_paced" && (
        <div className="mt-8">
          <CourseGrantees courseId={id} grantees={grantees} />
        </div>
      )}
      {homework && (
        <div className="mt-8">
          <HomeworkSummary
            title="Homework"
            homework={homework.views}
            empty="Nothing assigned from this course yet."
            today={now}
            action={
              <AssignHomeworkButton
                courses={homework.courses}
                students={homework.students}
                groups={homework.groups}
                preset={{ courseId: id }}
              />
            }
          />
        </div>
      )}
    </div>
  );
}

// AUTH-018: course_delete_blockers (068). null when the call fails, so the
// editor still renders and simply shows no delete section.
async function getDeleteBlockers(courseId: string): Promise<string[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("course_delete_blockers", { p_course_id: courseId });
  if (error) {
    console.error("course_delete_blockers:", error.message);
    return null;
  }
  const result = data as { ok: boolean; blockers?: string[] };
  return result.ok ? (result.blockers ?? []) : null;
}

// TCH-005: the course's assignments and what the assign dialog needs. null when
// a read fails (080 not applied, a transient error) or the course has no
// lesson to assign, so the editor still renders and simply shows no section.
async function getHomeworkSection(courseId: string) {
  try {
    const [ctx, hw] = await Promise.all([loadAssignContext(), loadHomeworkViews()]);
    if (!ctx.courses.some((c) => c.id === courseId)) return null;
    return { ...ctx, views: homeworkForCourse(hw.views, courseId) };
  } catch (e) {
    console.error("course editor: homework section:", e);
    return null;
  }
}

// TCH-009: the students this teacher opened the course for, labelled from the
// teacher's own linked students (course_grantees only returns linked ones).
// null when a read fails (087 not applied), so the editor simply shows no section.
async function getGranteesSection(courseId: string) {
  try {
    const [grantees, linked] = await Promise.all([getCourseGrantees(courseId), getLinkedStudents()]);
    const labels = new Map(linked.map((s) => [s.userId, s.label]));
    return grantees.map((g) => ({
      studentId: g.studentId,
      label: labels.get(g.studentId) || "Student",
      grantedAt: g.grantedAt,
    }));
  } catch (e) {
    console.error("course editor: granted access:", e);
    return null;
  }
}

// TCH-010: the admin-only Listed switch (088). null for a non-admin or when the
// read fails, so the editor renders without the section.
async function getListingSection(courseId: string) {
  try {
    return (await getCourseListing()).find((c) => c.courseId === courseId) ?? null;
  } catch (e) {
    console.error("course editor: catalogue listing:", e);
    return null;
  }
}
