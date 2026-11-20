import type { LessonDocument } from "./parseLessonDocument";
import { VOICE_COMPARE_SLOTS, type VoiceCompareSlot } from "./taskBlocks";

/**
 * VOICE-003: a course has at most one "before" and one "after" voice task —
 * the two recordings the before/after screen (COH-005) puts side by side.
 * Checked at publish (app/api/admin/courses/[id]/lessons/[lessonId]/
 * publish/route.ts) against the course's OTHER lessons' PUBLISHED versions,
 * not their drafts: a draft nobody published cannot collide with anything a
 * learner sees, and blocking on one would let an abandoned draft lock the
 * slot. Decided in docs/decisions/0100.
 *
 * The other lessons' documents are read RAW, the way lib/lessonImages.ts
 * reads them: a published version written under an older schema must not
 * make this check throw, and only `kind`/`type`/`compare` matter here.
 */

export interface OtherPublishedLesson {
  lessonId: string;
  /** For the message: which lesson already holds the slot. */
  title: string;
  document: unknown;
  /** Display order (lessons.ordinal). Used only for the interim-before-before
   * check; when either side lacks one, that cross-lesson check is skipped. */
  ordinal?: number;
}

export type VoiceCompareConflict =
  | { slot: VoiceCompareSlot; reason: "twice_in_lesson"; blockIds: string[] }
  | { slot: VoiceCompareSlot; reason: "held_by_other_lesson"; blockId: string; otherLessonId: string; otherTitle: string }
  /** VOICE-017 (0229 Decision 15): the interim recording must come after the
   * course's before task. `otherHolds` says which task sits in another lesson;
   * null means both are in the publishing lesson. */
  | {
      slot: "interim";
      reason: "interim_before_before";
      blockId: string;
      otherHolds: "before" | "interim" | null;
      otherLessonId: string | null;
      otherTitle: string | null;
    };

function compareSlotOf(raw: unknown): VoiceCompareSlot | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const b = raw as Record<string, unknown>;
  if (b.kind !== "task" || b.type !== "voice") return undefined;
  return (VOICE_COMPARE_SLOTS as readonly unknown[]).includes(b.compare) ? (b.compare as VoiceCompareSlot) : undefined;
}

/** Every conflict the publishing lesson's document would create, in slot
 * order. Empty means it may publish. `others` may include the publishing
 * lesson itself (its own currently-published version); it is skipped, since
 * republishing a lesson replaces that version rather than adding to it. */
export function voiceCompareConflicts(
  lessonId: string,
  document: LessonDocument,
  others: readonly OtherPublishedLesson[],
  ownOrdinal?: number,
): VoiceCompareConflict[] {
  const conflicts: VoiceCompareConflict[] = [];

  for (const slot of VOICE_COMPARE_SLOTS) {
    const ownBlockIds = document
      .filter((block) => block.kind === "task" && block.type === "voice" && block.compare === slot)
      .map((block) => block.id);
    if (ownBlockIds.length === 0) continue;

    if (ownBlockIds.length > 1) {
      conflicts.push({ slot, reason: "twice_in_lesson", blockIds: ownBlockIds });
    }

    for (const other of others) {
      if (other.lessonId === lessonId || !Array.isArray(other.document)) continue;
      if (other.document.some((raw) => compareSlotOf(raw) === slot)) {
        conflicts.push({
          slot,
          reason: "held_by_other_lesson",
          blockId: ownBlockIds[0],
          otherLessonId: other.lessonId,
          otherTitle: other.title,
        });
      }
    }
  }

  conflicts.push(...interimOrderConflicts(lessonId, document, others, ownOrdinal));
  return conflicts;
}

/** An interim task must come after the course's before task: later in the same
 * lesson, or in a lesson with a higher ordinal. A course with no before task is
 * fine (the interim take then runs without a baseline). Equal ordinals are not
 * ordered, so they never conflict. Both directions are checked, so publishing a
 * "before" below an existing "interim" is refused too. */
function interimOrderConflicts(
  lessonId: string,
  document: LessonDocument,
  others: readonly OtherPublishedLesson[],
  ownOrdinal: number | undefined,
): VoiceCompareConflict[] {
  const out: VoiceCompareConflict[] = [];
  const voiceBlocks = document.filter((b) => b.kind === "task" && b.type === "voice");
  const ownInterim = voiceBlocks.find((b) => b.compare === "interim");
  const ownBefore = voiceBlocks.find((b) => b.compare === "before");

  if (ownInterim && ownBefore && voiceBlocks.indexOf(ownInterim) < voiceBlocks.indexOf(ownBefore)) {
    out.push({
      slot: "interim",
      reason: "interim_before_before",
      blockId: ownInterim.id,
      otherHolds: null,
      otherLessonId: null,
      otherTitle: null,
    });
  }

  if (ownOrdinal === undefined) return out;
  for (const other of others) {
    if (other.lessonId === lessonId || !Array.isArray(other.document) || other.ordinal === undefined) continue;
    if (ownInterim && other.ordinal > ownOrdinal && other.document.some((raw) => compareSlotOf(raw) === "before")) {
      out.push({
        slot: "interim",
        reason: "interim_before_before",
        blockId: ownInterim.id,
        otherHolds: "before",
        otherLessonId: other.lessonId,
        otherTitle: other.title,
      });
    }
    if (ownBefore && other.ordinal < ownOrdinal && other.document.some((raw) => compareSlotOf(raw) === "interim")) {
      out.push({
        slot: "interim",
        reason: "interim_before_before",
        blockId: ownBefore.id,
        otherHolds: "interim",
        otherLessonId: other.lessonId,
        otherTitle: other.title,
      });
    }
  }
  return out;
}

/** The editor-facing sentence for one conflict (authoring chrome is
 * English, 0018 Decision 5). */
export function voiceCompareConflictMessage(conflict: VoiceCompareConflict): string {
  if (conflict.reason === "twice_in_lesson") {
    return `This lesson has ${conflict.blockIds.length} "${conflict.slot}" voice tasks; a course can have only one.`;
  }
  if (conflict.reason === "interim_before_before") {
    if (conflict.otherHolds === null) {
      return `The "interim" voice task comes before the "before" voice task in this lesson; the interim recording has to come after it.`;
    }
    if (conflict.otherHolds === "before") {
      return `The "interim" voice task is in a lesson that comes before "${conflict.otherTitle}", which holds the course's "before" voice task; the interim recording has to come after it.`;
    }
    return `The published lesson "${conflict.otherTitle}" has the course's "interim" voice task and comes before this lesson; the "before" voice task has to come first.`;
  }
  return `The published lesson "${conflict.otherTitle}" already has the course's "${conflict.slot}" voice task; a course can have only one.`;
}

/** AUTH-020: the "Expressions to listen for" on the first `before` voice task
 * found in the given lesson documents, or undefined when there is none or it
 * lists nothing. Documents are read RAW, like `compareSlotOf` above: a
 * published version written under an older schema must not make this throw. */
export function beforeListenFor(documents: readonly unknown[]): string[] | undefined {
  for (const document of documents) {
    if (!Array.isArray(document)) continue;
    for (const raw of document) {
      if (compareSlotOf(raw) !== "before") continue;
      const listenFor = (raw as Record<string, unknown>).listenFor;
      if (!Array.isArray(listenFor)) continue;
      const items = listenFor.filter((x): x is string => typeof x === "string" && x.trim() !== "");
      if (items.length > 0) return items;
    }
  }
  return undefined;
}
