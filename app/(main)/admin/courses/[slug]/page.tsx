import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Pencil, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { CourseEditorsPanel } from "./CourseEditorsPanel";

/**
 * Per-course admin/editor page. Lists every non-archived stage as a link into
 * the stage editor, and (admin-only) exposes the editor grant/revoke panel.
 *
 * Reads bypass the enrolled-only theory RLS because this page never touches
 * course_stage_theory directly — stage rows come from course_stages, which is
 * publicly readable when the course is published; a draft course reads via the
 * admin/editor gate (RLS lets admin see all courses, and an editor with a
 * grant row can see the course they were granted). Content editing is done
 * inside the child StageEditor via get_stage_authoring / save_stage_theory,
 * which do their own can_edit_course guard.
 */
export default async function AdminCoursePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAdmin = profile?.role === "admin";

  const { data: course } = await supabase
    .from("courses")
    .select("id, slug, title, subtitle, description")
    .eq("slug", slug)
    .maybeSingle();
  if (!course) notFound();

  // Non-admins need an explicit course_editors row for THIS course. Admins are
  // always allowed. Doing the check here (rather than trusting the list page
  // to filter) means a direct link to /admin/courses/<slug> still 403s cleanly.
  let allowed = isAdmin;
  if (!allowed) {
    const { count } = await supabase
      .from("course_editors")
      .select("course_id", { head: true, count: "exact" })
      .eq("course_id", course.id);
    allowed = (count ?? 0) > 0;
  }
  if (!allowed) {
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

  const { data: stages } = await supabase
    .from("course_stages")
    .select("id, key, position, title, summary")
    .eq("course_id", course.id)
    .is("archived_at", null)
    .order("position", { ascending: true });

  // Theory edit markers: which stages have been touched in-app (updated_by NOT
  // NULL, per 029). Rendered as a small pill on each row so the operator can
  // see at a glance which stages diverge from the imported JSON.
  const { data: theoryMarks } = await supabase
    .from("course_stage_theory")
    .select("stage_id, updated_by, updated_at")
    .in("stage_id", (stages ?? []).map((s) => s.id as string));
  const edited = new Map(
    (theoryMarks ?? []).map((r) => [r.stage_id as string, r.updated_by != null]),
  );

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <Link
        href="/admin/courses"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={15} /> All editable courses
      </Link>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">{course.title}</h1>
        {course.subtitle && <p className="text-muted-foreground">{course.subtitle}</p>}
        {course.description && (
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            {course.description}
          </p>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Stages
        </h2>
        {(stages ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border">
            <p className="text-sm">This course has no stages yet.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
            {(stages ?? []).map((s, i) => (
              <Link
                key={s.id as string}
                href={`/admin/courses/${slug}/${s.key as string}`}
                className="flex items-center gap-4 p-4 hover:bg-accent transition-colors"
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0 bg-brand-subtle text-brand-text">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{s.title as string}</p>
                  {s.summary != null && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {s.summary as string}
                    </p>
                  )}
                </div>
                {edited.get(s.id as string) && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-brand-subtle text-brand-text border border-brand-border shrink-0">
                    <Pencil size={11} /> Edited
                  </span>
                )}
                <ArrowRight size={15} className="text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </section>

      {isAdmin && <CourseEditorsPanel slug={slug} />}
    </div>
  );
}
