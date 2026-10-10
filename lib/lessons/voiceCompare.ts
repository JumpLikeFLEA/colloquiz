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
}

export type VoiceCompareConflict =
  | { slot: VoiceCompareSlot; reason: "twice_in_lesson"; blockIds: string[] }
  | { slot: VoiceCompareSlot; reason: "held_by_other_lesson"; blockId: string; otherLessonId: string; otherTitle: string };

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

  return conflicts;
}

/** The editor-facing sentence for one conflict (authoring chrome is
 * English, 0018 Decision 5). */
export function voiceCompareConflictMessage(conflict: VoiceCompareConflict): string {
  if (conflict.reason === "twice_in_lesson") {
    return `This lesson has ${conflict.blockIds.length} "${conflict.slot}" voice tasks; a course can have only one.`;
  }
  return `The published lesson "${conflict.otherTitle}" already has the course's "${conflict.slot}" voice task; a course can have only one.`;
}
