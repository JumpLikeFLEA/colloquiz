import type { SupabaseClient } from "@supabase/supabase-js";
import type { TheoryBlock } from "@/lib/courseContent";

// Server data layer for the course surfaces (catalogue, syllabus). Reads go
// through RLS as the caller: the "courses/course_stages: published read"
// policies scope the catalogue, and get_course_progress() (SECURITY INVOKER)
// scopes progress to the caller. Writes are never done here — enrollment and
// stage play go through the SECURITY DEFINER RPCs via the API routes.
//
// The presentational types below are what the client Views consume; a client
// component imports them with `import type` (erased at compile time), so this
// module's next/headers-bound Supabase import never reaches the browser.

export type CourseCard = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  icon: string | null;
  color: string | null;
  access: "free" | "paid";
  stageCount: number;
};

// The display state of a single stage in the syllabus, collapsing the raw
// progress row (state + unlocked + needs_review) into one badge value.
export type StageDisplayState =
  | "locked" // earlier stages incomplete — not yet reachable
  | "available" // unlocked, never attempted
  | "in_progress" // unlocked, attempted but not passed
  | "complete" // passed
  | "needs_review"; // passed, but a practice/check answer since went wrong

export type SyllabusStage = {
  id: string;
  key: string;
  position: number;
  title: string;
  summary: string | null;
  subtopic: string | null;
  state: StageDisplayState;
  bestScore: number | null;
  attempts: number;
};

export type CourseSyllabus = {
  course: CourseCard;
  enrolled: boolean;
  passThreshold: number;
  stages: SyllabusStage[];
};

export type EnrolledCourse = CourseCard & {
  completedStages: number;
  totalStages: number;
  /** Whole-number percentage of stages completed. */
  percent: number;
  /** First unlocked, not-yet-complete stage — the "Continue" target. Null when done. */
  next: { key: string; title: string } | null;
};

// One row of get_course_progress(). state is null when the caller has no
// progress row for the stage yet (LEFT JOIN in the RPC).
type ProgressRow = {
  stage_id: string;
  state: "in_progress" | "complete" | null;
  best_score: number | null;
  attempts: number;
  needs_review: boolean;
  unlocked: boolean;
};

function toCard(row: Record<string, unknown>, stageCount: number): CourseCard {
  return {
    id: row.id as string,
    slug: row.slug as string,
    title: row.title as string,
    subtitle: (row.subtitle as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    icon: (row.icon as string | null) ?? null,
    color: (row.color as string | null) ?? null,
    access: (row.access as "free" | "paid") ?? "free",
    stageCount,
  };
}

function deriveState(p: ProgressRow | undefined): StageDisplayState {
  if (!p) return "locked";
  if (p.state === "complete") return p.needs_review ? "needs_review" : "complete";
  if (!p.unlocked) return "locked";
  return p.attempts > 0 || p.state === "in_progress" ? "in_progress" : "available";
}

// ── Catalogue ───────────────────────────────────────────────

/**
 * Every published course, with a non-archived stage count. RLS ("courses:
 * published read") already restricts the select to published rows, so no status
 * filter is needed here.
 */
export async function getPublishedCourses(supabase: SupabaseClient): Promise<CourseCard[]> {
  const { data: courses, error } = await supabase
    .from("courses")
    .select("id, slug, title, subtitle, description, icon, color, access")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = courses ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((c) => c.id as string);
  const { data: stages } = await supabase
    .from("course_stages")
    .select("course_id")
    .in("course_id", ids)
    .is("archived_at", null);

  const count = new Map<string, number>();
  for (const s of stages ?? []) count.set(s.course_id, (count.get(s.course_id) ?? 0) + 1);

  return rows.map((c) => toCard(c, count.get(c.id as string) ?? 0));
}

/**
 * The caller's enrolled courses, enriched with completion percentage and the
 * next stage to continue. One get_course_progress() call per enrolled course —
 * fine at this cardinality (a learner has a handful of courses, not hundreds).
 */
export async function getMyEnrollments(
  supabase: SupabaseClient,
  userId: string,
): Promise<EnrolledCourse[]> {
  const { data: enr, error } = await supabase
    .from("course_enrollments")
    .select("course_id, started_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false });
  if (error) throw new Error(error.message);

  const ids = (enr ?? []).map((e) => e.course_id as string);
  if (ids.length === 0) return [];

  const [{ data: courses }, { data: stages }] = await Promise.all([
    supabase
      .from("courses")
      .select("id, slug, title, subtitle, description, icon, color, access")
      .in("id", ids),
    supabase
      .from("course_stages")
      .select("id, key, title, position, course_id")
      .in("course_id", ids)
      .is("archived_at", null)
      .order("position", { ascending: true }),
  ]);

  const courseById = new Map((courses ?? []).map((c) => [c.id as string, c]));

  const out: EnrolledCourse[] = [];
  // Preserve enrollment order (most recently started first).
  for (const id of ids) {
    const course = courseById.get(id);
    if (!course) continue; // course unpublished since enrolling — hidden by RLS

    const courseStages = (stages ?? []).filter((s) => s.course_id === id);
    const { data: progress } = await supabase.rpc("get_course_progress", { p_course_id: id });
    const byStage = new Map<string, ProgressRow>(
      ((progress ?? []) as ProgressRow[]).map((p) => [p.stage_id, p]),
    );

    let completed = 0;
    let next: { key: string; title: string } | null = null;
    for (const s of courseStages) {
      const p = byStage.get(s.id as string);
      const state = deriveState(p);
      if (state === "complete" || state === "needs_review") completed++;
      if (!next && p?.unlocked && p.state !== "complete") {
        next = { key: s.key as string, title: s.title as string };
      }
    }

    const totalStages = courseStages.length;
    out.push({
      ...toCard(course, totalStages),
      completedStages: completed,
      totalStages,
      percent: totalStages > 0 ? Math.round((completed / totalStages) * 100) : 0,
      next,
    });
  }

  return out;
}

// ── Syllabus ────────────────────────────────────────────────

/**
 * A course's full syllabus by slug: every non-archived stage with its display
 * state, plus whether the caller is enrolled (drives Start vs Continue). Returns
 * null when the slug is absent or unpublished — a stranger can't tell the two
 * apart. Progress is read even before enrolling: get_course_progress() reports
 * stage 1 as unlocked and the rest as locked for an authenticated user, which is
 * exactly the "stage 1 open, others locked" preview the syllabus wants.
 */
export async function getCourseBySlug(
  supabase: SupabaseClient,
  userId: string,
  slug: string,
): Promise<CourseSyllabus | null> {
  const { data: course } = await supabase
    .from("courses")
    .select("id, slug, title, subtitle, description, icon, color, access, pass_threshold")
    .eq("slug", slug)
    .maybeSingle();
  if (!course) return null;

  const [{ data: stages }, { data: enrollment }, { data: progress }] = await Promise.all([
    supabase
      .from("course_stages")
      .select("id, key, position, title, summary, subtopic")
      .eq("course_id", course.id)
      .is("archived_at", null)
      .order("position", { ascending: true }),
    supabase
      .from("course_enrollments")
      .select("course_id")
      .eq("course_id", course.id)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.rpc("get_course_progress", { p_course_id: course.id }),
  ]);

  const byStage = new Map<string, ProgressRow>(
    ((progress ?? []) as ProgressRow[]).map((p) => [p.stage_id, p]),
  );

  const syllabusStages: SyllabusStage[] = (stages ?? []).map((s) => {
    const p = byStage.get(s.id as string);
    return {
      id: s.id as string,
      key: s.key as string,
      position: s.position as number,
      title: s.title as string,
      summary: (s.summary as string | null) ?? null,
      subtopic: (s.subtopic as string | null) ?? null,
      state: deriveState(p),
      bestScore: p?.best_score != null ? Number(p.best_score) : null,
      attempts: p?.attempts ?? 0,
    };
  });

  return {
    course: toCard(course, syllabusStages.length),
    enrolled: !!enrollment,
    passThreshold: Number(course.pass_threshold ?? 80),
    stages: syllabusStages,
  };
}

// ── Stage page ──────────────────────────────────────────────

export type StageDetail = {
  course: { id: string; slug: string; title: string; passThreshold: number };
  stage: { id: string; key: string; title: string; summary: string | null; subtopic: string | null };
  /** 1-based position among non-archived stages, with the total — "Stage 2 of 12". */
  index: number;
  total: number;
  state: StageDisplayState;
  enrolled: boolean;
  /** Gating truth, shared with enforcement via is_stage_unlocked() in get_course_progress. */
  unlocked: boolean;
  bestScore: number | null;
  attempts: number;
  /** Adjacent stages for in-stage navigation. `next.unlocked` drives the post-pass CTA. */
  prev: { key: string; title: string } | null;
  next: { key: string; title: string; unlocked: boolean } | null;
};

/**
 * One stage of a course by (slug, stageKey), with its display state, gating, and
 * adjacent stages. Returns null when the course or stage is absent or hidden by
 * RLS — a stranger can't distinguish them. get_course_progress is read even
 * before enrolling: it returns a row per non-archived stage (SECURITY INVOKER,
 * no enrollment requirement), reporting stage 1 unlocked and the rest locked, so
 * the page can render an enroll/locked gate rather than crashing on empty theory.
 */
export async function getStageWithProgress(
  supabase: SupabaseClient,
  userId: string,
  slug: string,
  stageKey: string,
): Promise<StageDetail | null> {
  const { data: course } = await supabase
    .from("courses")
    .select("id, slug, title, pass_threshold")
    .eq("slug", slug)
    .maybeSingle();
  if (!course) return null;

  const [{ data: stages }, { data: enrollment }, { data: progress }] = await Promise.all([
    supabase
      .from("course_stages")
      .select("id, key, position, title, summary, subtopic")
      .eq("course_id", course.id)
      .is("archived_at", null)
      .order("position", { ascending: true }),
    supabase
      .from("course_enrollments")
      .select("course_id")
      .eq("course_id", course.id)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.rpc("get_course_progress", { p_course_id: course.id }),
  ]);

  const list = stages ?? [];
  const idx = list.findIndex((s) => s.key === stageKey);
  if (idx === -1) return null; // unknown or archived stage key
  const s = list[idx];

  const byStage = new Map<string, ProgressRow>(
    ((progress ?? []) as ProgressRow[]).map((p) => [p.stage_id, p]),
  );
  const p = byStage.get(s.id as string);
  const prevStage = list[idx - 1];
  const nextStage = list[idx + 1];

  return {
    course: {
      id: course.id as string,
      slug: course.slug as string,
      title: course.title as string,
      passThreshold: Number(course.pass_threshold ?? 80),
    },
    stage: {
      id: s.id as string,
      key: s.key as string,
      title: s.title as string,
      summary: (s.summary as string | null) ?? null,
      subtopic: (s.subtopic as string | null) ?? null,
    },
    index: idx + 1,
    total: list.length,
    state: deriveState(p),
    enrolled: !!enrollment,
    unlocked: p?.unlocked ?? idx === 0,
    bestScore: p?.best_score != null ? Number(p.best_score) : null,
    attempts: p?.attempts ?? 0,
    prev: prevStage ? { key: prevStage.key as string, title: prevStage.title as string } : null,
    next: nextStage
      ? {
          key: nextStage.key as string,
          title: nextStage.title as string,
          unlocked: byStage.get(nextStage.id as string)?.unlocked ?? false,
        }
      : null,
  };
}

/**
 * A stage's theory blocks. Gated by ordinary row-level RLS: the
 * "course_stage_theory: enrolled read" policy returns ZERO rows to a non-enrolled
 * caller (a filter, not a permission error), so an unenrolled read yields []
 * rather than throwing. Blocks are importer-validated; a light shape guard keeps
 * a malformed row from crashing the renderer.
 */
export async function getStageTheory(
  supabase: SupabaseClient,
  stageId: string,
): Promise<TheoryBlock[]> {
  const { data } = await supabase
    .from("course_stage_theory")
    .select("blocks")
    .eq("stage_id", stageId)
    .maybeSingle();
  const blocks = data?.blocks;
  return Array.isArray(blocks) ? (blocks as TheoryBlock[]) : [];
}

// ── Authoring (admin/editor) ─────────────────────────────────
//
// The authoring surface (app/(main)/admin/courses/**) lives OFF the enrolled-only
// learner RLS path: content is edited via SECURITY DEFINER RPCs so an editor need
// not enroll. These helpers give the admin pages a single call for "which courses
// may I edit?" and "give me the whole stage in one shot for the walkthrough".
//
// Not gated on COURSES_ENABLED (that flag guards the LEARNER routes): editing
// works while the feature is dormant so content can be prepared before launch.

export type EditableCourse = CourseCard & { canEditReason: "admin" | "editor" };

/**
 * The courses the caller may edit.
 *   • Admin → every course (published or draft), each tagged canEditReason:'admin'.
 *   • Non-admin → only the courses they have a course_editors row for (via the
 *     "course_editors: self read" policy), each tagged canEditReason:'editor'.
 *
 * Empty list = the caller has no authoring rights anywhere; the page should
 * render Forbidden. Two calls (courses + stage counts) mirror getPublishedCourses.
 */
export async function getEditableCourses(
  supabase: SupabaseClient,
  isAdmin: boolean,
): Promise<EditableCourse[]> {
  let courseIds: string[] | null = null;
  let reason: "admin" | "editor" = "admin";

  if (!isAdmin) {
    reason = "editor";
    const { data: grants, error: grantsErr } = await supabase
      .from("course_editors")
      .select("course_id");
    if (grantsErr) throw new Error(grantsErr.message);
    courseIds = (grants ?? []).map((g) => g.course_id as string);
    if (courseIds.length === 0) return [];
  }

  const query = supabase
    .from("courses")
    .select("id, slug, title, subtitle, description, icon, color, access")
    .order("created_at", { ascending: true });

  const { data: courses, error } = courseIds ? await query.in("id", courseIds) : await query;
  if (error) throw new Error(error.message);

  const rows = courses ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((c) => c.id as string);
  const { data: stages } = await supabase
    .from("course_stages")
    .select("course_id")
    .in("course_id", ids)
    .is("archived_at", null);
  const count = new Map<string, number>();
  for (const s of stages ?? []) count.set(s.course_id, (count.get(s.course_id) ?? 0) + 1);

  return rows.map((c) => ({ ...toCard(c, count.get(c.id as string) ?? 0), canEditReason: reason }));
}

// A variant row in the authoring payload. authored_key/updated_by drive the
// "hand-authored" and "edited in-app" badges the editor shows. Editable-in-UI
// fields are question/options/correct_answer/explanation/difficulty and the
// per-variant variant_ordinal; status/visibility/authored_key are read-only.
export type AuthoringVariant = {
  id: string;
  question: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  difficulty: string;
  variant_ordinal: number;
  status: string;
  visibility: string;
  authored_key: string | null;
  updated_by: string | null;
};

export type AuthoringGroup = {
  variant_group: string;
  siblings: AuthoringVariant[];
};

export type StageAuthoring = {
  stageId: string;
  blocks: TheoryBlock[];
  /** ISO timestamp; null when no theory row exists yet (fresh stage). The
   * client sends it back with save_stage_theory as the concurrency token. */
  updatedAt: string | null;
  groups: AuthoringGroup[];
  /** Explicit ordering of variant_group labels (migration 032). Empty array
   * for a stage whose exercises row does not exist yet (importer-only). */
  groupOrder: string[];
  /** Concurrency token for the whole-stage exercise save; null when the
   * course_stage_exercises row does not exist yet. */
  exercisesUpdatedAt: string | null;
};

/**
 * One-shot read of everything the StageEditor needs: theory blocks + concurrency
 * token + read-only exercises. Runs get_stage_authoring (SECURITY DEFINER,
 * 029), which internally guards can_edit_course and bypasses the enrolled-only
 * theory RLS. Returns null when the caller lacks edit rights or the stage does
 * not exist (a stranger cannot distinguish the two).
 */
export async function getStageAuthoring(
  supabase: SupabaseClient,
  stageId: string,
): Promise<StageAuthoring | null> {
  const { data, error } = await supabase.rpc("get_stage_authoring", { p_stage_id: stageId });
  if (error) throw new Error(error.message);
  if (!data?.ok) return null;
  return {
    stageId: data.stage_id as string,
    blocks: Array.isArray(data.blocks) ? (data.blocks as TheoryBlock[]) : [],
    updatedAt: (data.updated_at as string | null) ?? null,
    groups: Array.isArray(data.groups) ? (data.groups as AuthoringGroup[]) : [],
    groupOrder: Array.isArray(data.group_order) ? (data.group_order as string[]) : [],
    exercisesUpdatedAt: (data.exercises_updated_at as string | null) ?? null,
  };
}
