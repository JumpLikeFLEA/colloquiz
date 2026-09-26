import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getCourseAccess, canEditCourse } from "@/lib/courseAccess";
import { getAuthoredCourseDetail } from "@/lib/courseAuthoring";
import { CourseDetailView } from "./CourseDetailView";

// Gated on can_edit_course(id) — admin or this course's delegated editor
// (AUTH-007, docs/decisions/0041, reopening 0025 Decision 1). See
// app/(main)/app/admin/courses/page.tsx's header comment.
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

  const detail = await getAuthoredCourseDetail(id, isAdmin);
  if (!detail) notFound();

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <CourseDetailView detail={detail} isAdmin={isAdmin} />
    </div>
  );
}
