import { FeedbackContentSchema, type FeedbackContent } from "../feedback/content";
import type { InlineContent } from "../lessons/inline";
import { VOICE_COMPARE_SLOTS, VoiceTaskBlockSchema, type VoiceCompareSlot } from "../lessons/taskBlocks";

/**
 * COH-005 (docs/decisions/0115) — the before/after screen's view of one run
 * enrolment. Pure: the server loader (lib/finalScreen.ts) does the reads under
 * the learner's own session, this decides what each slot shows.
 *
 * Where a slot lives comes from the PUBLISHED documents the learner can read
 * (0100 Decision 3 / 0110 "Not in this card": the slot is read from the
 * document, not keyed in SQL). A lesson the learner can't open yet (a later
 * cohort week) has no readable document, so its slot is `unknown` rather
 * than guessed.
 */

export type ReadableLesson = {
  lessonId: string;
  slug: string;
  title: string;
  /** Position in the course; the tie-break when two lessons claim a slot. */
  ordinal: number;
  /** An archived lesson still locates its slot (0100 Decision 3 counts
   * archived lessons too) but is not linked: its page is gone. */
  archived: boolean;
  document: readonly unknown[];
};

export type EnrolmentTake = {
  id: string;
  lessonId: string;
  blockId: string;
  /** NULL once the 6-month purge removed the object (060). */
  objectName: string | null;
  submittedAt: string;
};

export type SlotLocation = {
  lessonId: string;
  blockId: string;
  slug: string;
  title: string;
  /** False for an archived lesson: show the title, don't link it. */
  linkable: boolean;
  prompt: InlineContent;
};

export type SlotView =
  /** A take exists and its audio is still stored. */
  | { kind: "recorded"; location: SlotLocation; takeId: string; objectName: string; submittedAt: string }
  /** A take existed and the purge removed it. Never shown as "missing". */
  | { kind: "removed"; location: SlotLocation; submittedAt: string }
  /** The slot's lesson is readable and nothing was sent for it. */
  | { kind: "missing"; location: SlotLocation }
  /** No readable lesson holds this slot (not open yet, or none authored). */
  | { kind: "unknown" };

export type FinalCommentView = { kind: "published"; body: FeedbackContent } | { kind: "pending" };

export type BeforeAfterView = { before: SlotView; after: SlotView; comment: FinalCommentView };

/**
 * The slot's block in the readable documents. Publish refuses a second block
 * per slot (lib/lessons/voiceCompare.ts), but that check lives in a route,
 * not SQL (0100 Decision 3), so a direct RPC call could leave two; the
 * earliest lesson by ordinal, then the earliest block, wins.
 */
export function locateSlots(lessons: readonly ReadableLesson[]): Record<VoiceCompareSlot, SlotLocation | null> {
  const out: Record<VoiceCompareSlot, SlotLocation | null> = { before: null, after: null };
  const ordered = [...lessons].sort((a, b) => a.ordinal - b.ordinal);
  for (const lesson of ordered) {
    for (const raw of lesson.document) {
      const parsed = VoiceTaskBlockSchema.safeParse(raw);
      if (!parsed.success || !parsed.data.compare) continue;
      const slot = parsed.data.compare;
      if (out[slot]) continue;
      out[slot] = {
        lessonId: lesson.lessonId,
        blockId: parsed.data.id,
        slug: lesson.slug,
        title: lesson.title,
        linkable: !lesson.archived,
        prompt: parsed.data.prompt,
      };
    }
  }
  return out;
}

function slotView(location: SlotLocation | null, takes: readonly EnrolmentTake[]): SlotView {
  if (!location) return { kind: "unknown" };
  const take = takes.find((t) => t.lessonId === location.lessonId && t.blockId === location.blockId);
  if (!take) return { kind: "missing", location };
  if (take.objectName === null) return { kind: "removed", location, submittedAt: take.submittedAt };
  return { kind: "recorded", location, takeId: take.id, objectName: take.objectName, submittedAt: take.submittedAt };
}

/**
 * `takes` must already be scoped to the one enrolment the screen is for: a
 * take from another run of the same course answers that run, not this one.
 * `commentBody` is the final comment's body when its row came back
 * PUBLISHED, else null; a body that doesn't parse is reported and shown as
 * pending, never rendered raw (the taskContext.ts precedent).
 */
export function beforeAfterView(
  lessons: readonly ReadableLesson[],
  takes: readonly EnrolmentTake[],
  commentBody: unknown,
  onInvalidComment: () => void = () => {},
): BeforeAfterView {
  const slots = locateSlots(lessons);
  let comment: FinalCommentView = { kind: "pending" };
  if (commentBody != null) {
    const parsed = FeedbackContentSchema.safeParse(commentBody);
    if (parsed.success) comment = { kind: "published", body: parsed.data };
    else onInvalidComment();
  }
  const [before, after] = VOICE_COMPARE_SLOTS.map((slot) => slotView(slots[slot], takes));
  return { before, after, comment };
}
