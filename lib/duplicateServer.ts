import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { courseAuthoringErrorResponse } from "@/lib/courseAuthoringErrors";
import { LESSON_IMAGE_BUCKET } from "@/lib/lessonImages";
import { planImageCopies, urlMapOf, type ImageCopy } from "@/lib/duplicateImages";

/**
 * Server half of duplicating a lesson or course (AUTH-022,
 * docs/decisions/0214). SQL cannot copy Storage objects, so the route copies
 * them first with the service role, then calls the RPC with the old -> new URL
 * map; on any failure the copies are removed again.
 *
 * The service role must never act for someone who may not write, so the
 * caller is checked against the same two predicates the RPC applies
 * (can_edit_course, studio_can_write) BEFORE a byte is copied. The RPC still
 * decides; this check only keeps a refused caller from leaving orphan objects.
 */

type Refusal = { status: number; body: { error: string } };
type Prepared = { refusal: Refusal } | { plan: ImageCopy[]; urlMap: Record<string, string> };

async function refusalFor(supabase: SupabaseClient, userId: string, courseId: string): Promise<Refusal | null> {
  const [edit, write] = await Promise.all([
    supabase.rpc("can_edit_course", { p_course_id: courseId, p_user_id: userId }),
    supabase.rpc("studio_can_write"),
  ]);
  if (edit.error || write.error) throw new Error((edit.error ?? write.error)!.message);
  if (edit.data !== true) return courseAuthoringErrorResponse("forbidden");
  if (write.data !== true) return courseAuthoringErrorResponse("seat_lapsed");
  return null;
}

/** Latest document of each given lesson, read under the caller's own RLS. */
async function latestDocuments(supabase: SupabaseClient, lessonIds: string[]): Promise<unknown[]> {
  if (lessonIds.length === 0) return [];
  const { data, error } = await supabase
    .from("lesson_versions")
    .select("lesson_id, document, created_at")
    .in("lesson_id", lessonIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const seen = new Set<string>();
  const docs: unknown[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.lesson_id)) continue;
    seen.add(row.lesson_id);
    docs.push(row.document);
  }
  return docs;
}

/** Plan and perform the object copies for ONE lesson, into its own course. */
export async function prepareLessonCopy(supabase: SupabaseClient, userId: string, courseId: string, lessonId: string): Promise<Prepared> {
  const refusal = await refusalFor(supabase, userId, courseId);
  if (refusal) return { refusal };
  const plan = planImageCopies(courseId, courseId, await latestDocuments(supabase, [lessonId]), null, randomUUID);
  await copyObjects(plan);
  return { plan, urlMap: urlMapOf(plan) };
}

/** Plan and perform the object copies for a whole course, into `newCourseId`'s prefix. */
export async function prepareCourseCopy(supabase: SupabaseClient, userId: string, courseId: string, newCourseId: string): Promise<Prepared> {
  const refusal = await refusalFor(supabase, userId, courseId);
  if (refusal) return { refusal };
  const [{ data: lessons, error: lessonsError }, { data: course, error: courseError }] = await Promise.all([
    supabase.from("lessons").select("id").eq("course_id", courseId).is("archived_at", null),
    supabase.from("courses").select("cover_image_url").eq("id", courseId).maybeSingle(),
  ]);
  if (lessonsError || courseError) throw new Error((lessonsError ?? courseError)!.message);
  const docs = await latestDocuments(supabase, (lessons ?? []).map((l) => l.id));
  const plan = planImageCopies(courseId, newCourseId, docs, course?.cover_image_url, randomUUID);
  await copyObjects(plan);
  return { plan, urlMap: urlMapOf(plan) };
}

async function copyObjects(plan: ImageCopy[]): Promise<void> {
  const bucket = createAdminClient().storage.from(LESSON_IMAGE_BUCKET);
  const done: ImageCopy[] = [];
  try {
    for (const p of plan) {
      const { error } = await bucket.copy(p.from, p.to);
      if (error) throw new Error(`copy ${p.from}: ${error.message}`);
      done.push(p);
    }
  } catch (e) {
    await discardCopies(done);
    throw e;
  }
}

/** Remove copies made for an RPC that then refused or failed. Logged, never thrown. */
export async function discardCopies(plan: readonly ImageCopy[]): Promise<void> {
  if (plan.length === 0) return;
  try {
    const { error } = await createAdminClient()
      .storage.from(LESSON_IMAGE_BUCKET)
      .remove(plan.map((p) => p.to));
    if (error) throw error;
  } catch (e) {
    console.error("duplicate: copied lesson images not removed", e);
  }
}
