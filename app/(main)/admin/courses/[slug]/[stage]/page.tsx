import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { getStageAuthoring } from "@/lib/courses";
import { StageEditor } from "./StageEditor";

/**
 * Stage editor page. Resolves (slug, stageKey) to a stage id, gates on admin
 * or per-course editor, then hands the whole stage — theory blocks + concurrency
 * token + read-only exercise groups — to the client editor via
 * get_stage_authoring (SECURITY DEFINER, 029). The RPC bypasses the enrolled-only
 * theory RLS so an editor need not enroll, and it internally re-checks the
 * can_edit_course gate.
 *
 * NOT gated on COURSES_ENABLED: the editor stays live while the feature is
 * dormant so content can be prepared before launch.
 */
export default async function AdminStageEditorPage({
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
    .select("id, slug, title, pass_threshold")
    .eq("slug", slug)
    .maybeSingle();
  if (!course) notFound();

  const { data: stages } = await supabase
    .from("course_stages")
    .select("id, key, position, title, summary, subtopic")
    .eq("course_id", course.id)
    .is("archived_at", null)
    .order("position", { ascending: true });
  const list = stages ?? [];
  const idx = list.findIndex((s) => s.key === stageKey);
  if (idx === -1) notFound();
  const stage = list[idx];

  const authoring = await getStageAuthoring(supabase, stage.id as string);
  if (!authoring) {
    // Either the caller isn't an editor of this course or the stage vanished
    // between the two reads. A stranger cannot distinguish them.
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

  const prev = list[idx - 1];
  const next = list[idx + 1];

  return (
    <StageEditor
      course={{ slug: course.slug as string, title: course.title as string }}
      stage={{
        id: stage.id as string,
        key: stage.key as string,
        title: stage.title as string,
        summary: (stage.summary as string | null) ?? null,
        index: idx + 1,
        total: list.length,
      }}
      prev={prev ? { key: prev.key as string, title: prev.title as string } : null}
      next={next ? { key: next.key as string, title: next.title as string } : null}
      initialBlocks={authoring.blocks}
      initialUpdatedAt={authoring.updatedAt}
      groups={authoring.groups}
    />
  );
}
