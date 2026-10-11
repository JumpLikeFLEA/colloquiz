import { z } from "zod";

/**
 * FeedbackContent — the partner's written answer to a voice task, and
 * COH-005's final comment (docs/decisions/0096 Decision 1): paragraphs of
 * runs, a run optionally bold. Stored as JSONB.
 *
 * The textarea ↔ FeedbackContent converter is markup.ts and the clipboard
 * converter is paste.ts (VOICE-006). This module holds only the shape and
 * the cap, because the write RPC in migration 060
 * (save_voice_feedback) validates the same shape and the same number
 * server-side; content.test.ts fails if the two disagree.
 */

/** Total run text after conversion, so `**` markers don't count (0096
 * Decision 3). */
export const FEEDBACK_CONTENT_MAX_CHARS = 5000;

export const FeedbackRunSchema = z.strictObject({
  text: z.string().min(1),
  bold: z.boolean().optional(),
});

export const FeedbackParagraphSchema = z.strictObject({
  runs: z.array(FeedbackRunSchema).min(1),
});

export const FeedbackContentSchema = z
  .strictObject({
    paragraphs: z.array(FeedbackParagraphSchema).min(1),
  })
  .refine((c) => feedbackTextLength(c) <= FEEDBACK_CONTENT_MAX_CHARS, {
    message: `feedback is longer than ${FEEDBACK_CONTENT_MAX_CHARS} characters`,
  });

export type FeedbackRun = z.infer<typeof FeedbackRunSchema>;
export type FeedbackContent = z.infer<typeof FeedbackContentSchema>;

export function feedbackTextLength(content: { paragraphs: { runs: { text: string }[] }[] }): number {
  let n = 0;
  for (const p of content.paragraphs) for (const r of p.runs) n += r.text.length;
  return n;
}
