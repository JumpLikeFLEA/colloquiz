import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { getCourseBySlug } from "@/lib/courses";
import { COURSES_ENABLED } from "@/lib/featureFlags";
import { CourseSyllabus } from "./CourseSyllabus";

export default async function CourseSyllabusPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!COURSES_ENABLED) notFound(); // dormant until released — see lib/featureFlags.ts

  const { slug } = await params;

  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/login");

  // Null both when the course is absent and when it is unpublished (RLS hides
  // it) — a stranger can't tell the two apart.
  const syllabus = await getCourseBySlug(supabase, user.id, slug);
  if (!syllabus) notFound();

  return <CourseSyllabus syllabus={syllabus} />;
}
