import type { ImportConversion, ImportQa, ImportQaLesson } from "./qa";

/**
 * Reads course_imports.qa (written by buildQa in qa.ts) for the import page (CNT-019). The column
 * is JSONB the author's session reads back, so nothing about its shape is assumed: anything that is
 * not the shape comes out empty rather than throwing, and a row with no readable report is null.
 */

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function conversions(v: unknown): ImportConversion[] {
  if (!Array.isArray(v)) return [];
  const out: ImportConversion[] = [];
  for (const c of v) {
    if (c && typeof c === "object" && typeof (c as ImportConversion).blockId === "string" && typeof (c as ImportConversion).from === "string") {
      out.push({ blockId: (c as ImportConversion).blockId, from: (c as ImportConversion).from });
    }
  }
  return out;
}

function lesson(v: unknown): ImportQaLesson | null {
  if (!v || typeof v !== "object") return null;
  const l = v as Record<string, unknown>;
  if (typeof l.slug !== "string" || typeof l.title !== "string") return null;
  return {
    slug: l.slug,
    title: l.title,
    exercises: typeof l.exercises === "number" ? l.exercises : 0,
    estimatedMinutes: typeof l.estimatedMinutes === "number" ? l.estimatedMinutes : null,
    notes: strings(l.notes),
    conversions: conversions(l.conversions),
    flags: strings(l.flags),
  };
}

export function readStoredQa(value: unknown): ImportQa | null {
  if (!value || typeof value !== "object") return null;
  const q = value as Record<string, unknown>;
  if (!Array.isArray(q.lessons)) return null;
  return {
    markMapping: typeof q.markMapping === "string" && q.markMapping.trim() ? q.markMapping : null,
    planNotes: strings(q.planNotes),
    flags: strings(q.flags),
    lessons: q.lessons.map(lesson).filter((l): l is ImportQaLesson => l !== null),
  };
}

/** True when the report has anything to read besides the lesson titles. */
export function qaHasFindings(qa: ImportQa): boolean {
  return (
    qa.markMapping !== null ||
    qa.planNotes.length > 0 ||
    qa.flags.length > 0 ||
    qa.lessons.some((l) => l.notes.length > 0 || l.conversions.length > 0 || l.flags.length > 0)
  );
}

export type ImportListState = { label: string; tone: "done" | "running" | "failed" };

/** The pill on a row of the imports list. */
export function importListState(status: string): ImportListState {
  if (status === "done") return { label: "Done", tone: "done" };
  if (status === "failed") return { label: "Failed", tone: "failed" };
  return { label: "In progress", tone: "running" };
}
