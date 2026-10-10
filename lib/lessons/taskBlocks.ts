import { z } from "zod";
import { InlineContentSchema } from "./inline";

/**
 * Task blocks — the third block kind beside theory and practice (VOICE-003,
 * docs/decisions/0100). A task is reviewed by a person and never scored
 * (docs/handoff.md, "Item types": voice tasks are not an item type), so it
 * never passes through `parseItem`, never reaches `aggregateLessonScore`,
 * and is not counted by `countPracticeBlocks` — the lesson score, the item
 * count and "completion = every lesson attempted" are untouched by it.
 *
 * `voice` is the only task type today. The `type` discriminator is kept so a
 * second human-reviewed task does not need a new `kind`.
 *
 * Strict, like every theory block: an unrecognized field is a parse error.
 */

export const TASK_BLOCK_TYPES = ["voice"] as const;
export type TaskBlockType = (typeof TASK_BLOCK_TYPES)[number];

/** Which end of a cohort course this recording belongs to, for the
 * before/after screen (COH-005). At most one of each per course, enforced at
 * publish (lib/lessons/voiceCompare.ts). Absent on an ordinary weekly task. */
export const VOICE_COMPARE_SLOTS = ["before", "after"] as const;
export type VoiceCompareSlot = (typeof VOICE_COMPARE_SLOTS)[number];

/** Bounds on a recording's length. The lower bound stops a typo ("3" meant
 * as minutes); the upper one keeps a take inside the bucket limit VOICE-004
 * derives from it (0097: ~240 KB per minute at 32 kbps). */
export const VOICE_MIN_SECONDS = 15;
export const VOICE_MAX_SECONDS = 600;
/** The editor's default for a new block — a product call, not a measurement
 * (0097 "Max duration"; chosen in docs/decisions/0100). */
export const VOICE_DEFAULT_SECONDS = 180;

export const VoiceTaskBlockSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.literal("task"),
  type: z.literal("voice"),
  /** What the learner is asked to say. Inline content, like a theory
   * block's text, so the partner can emphasise a phrase. */
  prompt: InlineContentSchema,
  maxSeconds: z.number().int().min(VOICE_MIN_SECONDS).max(VOICE_MAX_SECONDS),
  compare: z.enum(VOICE_COMPARE_SLOTS).optional(),
});

export const TaskBlockSchema = z.discriminatedUnion("type", [VoiceTaskBlockSchema]);

export type VoiceTaskBlock = z.infer<typeof VoiceTaskBlockSchema>;
export type TaskBlock = z.infer<typeof TaskBlockSchema>;

/** "3 min", "45 s", "2 min 30 s" — a voice task's limit as the learner and
 * the plain-text export read it. English, like the rest of the lesson
 * chrome (docs/decisions/0080 Decision 5). */
export function formatVoiceDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} s`;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}
