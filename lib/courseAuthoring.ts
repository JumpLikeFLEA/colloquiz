import { createClient } from "@/lib/supabase/server";
import type { CefrLevel } from "@/lib/courseLevels";

// Read side of Admin > Courses (AUTH-001).
//
// ADMIN-ONLY BY THE PAGE, NOT BY RLS: unlike lib/feedbackQueue.ts, `courses`
// and `lessons` are readable by any signed-in course editor too ("courses:
// editor read" / "lessons: editor read", migrations 035/041), not just
// admins — RLS alone would let a non-admin editor list every course's
// metadata via this same query. The admin-only gate lives in the page
// component (docs/decisions/0025: this first authoring UI is admin-only,
// not yet opened to delegated editors), so treat that check as load-bearing,
// not a formality this module could skip.

export type AuthoredCourse = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  level: CefrLevel;
  status: "draft" | "published";
  lessonCount: number;
};

export async function listAuthoredCourses(): Promise<AuthoredCourse[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .select("id, slug, title, description, level, status, lessons(count)")
    .order("title");
  if (error) throw new Error(error.message);

  return (data ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    description: c.description,
    level: c.level as CefrLevel,
    status: c.status as "draft" | "published",
    lessonCount: (c.lessons as { count: number }[] | null)?.[0]?.count ?? 0,
  }));
}

export type AuthoredLesson = {
  id: string;
  slug: string;
  ordinal: number;
  title: string;
  description: string | null;
  estimatedMinutes: number | null;
  inFreeSample: boolean;
  archivedAt: string | null;
  publishedVersionId: string | null;
  publishedItemCount: number;
};

export type CourseEditor = {
  userId: string;
  grantedAt: string;
  displayName: string | null;
  fullName: string | null;
};

export type AuthoredCourseDetail = {
  course: AuthoredCourse;
  lessons: AuthoredLesson[];
  editors: CourseEditor[];
};

export async function getAuthoredCourseDetail(courseId: string): Promise<AuthoredCourseDetail | null> {
  const supabase = await createClient();

  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .select("id, slug, title, description, level, status")
    .eq("id", courseId)
    .maybeSingle();
  if (courseErr) throw new Error(courseErr.message);
  if (!course) return null;

  const { data: lessons, error: lessonsErr } = await supabase
    .from("lessons")
    .select(
      "id, slug, ordinal, title, description, estimated_minutes, in_free_sample, archived_at, published_version_id, published_item_count",
    )
    .eq("course_id", courseId)
    .order("ordinal");
  if (lessonsErr) throw new Error(lessonsErr.message);

  // course_editors has two FKs to profiles (user_id, granted_by), so the
  // implicit embed below is ambiguous to PostgREST without a hint — "!user_id"
  // picks the FK by column name rather than the (unnamed-in-migration, so
  // auto-generated) constraint name.
  const { data: editors, error: editorsErr } = await supabase
    .from("course_editors")
    .select("user_id, granted_at, profiles!user_id(display_name, full_name)")
    .eq("course_id", courseId);
  if (editorsErr) throw new Error(editorsErr.message);

  return {
    course: {
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      level: course.level as CefrLevel,
      status: course.status as "draft" | "published",
      lessonCount: (lessons ?? []).length,
    },
    lessons: (lessons ?? []).map((l) => ({
      id: l.id,
      slug: l.slug,
      ordinal: l.ordinal,
      title: l.title,
      description: l.description,
      estimatedMinutes: l.estimated_minutes,
      inFreeSample: l.in_free_sample,
      archivedAt: l.archived_at,
      publishedVersionId: l.published_version_id,
      publishedItemCount: l.published_item_count,
    })),
    editors: (editors ?? []).map((e) => {
      const profileRow = e.profiles as
        | { display_name: string | null; full_name: string | null }
        | { display_name: string | null; full_name: string | null }[]
        | null;
      const profile = Array.isArray(profileRow) ? (profileRow[0] ?? null) : profileRow;
      return {
        userId: e.user_id,
        grantedAt: e.granted_at,
        displayName: profile?.display_name ?? null,
        fullName: profile?.full_name ?? null,
      };
    }),
  };
}
