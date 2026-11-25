import type { NotebookEntry, NotebookSummary, SummaryKind } from "./types";

/**
 * `my_notebook()`'s JSON (112) into rows. Null when the answer is not the two lists: the caller
 * treats that as a failed read, never as an empty notebook. A single row that is not its kind's
 * shape is dropped and reported; 112's CHECK makes that mean stored data and code disagree.
 */

type Raw = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const obj = (v: unknown): Raw | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Raw) : null);
/** A timestamp that parses: an unreadable one would make the sorts' order undefined. */
const time = (v: unknown): string | null => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);

function toEntry(raw: unknown): NotebookEntry | null {
  const r = obj(raw);
  const id = str(r?.id);
  const createdAt = time(r?.created_at);
  if (!r || !id || !createdAt) return null;
  const base = {
    id,
    createdAt,
    courseId: str(r.course_id),
    lessonId: str(r.lesson_id),
    courseTitle: str(r.course_title),
    lessonTitle: str(r.lesson_title),
  };
  const phrase = str(r.phrase);
  const quote = str(r.quote);
  const submissionId = str(r.submission_id);
  if (r.kind === "own") return phrase === null ? null : { ...base, kind: "own", phrase, note: str(r.note) };
  if (submissionId === null || quote === null) return null;
  if (r.kind === "said") {
    const key = str(r.phrase_key);
    if (phrase === null || key === null || typeof r.exact !== "boolean") return null;
    return { ...base, kind: "said", submissionId, phrase, phraseKey: key, quote, exact: r.exact };
  }
  const correction = str(r.correction);
  return r.kind === "fix" && correction !== null ? { ...base, kind: "fix", submissionId, quote, correction } : null;
}

const SUMMARY_KINDS: readonly SummaryKind[] = ["first", "final", "interim"];

function toSummary(raw: unknown): NotebookSummary | null {
  const r = obj(raw);
  const submissionId = str(r?.submission_id);
  const takenAt = time(r?.taken_at);
  const summary = str(r?.summary);
  const kind = SUMMARY_KINDS.find((k) => k === r?.kind);
  if (!r || !submissionId || !takenAt || summary === null || !kind) return null;
  return {
    submissionId,
    courseId: str(r.course_id),
    lessonId: str(r.lesson_id),
    courseTitle: str(r.course_title),
    lessonTitle: str(r.lesson_title),
    kind,
    summary,
    nextStep: str(r.next_step),
    goal: str(r.goal),
    takenAt,
  };
}

export function parseNotebook(
  raw: unknown,
  onInvalid: (row: unknown) => void = () => {},
): { entries: NotebookEntry[]; summaries: NotebookSummary[] } | null {
  const r = obj(raw);
  if (!r || !Array.isArray(r.entries) || !Array.isArray(r.summaries)) return null;
  const keep = <T>(rows: unknown[], read: (row: unknown) => T | null): T[] =>
    rows.flatMap((row) => {
      const parsed = read(row);
      if (parsed === null) onInvalid(row);
      return parsed === null ? [] : [parsed];
    });
  return { entries: keep(r.entries, toEntry), summaries: keep(r.summaries, toSummary) };
}
