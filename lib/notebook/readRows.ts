import type { CompletionRow } from "./record";
import type { NotebookEntry, NotebookSummary, NotebookTake, ReadableLesson, TryGateRow } from "./types";

/** Database rows, as `lib/notebookData.ts` selects them, into the model's shapes (PROG-014, 0240). */

export type TakeRow = {
  id: string;
  course_id: string;
  lesson_id: string;
  submitted_at: string;
  enrolment_id: string | null;
  object_name: string | null;
  content_type: string | null;
  run_enrolments: { course_runs: { ends_at: string } | null } | null;
};

/** A take has no stored titles: its own copied summary or entry has the ones from write time, for a
 * lesson that can no longer be read. */
export function toTakes(
  rows: readonly TakeRow[],
  entries: readonly NotebookEntry[],
  summaries: readonly NotebookSummary[],
): NotebookTake[] {
  const titles = new Map<string, { courseTitle: string | null; lessonTitle: string | null }>();
  for (const e of entries) if (e.kind !== "own") titles.set(e.submissionId, e);
  for (const s of summaries) titles.set(s.submissionId, s);
  return rows.map((r) => ({
    id: r.id,
    courseId: r.course_id,
    lessonId: r.lesson_id,
    courseTitle: titles.get(r.id)?.courseTitle ?? null,
    lessonTitle: titles.get(r.id)?.lessonTitle ?? null,
    submittedAt: r.submitted_at,
    enrolmentId: r.enrolment_id,
    runEndsAt: r.run_enrolments?.course_runs?.ends_at ?? null,
    objectName: r.object_name,
    contentType: r.content_type ?? null,
  }));
}

export type LessonRow = {
  id: string;
  course_id: string;
  slug: string;
  title: string;
  ordinal: number;
  archived_at: string | null;
  /** The PUBLISHED version only (the embed is by `published_version_id`); null when RLS hides it. */
  version: { document: unknown } | null;
};

export function toLessons(rows: readonly LessonRow[]): ReadableLesson[] {
  return rows.map((r) => ({
    id: r.id,
    courseId: r.course_id,
    slug: r.slug,
    title: r.title,
    ordinal: r.ordinal,
    archived: r.archived_at !== null,
    document: Array.isArray(r.version?.document) ? r.version.document : null,
  }));
}

export function toGate(rows: readonly { course_id: string; has_before: boolean; before_taken: boolean }[]): TryGateRow[] {
  return rows.map((r) => ({ courseId: r.course_id, hasBefore: r.has_before, beforeTaken: r.before_taken }));
}

export function toCompletion(
  courseId: string,
  rows: readonly { lesson_slug: string; complete: boolean }[],
): CompletionRow[] {
  return rows.map((r) => ({ courseId, lessonSlug: r.lesson_slug, complete: r.complete }));
}

/** Every course the page names or links: started ones (the gate answers for all of them), and those
 * of stored rows. */
export function courseIds(gate: readonly TryGateRow[], rows: readonly { courseId: string | null }[]): string[] {
  return [...new Set([...gate.map((g) => g.courseId), ...rows.flatMap((r) => (r.courseId ? [r.courseId] : []))])];
}
