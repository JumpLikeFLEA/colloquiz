import { z } from "zod";
import { LessonFileSchema, type LessonFile } from "../lessons/courseFile";
import { parseLessonDocument } from "../lessons";
import { matchingPresentationWarning } from "../items/matching";
import { extractJson, formatZodIssues } from "./plan";

/**
 * The lesson step's answer (CNT-018): `{ "lesson": <LessonFile>, "qa": [notes] }`. A lesson is
 * held to the same two checks as scripts/import-lesson.ts: LessonFileSchema for the lesson's
 * own fields, then parseLessonDocument for every block (the editor's save path, CNT-003), plus
 * the one thing the file cannot know, that the slug is the one the plan gave it.
 */

const EnvelopeSchema = z.object({
  lesson: z.unknown(),
  qa: z.array(z.string().max(800)).max(40).default([]),
});

export type DraftedLesson = {
  lesson: LessonFile;
  qa: string[];
  /** The lesson needed its one repair turn. */
  repaired: boolean;
};

export type LessonValidation =
  | { ok: true; lesson: LessonFile; qa: string[]; warnings: string[] }
  | { ok: false; errors: string[] };

const MAX_ERRORS = 25;

export function validateLessonResponse(text: string, expected: { slug: string }): LessonValidation {
  const json = extractJson(text);
  if (!json.ok) return { ok: false, errors: [json.error] };

  // A bare lesson object (no envelope) is accepted: the content is the same.
  let raw = json.value;
  if (typeof raw === "object" && raw !== null && !("lesson" in raw) && "document" in raw) {
    raw = { lesson: raw, qa: [] };
  }
  const envelope = EnvelopeSchema.safeParse(raw);
  if (!envelope.success) return { ok: false, errors: formatZodIssues(envelope.error, MAX_ERRORS) };

  const file = LessonFileSchema.safeParse(envelope.data.lesson);
  if (!file.success) return { ok: false, errors: formatZodIssues(file.error, MAX_ERRORS).map((e) => `lesson ${e}`) };

  const errors: string[] = [];
  if (file.data.slug !== expected.slug) {
    errors.push(`lesson slug must be "${expected.slug}" (the plan's), not "${file.data.slug}"`);
  }
  const doc = parseLessonDocument(file.data.document);
  if (!doc.ok) {
    for (const e of doc.errors) errors.push(`document [${e.field}] ${e.message}`);
  } else if (doc.document.length === 0) {
    errors.push("document has no blocks");
  }
  if (errors.length > 0) {
    const shown = errors.slice(0, MAX_ERRORS);
    if (errors.length > MAX_ERRORS) shown.push(`... and ${errors.length - MAX_ERRORS} more`);
    return { ok: false, errors: shown };
  }

  return { ok: true, lesson: file.data, qa: envelope.data.qa, warnings: matchingWarnings(file.data) };
}

/** Advisory, the importer script's printMatchingPresentationWarnings (docs/decisions/0060). */
export function matchingWarnings(lesson: LessonFile): string[] {
  const out: string[] = [];
  for (const raw of lesson.document) {
    if (typeof raw !== "object" || raw === null) continue;
    const block = raw as { kind?: unknown; type?: unknown; payload?: unknown; id?: unknown };
    if (block.kind !== "practice" || block.type !== "matching") continue;
    const warning = matchingPresentationWarning(block.payload);
    if (warning) out.push(`${String(block.id)}: ${warning}`);
  }
  return out;
}

/** Stored lessons read back from course_imports.lessons. Null when any entry is invalid, which stops the commit. */
export function readStoredLessons(value: unknown): DraftedLesson[] | null {
  if (!Array.isArray(value)) return null;
  const out: DraftedLesson[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) return null;
    const e = entry as { lesson?: unknown; qa?: unknown; repaired?: unknown };
    const file = LessonFileSchema.safeParse(e.lesson);
    if (!file.success) return null;
    const qa = Array.isArray(e.qa) ? e.qa.filter((n): n is string => typeof n === "string") : [];
    out.push({ lesson: file.data, qa, repaired: e.repaired === true });
  }
  return out;
}
