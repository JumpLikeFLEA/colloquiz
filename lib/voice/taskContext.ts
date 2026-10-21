import type { ReactNode } from "react";
import { FeedbackContentSchema, type FeedbackContent } from "../feedback/content";

/**
 * What a lesson page tells its voice blocks (VOICE-005, docs/decisions/0111).
 * Plain JSON, built server-side under the learner's own session and passed
 * through the RSC boundary.
 *
 * - `practice`: record and listen on this device only, nothing uploaded
 *   (privacy-policy.md: "Practice recordings in free or anonymous lessons
 *   stay on your device and are never uploaded"). Every anonymous visitor,
 *   and, while VOICE_ANALYSIS_MODE is `off`, every signed-in learner who is
 *   not enrolled in the course (`voiceSendSlot`).
 * - `send`: the recorder offers Send: the learner has a live enrolment in
 *   this course, or (VOICE-010, docs/decisions/0183) is signed in on an
 *   open lesson and the analysis mode is not `off`. This is a HINT for which
 *   controls to draw, never the decision: submit_voice_recording (094)
 *   decides, and a refusal drops the recorder back to practice
 *   (lib/voice/recorder.ts, submitOutcome). Being wrong here costs a refused
 *   send, never access.
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

/**
 * 0156 Decision 6's global switch, read from VOICE_ANALYSIS_MODE. Anything but
 * `on` or `paused` is `off`, so a missing or misspelt value fails closed:
 * production stays off until OPS-026's legal revision is published.
 */
export type VoiceAnalysisMode = "off" | "paused" | "on";

export function parseVoiceAnalysisMode(raw: string | null | undefined): VoiceAnalysisMode {
  const v = raw?.trim().toLowerCase();
  return v === "on" || v === "paused" ? v : "off";
}

/**
 * Which slot the recorder should offer Send for, or null for practice only.
 * A mirror of 094's submit_voice_recording, as a hint (see the type above):
 *   - anonymous: practice (0156 Decision 2);
 *   - enrolled in the course: the enrolment's slot, whatever the mode (this is
 *     today's cohort behaviour, and the mode only governs the new path);
 *   - otherwise a signed-in learner on an open lesson: a self-paced slot, unless
 *     the mode is `off`. Under `paused` takes still upload (0156 Decision 6).
 */
export function voiceSendSlot(input: {
  signedIn: boolean;
  lessonOpen: boolean;
  enrolmentId: string | null;
  analysisMode: VoiceAnalysisMode;
}): "enrolment" | "self_paced" | null {
  if (!input.signedIn) return null;
  if (input.enrolmentId) return "enrolment";
  if (input.lessonOpen && input.analysisMode !== "off") return "self_paced";
  return null;
}

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
  /** null = a self-paced take, made outside any enrolment (094). */
  enrolmentId: string | null;
  blockId: string;
  objectName: string | null;
  /** Published feedback body, unparsed, or null. */
  feedbackBody: unknown;
};

/**
 * The current slot's takes, by block: an enrolment's, or, for `null`, the
 * learner's self-paced ones (rows are already the caller's own). A take from
 * an earlier run is NOT shown: the next send files under the current run's slot, so showing
 * the old take (perhaps locked by its feedback) would block a send the RPC
 * accepts. A feedback body that doesn't parse is shown as no feedback and
 * reported, never rendered raw.
 */
export function submissionsForEnrolment(
  rows: readonly SubmissionRow[],
  enrolmentId: string | null,
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
