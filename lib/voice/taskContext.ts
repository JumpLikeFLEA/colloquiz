import type { ReactNode } from "react";
import { FeedbackContentSchema, type FeedbackContent } from "../feedback/content";

/**
 * What a lesson page tells its voice blocks (VOICE-005, docs/decisions/0111).
 * Plain JSON, built server-side under the learner's own session and passed
 * through the RSC boundary.
 *
 * - `practice`: record and listen on this device only, nothing uploaded
 *   (privacy-policy.md: "Practice recordings in free or anonymous lessons
 *   stay on your device and are never uploaded"). Every visitor who is not
 *   an enrolled learner of the course.
 * - `send`: the learner has a live enrolment in this course, so the
 *   recorder offers Send. This is a HINT for which controls to draw, never
 *   the decision: submit_voice_recording (060) decides, and a refusal
 *   drops the recorder back to practice (lib/voice/recorder.ts,
 *   submitOutcome). Being wrong here costs a refused send, never access.
 */
export type VoiceTaskSubmission = {
  id: string;
  /** A signed URL under the learner's session (15 min, 0110 Decision 5);
   * null when the object was purged or could not be signed. */
  playbackUrl: string | null;
  /** Purged at 6 months (060: object_name NULL, purged_at set). */
  removed: boolean;
  /** Published feedback only; RLS never returns a draft to the learner. */
  feedback: FeedbackContent | null;
};

type VoiceTasksMode =
  | { mode: "practice" }
  | {
      mode: "send";
      lessonId: string;
      courseId: string;
      userId: string;
      /** The current take per voice block id, when there is one. */
      submissions: Record<string, VoiceTaskSubmission>;
    };

export type VoiceTasksContext = VoiceTasksMode & {
  /**
   * TCH-006 (docs/decisions/0153): the "Ask the teacher" link for a voice
   * task's card. Never part of what the server sends (a function does not
   * cross the RSC boundary): the linked student's lesson client adds it, so a
   * lesson page for anyone else carries no trace of it. The voice block chunk
   * calls it with the block's id and draws what it returns inside its card.
   */
  renderAsk?: (blockId: string) => ReactNode;
};

export type EnrolmentRow = { id: string; enrolledAt: string; runStartsAt: string };

/**
 * The enrolment a send files under: the latest-starting run, then the latest
 * enrolment, the same order submit_voice_recording uses (060 §3, "Latest
 * run first"). The RPC additionally requires the lesson to be open through
 * that run; this mirror does not, which is why `send` is only a hint.
 */
export function currentEnrolmentId(rows: readonly EnrolmentRow[]): string | null {
  let best: EnrolmentRow | null = null;
  for (const r of rows) {
    if (
      !best ||
      r.runStartsAt > best.runStartsAt ||
      (r.runStartsAt === best.runStartsAt && r.enrolledAt > best.enrolledAt)
    ) {
      best = r;
    }
  }
  return best?.id ?? null;
}

export type SubmissionRow = {
  id: string;
  enrolmentId: string;
  blockId: string;
  objectName: string | null;
  /** Published feedback body, unparsed, or null. */
  feedbackBody: unknown;
};

/**
 * The current enrolment's takes, by block. A take from an earlier run is
 * NOT shown: the next send files under the current run's slot, so showing
 * the old take (perhaps locked by its feedback) would block a send the RPC
 * accepts. A feedback body that doesn't parse is shown as no feedback and
 * reported, never rendered raw.
 */
export function submissionsForEnrolment(
  rows: readonly SubmissionRow[],
  enrolmentId: string,
  onInvalidFeedback: (submissionId: string) => void = () => {},
): Map<string, Omit<VoiceTaskSubmission, "playbackUrl"> & { objectName: string | null }> {
  const out = new Map<string, Omit<VoiceTaskSubmission, "playbackUrl"> & { objectName: string | null }>();
  for (const r of rows) {
    if (r.enrolmentId !== enrolmentId) continue;
    let feedback: FeedbackContent | null = null;
    if (r.feedbackBody != null) {
      const parsed = FeedbackContentSchema.safeParse(r.feedbackBody);
      if (parsed.success) feedback = parsed.data;
      else onInvalidFeedback(r.id);
    }
    out.set(r.blockId, { id: r.id, objectName: r.objectName, removed: r.objectName === null, feedback });
  }
  return out;
}
