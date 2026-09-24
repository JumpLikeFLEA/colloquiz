import { createClient } from "@/lib/supabase/server";
import type { CefrLevel } from "@/lib/courseLevels";

// Read side of Admin > Courses (AUTH-001), opened to delegated editors by
// AUTH-007 (docs/decisions/0041).
//
// PAGE-LEVEL GATE, NOT RLS ALONE: `courses` and `lessons` are readable by any
// signed-in course editor too ("courses: editor read" / "lessons: editor
// read", migrations 035/041) via `can_edit_course`, not just admins — so RLS
// alone scopes a query to "every course this caller may edit or read as
// published", never to "every course in the database". The page decides who
// may call these functions at all (lib/courseAccess.ts's `getCourseAccess`/
// `canEditCourse`, backed by the same `can_edit_course` RPC); `courseIds`
// below is this module's own additional narrowing for a non-admin editor's
// course LIST, so an editor of course A never sees course B's row just
// because "courses: published read" (028) would otherwise let them read it.

export type AuthoredCourse = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  level: CefrLevel;
  status: "draft" | "published";
  lessonCount: number;
};

/** `courseIds` narrows to a non-admin editor's own courses (see header
 * comment); omitted (admin) lists every course. An empty array is a real,
 * distinct input — a granted-nothing editor — and must return no rows, not
 * "no filter": `.in("id", [])` does that correctly, so no special-case
 * branch is needed for it. */
export async function listAuthoredCourses(courseIds?: string[]): Promise<AuthoredCourse[]> {
  const supabase = await createClient();
  let query = supabase
    .from("courses")
    .select("id, slug, title, description, level, status, lessons(count)")
    .order("title");
  if (courseIds !== undefined) query = query.in("id", courseIds);
  const { data, error } = await query;
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

/** `includeEditors` is false for a non-admin caller: the Editors section
 * (grant/revoke) is admin-only (`grant_course_editor`/`revoke_course_editor`
 * stay `is_admin`-gated, 029), so a non-admin editor's page has nothing to
 * show there and the query — a second round trip — is skipped rather than
 * fetched and then hidden. */
export async function getAuthoredCourseDetail(
  courseId: string,
  includeEditors = true,
): Promise<AuthoredCourseDetail | null> {
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
  let editors: { user_id: string; granted_at: string; profiles: unknown }[] = [];
  if (includeEditors) {
    const { data, error } = await supabase
      .from("course_editors")
      .select("user_id, granted_at, profiles!user_id(display_name, full_name)")
      .eq("course_id", courseId);
    if (error) throw new Error(error.message);
    editors = data ?? [];
  }

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
