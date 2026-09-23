import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { getLessonContentDraft, listLessonVersions } from "@/lib/lessonContentAuthoring";
import { LessonContentEditor } from "./LessonContentEditor";

// Admin-only, same gate as app/(main)/app/admin/courses/[id]/page.tsx and
// docs/decisions/0025 — course_editors could read this via RLS
// ("lesson_versions: editor read", migration 041), but AUTH-002 keeps the
// authoring UI itself admin-only, matching AUTH-001.
export default async function LessonContentPage({
  params,
}: {
  params: Promise<{ id: string; lessonId: string }>;
}) {
  const { id: courseId, lessonId } = await params;
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (profile?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="size-12 text-muted-foreground mb-4" />
        <h1 className="text-xl font-semibold">Forbidden</h1>
        <p className="text-muted-foreground mt-2">You need admin privileges to access this page.</p>
      </div>
    );
  }

  const draft = await getLessonContentDraft(lessonId);
  if (!draft || draft.courseId !== courseId) notFound();

  const versions = await listLessonVersions(lessonId);

  return <LessonContentEditor courseId={courseId} draft={draft} initialVersions={versions} />;
}
