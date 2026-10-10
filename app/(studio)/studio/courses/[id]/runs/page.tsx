import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { canEditCourse } from "@/lib/courseAccess";
import { getAuthoredCourseDetail } from "@/lib/courseAuthoring";
import { getCourseRuns } from "@/lib/courseRuns";
import { runPhase } from "@/lib/cohortSchedule";
import { getCourseRunInvites } from "@/lib/runInvitesServer";
import { RunsView } from "./RunsView";

// AUTH-010 — runs and calls of a cohort course (058, docs/decisions/0093 /
// 0105). Same gate as the course editor page: can_edit_course(id). Every
// write goes through an RPC that checks it again.
export default async function CourseRunsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!(await canEditCourse(id))) {
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

  // includeEditors = false: this page needs only the course row.
  // Invites (COH-003): course_run_invites returns labels to editors only,
  // and this page is already gated on canEditCourse(id).
  const [detail, runs, invites] = await Promise.all([
    getAuthoredCourseDetail(id, false),
    getCourseRuns(id),
    getCourseRunInvites(id),
  ]);
  if (!detail) notFound();

  // Display only: which controls each run shows. The RPCs re-check the same
  // condition (docs/decisions/0106 Decision 2). Computed here, once, so the
  // server and client renders agree.
  const now = new Date();

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <RunsView
        courseId={id}
        courseTitle={detail.course.title}
        format={detail.course.format}
        runs={runs.map((r) => ({
          ...r,
          phase: runPhase(r, now),
          invites: invites.filter((i) => i.runId === r.id),
        }))}
      />
    </div>
  );
}
