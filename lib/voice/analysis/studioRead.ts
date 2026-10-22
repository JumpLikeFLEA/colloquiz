import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { voiceTaskInfo, type VoiceTaskInfo } from "./context";
import { VOICE_LIST_PAGE_SIZE, toVoiceListRow, type VoiceListFilters, type VoiceListRow } from "./studioList";

/**
 * What Studio reads about analysed takes (VOICE-015, docs/decisions/0190). Everything is read under
 * the author's own session, so 096's editor policy on voice_analyses and 060's on voice_submissions
 * decide the rows. Two reads need the service role, and each runs only AFTER an editor read has
 * returned the row, on that row's own ids, and returns one value and no row (the 0189 Decision 1
 * pattern):
 *
 *  - the learner's contact label (learner_contact_label, 073): an editor cannot read auth.users;
 *  - a final's baseline take id (`baseline_submission_id` is not granted to any app role).
 *
 * The caller's own takes on courses they do not edit are also visible to them through the OWNER
 * policy, so a list scoped only by RLS would show an author their own practice takes on someone
 * else's course. `courseIds` (null for an admin) is therefore always applied explicitly.
 */

export type AnalysisData = {
  submissionId: string;
  status: string;
  hiddenAt: string | null;
  transcript: string | null;
  result: unknown;
  instruction: string | null;
  promptVersion: string | null;
  model: string | null;
  baseline: { transcript: string; result: unknown } | null;
};

export type ListItem = VoiceListRow & {
  courseTitle: string;
  lessonTitle: string;
  learner: string;
};

/** Contact labels for some users, from SECURITY DEFINER SQL. A failed read gives "" (the page shows "Unknown"). */
export async function contactLabels(userIds: readonly string[], admin: SupabaseClient = createAdminClient()) {
  const labels = new Map<string, string>();
  await Promise.all(
    [...new Set(userIds)].map(async (id) => {
      const { data, error } = await admin.rpc("learner_contact_label", { p_user: id });
      if (error) console.error("learner_contact_label:", error.message);
      labels.set(id, typeof data === "string" ? data : "");
    }),
  );
  return labels;
}

/**
 * One page of analysed takes, newest first. `courseIds` null = every course (an admin); an empty
 * list matches nothing. `filters.course`, when set, narrows further and must itself be in scope.
 */
export async function listAnalysedTakes(
  supabase: SupabaseClient,
  courseIds: string[] | null,
  filters: VoiceListFilters,
): Promise<{ items: ListItem[]; total: number }> {
  const scope = filters.course ? [filters.course] : courseIds;
  if (scope && courseIds && !scope.every((c) => courseIds.includes(c))) return { items: [], total: 0 };
  if (scope && scope.length === 0) return { items: [], total: 0 };

  const from = (filters.page - 1) * VOICE_LIST_PAGE_SIZE;
  let query = supabase
    .from("voice_analyses")
    .select(
      "submission_id, status, hidden_at, created_at, voice_submissions!submission_id!inner(id, user_id, course_id, lesson_id, block_id, enrolment_id, object_name, submitted_at)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, from + VOICE_LIST_PAGE_SIZE - 1);
  if (scope) query = query.in("voice_submissions.course_id", scope);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []).flatMap((r) => {
    const row = toVoiceListRow(r);
    return row ? [row] : [];
  });
  if (rows.length === 0) return { items: [], total: count ?? 0 };

  const [courses, lessons, labels] = await Promise.all([
    supabase.from("courses").select("id, title").in("id", [...new Set(rows.map((r) => r.courseId))]),
    supabase.from("lessons").select("id, title").in("id", [...new Set(rows.map((r) => r.lessonId))]),
    contactLabels(rows.map((r) => r.userId)),
  ]);
  if (courses.error) throw new Error(courses.error.message);
  if (lessons.error) throw new Error(lessons.error.message);
  const courseTitle = new Map((courses.data ?? []).map((c) => [c.id as string, c.title as string]));
  const lessonTitle = new Map((lessons.data ?? []).map((l) => [l.id as string, l.title as string]));

  return {
    total: count ?? rows.length,
    items: rows.map((r) => ({
      ...r,
      courseTitle: courseTitle.get(r.courseId) ?? "Unknown course",
      lessonTitle: lessonTitle.get(r.lessonId) ?? "Unknown lesson",
      learner: labels.get(r.userId) || "Unknown learner",
    })),
  };
}

/**
 * The analyses of some takes (the caller has already proved they edit those takes' courses).
 * A final carries the first take's transcript and result; the baseline is read under the session
 * too, so one the editor policy hides simply is not there.
 */
export async function readAnalyses(
  supabase: SupabaseClient,
  submissionIds: readonly string[],
  admin: () => SupabaseClient = createAdminClient,
): Promise<Map<string, AnalysisData>> {
  const out = new Map<string, AnalysisData>();
  if (submissionIds.length === 0) return out;

  const { data, error } = await supabase
    .from("voice_analyses")
    .select("submission_id, status, hidden_at, transcript, result, instruction, prompt_version, model")
    .in("submission_id", [...submissionIds]);
  if (error) throw new Error(error.message);
  for (const r of data ?? []) {
    out.set(r.submission_id as string, {
      submissionId: r.submission_id as string,
      status: r.status as string,
      hiddenAt: (r.hidden_at as string | null) ?? null,
      transcript: (r.transcript as string | null) ?? null,
      result: r.result,
      instruction: (r.instruction as string | null) ?? null,
      promptVersion: (r.prompt_version as string | null) ?? null,
      model: (r.model as string | null) ?? null,
      baseline: null,
    });
  }

  const finals = [...out.values()].filter((a) => a.instruction === "final" && a.status === "done").map((a) => a.submissionId);
  if (finals.length === 0) return out;

  const links = await admin().from("voice_analyses").select("submission_id, baseline_submission_id").in("submission_id", finals);
  if (links.error) throw new Error(links.error.message);
  const baselineOf = new Map<string, string>();
  for (const l of links.data ?? []) if (l.baseline_submission_id) baselineOf.set(l.submission_id as string, l.baseline_submission_id as string);
  if (baselineOf.size === 0) return out;

  const base = await supabase
    .from("voice_analyses")
    .select("submission_id, status, transcript, result")
    .in("submission_id", [...new Set(baselineOf.values())]);
  if (base.error) throw new Error(base.error.message);
  const done = new Map(
    (base.data ?? [])
      .filter((b) => b.status === "done" && typeof b.transcript === "string")
      .map((b) => [b.submission_id as string, { transcript: b.transcript as string, result: b.result }]),
  );
  for (const [id, baseId] of baselineOf) {
    const b = done.get(baseId);
    if (b) out.get(id)!.baseline = b;
  }
  return out;
}

export type TakeDetail = {
  submissionId: string;
  userId: string;
  courseId: string;
  lessonId: string;
  blockId: string;
  versionId: string;
  objectName: string | null;
  sentAt: string;
  cohort: boolean;
};

/** One take, as RLS shows it to this caller. Null when it does not exist or is not theirs to see. */
export async function readTake(supabase: SupabaseClient, submissionId: string): Promise<TakeDetail | null> {
  const { data, error } = await supabase
    .from("voice_submissions")
    .select("id, user_id, course_id, lesson_id, block_id, lesson_version_id, object_name, submitted_at, enrolment_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (error) {
    // A malformed id is a cast error, and to the page the same as "no such take".
    if (error.code === "22P02") return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  return {
    submissionId: data.id as string,
    userId: data.user_id as string,
    courseId: data.course_id as string,
    lessonId: data.lesson_id as string,
    blockId: data.block_id as string,
    versionId: data.lesson_version_id as string,
    objectName: (data.object_name as string | null) ?? null,
    sentAt: data.submitted_at as string,
    cohort: data.enrolment_id != null,
  };
}

/** The voice task as authored in the version the take was recorded against. */
export async function readTaskOf(supabase: SupabaseClient, versionId: string, blockId: string): Promise<VoiceTaskInfo | null> {
  const { data, error } = await supabase.from("lesson_versions").select("document").eq("id", versionId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const found = voiceTaskInfo(data.document, blockId);
  return found.ok ? found.task : null;
}
