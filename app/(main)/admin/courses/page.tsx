import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Calculator,
  GraduationCap,
  Library,
  Pencil,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/queries";
import { getEditableCourses, type EditableCourse } from "@/lib/courses";
import { pluralize } from "@/lib/format";

// Same lucide name → component map the learner catalogue uses. Kept local to
// avoid coupling the two views; adding a new icon in either place is a one-line
// change with no cross-import.
const ICON_MAP: Record<string, LucideIcon> = {
  Calculator,
  Library,
  BookOpen,
  GraduationCap,
};

/**
 * Admin/editor course list. Gate is admin-role OR a caller with at least one
 * course_editors row (mirrors admin/review/page.tsx's ShieldAlert Forbidden).
 * NOT gated on COURSES_ENABLED: editing works while the feature is dormant so
 * content can be prepared before public launch.
 */
export default async function AdminCoursesPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAdmin = profile?.role === "admin";

  const courses = await getEditableCourses(supabase, isAdmin);

  if (!isAdmin && courses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="size-12 text-muted-foreground mb-4" />
        <h1 className="text-xl font-semibold">Forbidden</h1>
        <p className="text-muted-foreground mt-2">
          You need admin privileges or an editor grant to access this page.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Course editor</h1>
        <p className="text-muted-foreground mt-1">
          {isAdmin
            ? "Walk through any course and fix theory in place."
            : "You have editor rights on the courses below."}
        </p>
      </div>

      {courses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground rounded-2xl border border-dashed border-border">
          <Library size={32} className="mb-2 opacity-40" />
          <p className="text-sm">No courses exist yet.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseCard({ course }: { course: EditableCourse }) {
  const Icon = ICON_MAP[course.icon ?? ""] ?? BookOpen;
  return (
    <Link
      href={`/admin/courses/${course.slug}`}
      className="group flex flex-col gap-3 p-5 rounded-2xl border border-border bg-card hover:border-brand-border transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-subtle text-brand-text flex items-center justify-center shrink-0">
          <Icon size={20} />
        </div>
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-brand-subtle text-brand-text border border-brand-border">
          <Pencil size={11} />
          {course.canEditReason === "admin" ? "Admin" : "Editor"}
        </span>
      </div>

      <div className="min-w-0">
        <p className="text-base font-semibold text-foreground">{course.title}</p>
        {course.subtitle && (
          <p className="text-sm text-muted-foreground mt-0.5">{course.subtitle}</p>
        )}
      </div>

      {course.description && (
        <p className="text-sm text-muted-foreground line-clamp-2">{course.description}</p>
      )}

      <div className="mt-auto flex items-center justify-between gap-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <BookOpen size={13} />
          {pluralize(course.stageCount, "stage")}
        </span>
        <ArrowRight
          size={14}
          className="text-muted-foreground group-hover:text-brand-text transition-colors"
        />
      </div>
    </Link>
  );
}
