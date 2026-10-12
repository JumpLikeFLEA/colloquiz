import { inlinePlainText, type LessonDocument } from "../lessons";

/**
 * PLAY-014 — the lesson band already shows the lesson title, so a first block
 * that is a level-1 heading with the same text would print it twice. Narrow on
 * purpose: only the FIRST block, only level 1, only an exact (trimmed,
 * case-insensitive) match. A level-1 heading is a chapter since AUTH-017
 * (docs/decisions/0128), so any other one must still render. Render-time only;
 * the stored document is never rewritten.
 */
export function dropTitleHeading(document: LessonDocument, lessonTitle: string | undefined): LessonDocument {
  const title = lessonTitle?.trim().toLowerCase();
  const first = document[0];
  if (!title || !first || first.kind !== "theory" || first.type !== "heading" || first.level !== 1) {
    return document;
  }
  return inlinePlainText(first.text).trim().toLowerCase() === title ? document.slice(1) : document;
}
