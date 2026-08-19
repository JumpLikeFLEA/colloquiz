import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { getStageAuthoring } from "@/lib/courses";
import { PreviewLoader } from "./PreviewLoader";

/**
 * "Preview" for the stage editor's Theory tab — renders the author's UNSAVED
 * draft blocks (written to sessionStorage by the Preview button in
 * StageEditor.tsx) as a learner would see them. Gated exactly like the editor
 * page itself (course_editors delegation OR admin, via getStageAuthoring's
 * can_edit_course check) rather than reusing the real learner-facing
 * /courses/[slug]/[stage] route, which is blocked by COURSES_ENABLED and an
 * enrollment/unlocked gate that has no preview-aware bypass today.
 */
export default async function StagePreviewPage({
  params,
}: {
  params: Promise<{ slug: string; stage: string }>;
}) {
  const { slug, stage: stageKey } = await params;
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const { data: course } = await supabase
    .from("courses")
    .select("id, slug, title")
    .eq("slug", slug)
    .maybeSingle();
  if (!course) notFound();

  const { data: stages } = await supabase
    .from("course_stages")
    .select("id, key, title")
    .eq("course_id", course.id)
    .is("archived_at", null)
    .order("position", { ascending: true });
  const stage = (stages ?? []).find((s) => s.key === stageKey);
  if (!stage) notFound();

  // Re-checks can_edit_course; a stranger cannot distinguish "not an editor"
  // from "stage vanished", same as the editor page.
  const authoring = await getStageAuthoring(supabase, stage.id as string);
  if (!authoring) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="size-12 text-muted-foreground mb-4" />
        <h1 className="text-xl font-semibold">Forbidden</h1>
        <p className="text-muted-foreground mt-2">
          You don&apos;t have editor rights to this course.
        </p>
      </div>
    );
  }

  const editorHref = `/admin/courses/${course.slug as string}/${stage.key as string}`;

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Preview — unsaved draft
          </p>
          <h1 className="text-xl font-semibold text-foreground">{stage.title as string}</h1>
        </div>
        <Link
          href={editorHref}
          className="cursor-pointer text-sm text-brand-text hover:underline shrink-0"
        >
          Back to editor
        </Link>
      </div>
      <PreviewLoader stageId={stage.id as string} editorHref={editorHref} />
    </div>
  );
}
