import { inlinePlainText } from "../../lessons/plainText";
import { parseLessonDocument } from "../../lessons/parseLessonDocument";
import type { VoiceCompareSlot, VoiceTaskBlock } from "../../lessons/taskBlocks";
import type { FirstAnalysisContext } from "./schema";

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

/**
 * The goal and main error of a stored first analysis (voice_analyses.result), for the
 * final comparison that follows it. The row is read back from JSONB, so nothing about
 * its shape is assumed: a missing or mistyped piece is "not there", and an analysis with
 * neither a goal nor a main error gives null (the final then runs without a goal to judge).
 */
export function firstAnalysisContext(result: unknown): FirstAnalysisContext | null {
  if (typeof result !== "object" || result === null) return null;
  const r = result as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null);

  const goal = text(r.goal);
  let mainError: FirstAnalysisContext["mainError"] = null;
  if (typeof r.mainError === "number" && Array.isArray(r.errors)) {
    const e = r.errors[r.mainError];
    if (typeof e === "object" && e !== null) {
      const { quote, correction, explanation } = e as Record<string, unknown>;
      if (text(quote) && text(correction) && text(explanation)) {
        mainError = { quote: text(quote)!, correction: text(correction)!, explanation: text(explanation)! };
      }
    }
  }
  return goal || mainError ? { goal, mainError } : null;
}
