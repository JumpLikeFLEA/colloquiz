import type { LessonParseError } from "./lessons/parseLessonDocument";

/**
 * Turns `parseLessonDocument`'s flat `LessonParseError[]` (each `field` is
 * "<blockId>: <fieldPath>", or just "<blockId>", or "" for a document-level
 * error — see parseLessonDocument.ts) into a lookup the block editor can use
 * to render a message next to the exact field it names, per AUTH-002's
 * acceptance line. A blockId of "" holds document-level errors (e.g. "not an
 * array"), which the editor renders as a top-level banner rather than inside
 * any block's form.
 */

export type BlockFieldErrors = Map<string, string[]>; // fieldPath -> messages; "" = block-level, not a specific field
export type LessonFieldErrorMap = Map<string, BlockFieldErrors>; // blockId -> BlockFieldErrors

export function mapParseErrorsToFieldErrors(errors: LessonParseError[]): LessonFieldErrorMap {
  const map: LessonFieldErrorMap = new Map();

  for (const err of errors) {
    const sep = err.field.indexOf(": ");
    const blockId = sep === -1 ? err.field : err.field.slice(0, sep);
    const fieldPath = sep === -1 ? "" : err.field.slice(sep + 2);

    const blockErrors = map.get(blockId) ?? new Map<string, string[]>();
    const messages = blockErrors.get(fieldPath) ?? [];
    messages.push(err.message);
    blockErrors.set(fieldPath, messages);
    map.set(blockId, blockErrors);
  }

  return map;
}
