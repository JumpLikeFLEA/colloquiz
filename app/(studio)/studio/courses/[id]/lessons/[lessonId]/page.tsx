import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { canEditCourse } from "@/lib/courseAccess";
import { getLessonContentDraft, listLessonVersions } from "@/lib/lessonContentAuthoring";
import { LessonContentEditor } from "./LessonContentEditor";

// Gated on can_edit_course(courseId) — admin or this course's delegated
// editor (AUTH-007, docs/decisions/0041, reopening 0025 Decision 1, which
// also covered AUTH-002's original admin-only gate here). The URL's `id` is
// what's checked; the draft.courseId === courseId comparison below (already
// present for the not-found case) is what makes gating on the URL's course
// id sound — a lessonId can't be swapped in from a course this caller
// doesn't hold a grant for and still pass this check.
export default async function LessonContentPage({
  params,
}: {
  params: Promise<{ id: string; lessonId: string }>;
}) {
  const { id: courseId, lessonId } = await params;

  if (!(await canEditCourse(courseId))) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="size-12 text-muted-foreground mb-4" />
        <h1 className="text-xl font-semibold">Forbidden</h1>
        <p className="text-muted-foreground mt-2">You need admin or delegated-editor access to see this page.</p>
      </div>
    );
  }

  const draft = await getLessonContentDraft(lessonId);
  if (!draft || draft.courseId !== courseId) notFound();

  const versions = await listLessonVersions(lessonId);

  return <LessonContentEditor courseId={courseId} draft={draft} initialVersions={versions} />;
}
