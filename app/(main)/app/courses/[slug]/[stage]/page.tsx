import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { getStageWithProgress, getStageTheory } from "@/lib/courses";
import { parseCourseSection } from "@/lib/courseFilters";
import { COURSES_ENABLED } from "@/lib/featureFlags";
import { StageView } from "./StageView";
import { TheorySection } from "./TheorySection";

export default async function StagePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; stage: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  if (!COURSES_ENABLED) notFound(); // dormant until released — see lib/featureFlags.ts

  const { slug, stage: stageKey } = await params;
  const { section: sectionRaw } = await searchParams;
  const section = parseCourseSection(sectionRaw);

  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/login");

  // Null both when the course/stage is absent and when it is hidden by RLS — a
  // stranger can't tell the two apart.
  const detail = await getStageWithProgress(supabase, user.id, slug, stageKey);
  if (!detail) notFound();

  // Theory is RLS-gated on enrollment (returns [] when not enrolled), but the UI
  // only ever shows it for an unlocked stage — a locked one renders a gate, not
  // its reading. Fetch only when it will actually be displayed.
  const theory =
    detail.enrolled && detail.unlocked ? await getStageTheory(supabase, detail.stage.id) : [];

  // Rendered server-side and passed as a prop so StageView (a client component)
  // can show math without dragging katex into the client bundle.
  return (
    <StageView detail={detail} section={section} theory={<TheorySection blocks={theory} />} />
  );
}
