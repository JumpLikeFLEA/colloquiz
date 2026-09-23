import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { getLessonContentDraft, getLessonVersionDocument } from "@/lib/lessonContentAuthoring";
import { PreviewClient } from "./PreviewClient";

// AUTH-005 — same two-layer author-only gate as the editor page
// (LessonContentPage, AUTH-002/docs/decisions/0025): the admin-role check
// below is the UI-level gate every admin page uses; the actual security
// boundary underneath it is RLS — "lesson_versions: editor read" (migration
// 041 §8) restricts every lesson_versions row, published or not, to
// can_edit_course editors. A non-editor hitting this route directly would
// get `notFound()` below regardless (getLessonVersionDocument returns null),
// even with the admin gate somehow bypassed.
//
// `version` is REQUIRED, not defaulted to "whatever's latest": the whole
// point of previewing a specific version id is that publish, on the next
// screen, publishes exactly that id — "latest" can change under the
// author's feet between opening preview and clicking publish, which is the
// gap migration 045's staleness check exists to catch.
export default async function LessonPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; lessonId: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const { id: courseId, lessonId } = await params;
  const { version: versionId } = await searchParams;
  if (!versionId) notFound();

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

  const document = await getLessonVersionDocument(lessonId, versionId);
  if (document === null) notFound();

  const attemptId = crypto.randomUUID();

  return (
    <PreviewClient
      courseId={courseId}
      lessonId={lessonId}
      versionId={versionId}
      document={document}
      attemptId={attemptId}
    />
  );
}
