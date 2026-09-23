import { createClient } from "@/lib/supabase/server";

// Read side of the lesson content editor (AUTH-002). Same admin-only-by-the-
// page pattern as lib/courseAuthoring.ts: "lesson_versions: editor read"
// (migration 041) lets any course editor read every version via
// can_edit_course, not just admins, so the page component's admin gate is
// what's load-bearing here, not RLS alone.

export type LessonContentDraft = {
  lessonId: string;
  lessonTitle: string;
  courseId: string;
  /** The latest lesson_versions row's document — the current draft — or an
   * empty array for a lesson with no saved content yet. */
  document: unknown[];
  /** The latest version's id, sent back as `baseVersionId` on save so
   * `save_lesson_version` can detect a concurrent edit. Null when the lesson
   * has no versions yet (a brand-new lesson). */
  baseVersionId: string | null;
};

export async function getLessonContentDraft(lessonId: string): Promise<LessonContentDraft | null> {
  const supabase = await createClient();

  const { data: lesson, error: lessonErr } = await supabase
    .from("lessons")
    .select("id, title, course_id")
    .eq("id", lessonId)
    .maybeSingle();
  if (lessonErr) throw new Error(lessonErr.message);
  if (!lesson) return null;

  const { data: latest, error: versionErr } = await supabase
    .from("lesson_versions")
    .select("id, document")
    .eq("lesson_id", lessonId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (versionErr) throw new Error(versionErr.message);

  return {
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    courseId: lesson.course_id,
    document: (latest?.document as unknown[] | undefined) ?? [],
    baseVersionId: latest?.id ?? null,
  };
}

export type LessonVersionSummary = {
  id: string;
  createdAt: string;
  source: "import" | "editor";
  authorDisplayName: string | null;
  authorFullName: string | null;
};

export async function listLessonVersions(lessonId: string): Promise<LessonVersionSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lesson_versions")
    .select("id, created_at, source, profiles(display_name, full_name)")
    .eq("lesson_id", lessonId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((v) => {
    const profileRow = v.profiles as
      | { display_name: string | null; full_name: string | null }
      | { display_name: string | null; full_name: string | null }[]
      | null;
    const profile = Array.isArray(profileRow) ? (profileRow[0] ?? null) : profileRow;
    return {
      id: v.id,
      createdAt: v.created_at,
      source: v.source as "import" | "editor",
      authorDisplayName: profile?.display_name ?? null,
      authorFullName: profile?.full_name ?? null,
    };
  });
}

export async function getLessonVersionDocument(lessonId: string, versionId: string): Promise<unknown[] | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lesson_versions")
    .select("document")
    .eq("lesson_id", lessonId)
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  return data.document as unknown[];
}
