/**
 * PROG-007 (docs/decisions/0191): the pure half of "your AI feedback" on `/my`. The learner's own
 * finished, shown analyses, newest take first. Import-free apart from other pure lib modules, so
 * the "unit" vitest project can load it (docs/decisions/0004).
 *
 * Nothing here decides access: every input is a row 096's RLS and `user_id = me` already let
 * through. These functions only turn a PostgREST row into the shape the page draws and drop a row
 * that is not the shape asked for.
 */

/** How many takes `/my` lists. The list is a doorway to the lesson, not an archive. */
export const LEARNER_ANALYSIS_LIMIT = 12;

export type LearnerAnalysisRow = {
  submissionId: string;
  sentAt: string;
  /** `first` for a first or stand-alone take, `final` for the take compared with an earlier one. */
  kind: "first" | "final";
  courseSlug: string | null;
  courseTitle: string | null;
  lessonSlug: string | null;
  lessonTitle: string | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

// PostgREST embeds a to-one relation as an object; tolerate a one-element array too.
function one(v: unknown): Record<string, unknown> | null {
  const o = Array.isArray(v) ? v[0] : v;
  return typeof o === "object" && o !== null ? (o as Record<string, unknown>) : null;
}

/** One row of the list query, or null when it is not the shape asked for or not a shown, finished analysis. */
export function toLearnerAnalysisRow(raw: unknown): LearnerAnalysisRow | null {
  const r = one(raw);
  if (!r) return null;
  const submissionId = str(r.id);
  const sentAt = str(r.submitted_at);
  const analysis = one(r.voice_analyses);
  if (!submissionId || !sentAt || !analysis) return null;
  // The query already asks for these; a row that is neither done nor shown is dropped here too,
  // so a changed query cannot widen what the learner is told is "feedback".
  if (analysis.status !== "done" || analysis.hidden_at != null) return null;
  const lesson = one(r.lessons);
  const course = one(r.courses);
  return {
    submissionId,
    sentAt,
    kind: analysis.instruction === "final" ? "final" : "first",
    courseSlug: str(course?.slug),
    courseTitle: str(course?.title),
    lessonSlug: str(lesson?.slug),
    lessonTitle: str(lesson?.title),
  };
}

export function toLearnerAnalysisRows(raw: readonly unknown[]): LearnerAnalysisRow[] {
  const rows: LearnerAnalysisRow[] = [];
  for (const r of raw) {
    const row = toLearnerAnalysisRow(r);
    if (row) rows.push(row);
  }
  return rows.sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt));
}

/** Where a row's lesson opens, or null when its course or lesson is no longer readable. */
export function learnerAnalysisHref(row: Pick<LearnerAnalysisRow, "courseSlug" | "lessonSlug">): string | null {
  return row.courseSlug && row.lessonSlug ? `/courses/${row.courseSlug}/${row.lessonSlug}` : null;
}
