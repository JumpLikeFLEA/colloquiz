import { inlinePlainText } from "../../lessons/plainText";
import { parseLessonDocument } from "../../lessons/parseLessonDocument";
import type { VoiceCompareSlot, VoiceTaskBlock } from "../../lessons/taskBlocks";

/**
 * Reads what the analysis needs from a lesson document (VOICE-012). The document is
 * parsed through `parseLessonDocument`, never read raw: `listenFor` is trimmed at parse,
 * not at storage (docs/decisions/0186 Decision 2).
 */

export type VoiceTaskInfo = {
  prompt: string;
  listenFor: string[];
  role: VoiceCompareSlot | undefined;
  maxSeconds: number;
};

export type VoiceTaskLookup =
  | { ok: true; task: VoiceTaskInfo }
  | { ok: false; reason: "bad_document" | "no_such_block" };

export function voiceTaskInfo(document: unknown, blockId: string): VoiceTaskLookup {
  const parsed = parseLessonDocument(document);
  if (!parsed.ok) return { ok: false, reason: "bad_document" };
  const block = parsed.document.find(
    (b): b is VoiceTaskBlock => b.kind === "task" && b.type === "voice" && b.id === blockId,
  );
  if (!block) return { ok: false, reason: "no_such_block" };
  return {
    ok: true,
    task: {
      prompt: inlinePlainText(block.prompt),
      listenFor: block.listenFor ?? [],
      role: block.compare,
      maxSeconds: block.maxSeconds,
    },
  };
}

/**
 * The course's `before` voice task, from its published lessons' documents. At most one
 * exists per course (checked at publish, lib/lessons/voiceCompare.ts); if two do, the
 * first by the order given wins. A document that does not parse is skipped here: the
 * take being analysed is the one that must parse, not its neighbours.
 */
export function findBeforeBlock(
  lessons: readonly { lessonId: string; document: unknown }[],
): { lessonId: string; blockId: string } | null {
  for (const l of lessons) {
    const parsed = parseLessonDocument(l.document);
    if (!parsed.ok) continue;
    const block = parsed.document.find((b) => b.kind === "task" && b.type === "voice" && b.compare === "before");
    if (block) return { lessonId: l.lessonId, blockId: block.id };
  }
  return null;
}
