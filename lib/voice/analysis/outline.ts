import { parseLessonDocument } from "../../lessons/parseLessonDocument";
import { publishedLessonsOnly } from "../../coursePageProgress";
import type { OutlineLesson } from "./schema";

/**
 * The course outline an interim analysis is given (VOICE-017, docs/decisions/0229 Decisions 6,
 * 17, 19): the lessons AFTER the one the learner just recorded in, each with the number the
 * course page shows, its title, its description and what its voice tasks listen for. Pure:
 * server.ts reads the rows, this decides what goes to the model.
 *
 * `rows` must come in the course page's order (ordinal, then slug: lib/coursePage.ts). The
 * number is the index in the published, non-archived list, the same `position` the page and
 * the lesson band print, never the ordinal (ordinals have gaps, migration 041). Locked
 * lessons are included: their title and description are public on the course page, and their
 * voice-task expressions are a teaser of the same kind (Decision 17). Theory, exercises and
 * answers are never read here, so they cannot leave the server.
 */

export const OUTLINE_MAX_LESSONS = 40;
export const OUTLINE_TITLE_MAX = 120;
export const OUTLINE_ABOUT_MAX = 400;
export const OUTLINE_MAX_EXPRESSIONS = 30;
export const OUTLINE_EXPRESSION_MAX = 80;

export type OutlineRow = {
  id: string;
  title: string;
  description: string | null;
  published_version_id: string | null;
  archived_at: string | null;
  /** The PUBLISHED version's document, read raw; anything that does not parse gives no expressions. */
  document: unknown;
};

function cut(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? t.slice(0, max).trimEnd() : t;
}

/** Every voice task's "listen for" lines, de-duplicated in first-seen order, capped. */
function listenForOf(document: unknown): string[] {
  const parsed = parseLessonDocument(document);
  if (!parsed.ok) return [];
  const out: string[] = [];
  for (const block of parsed.document) {
    if (block.kind !== "task" || block.type !== "voice") continue;
    for (const line of block.listenFor ?? []) {
      const e = cut(line, OUTLINE_EXPRESSION_MAX);
      if (e && !out.includes(e)) out.push(e);
      if (out.length >= OUTLINE_MAX_EXPRESSIONS) return out;
    }
  }
  return out;
}

export function buildCourseOutline(rows: readonly OutlineRow[], interimLessonId: string): OutlineLesson[] {
  const listed = publishedLessonsOnly(rows);
  const at = listed.findIndex((r) => r.id === interimLessonId);
  // The interim lesson is not on the page (archived, or unpublished): its place, and so
  // "later", is unknown. No outline is better than a wrong one.
  if (at === -1) return [];
  return listed.slice(at + 1, at + 1 + OUTLINE_MAX_LESSONS).map((r, i) => ({
    number: at + 2 + i,
    lessonId: r.id,
    title: cut(r.title, OUTLINE_TITLE_MAX),
    about: r.description && r.description.trim() ? cut(r.description, OUTLINE_ABOUT_MAX) : null,
    expressions: listenForOf(r.document),
  }));
}
