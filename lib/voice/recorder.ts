// The recorder's pure rules (VOICE-005, docs/decisions/0111). No browser
// globals are read here: the component passes in what it detected, so every
// rule is testable under vitest without a MediaRecorder.

import { isVoiceMimeType, type VoiceMimeType } from "./recording";

/** Requested explicitly: Chrome's unrequested default is ~940 KB per minute,
 * 32 kbps is ~240 KB per minute, and the request was honoured on both
 * desktop browsers measured (docs/decisions/0097, "Bitrate"). */
export const VOICE_RECORDER_BITS_PER_SECOND = 32_000;

/** Tried in order with MediaRecorder.isTypeSupported. Opus in webm is what
 * Chrome produced in 0097; ogg is Firefox's other claim; mp4 is what Safari
 * is assumed to record (unmeasured, 0110 Decision 1). */
export const VOICE_RECORDER_CANDIDATES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"] as const;

/** The first candidate the browser claims, or null to let the browser pick
 * its own default (the container is then read from the bytes). */
export function pickRecorderMimeType(isTypeSupported: ((type: string) => boolean) | undefined): string | null {
  if (!isTypeSupported) return null;
  for (const type of VOICE_RECORDER_CANDIDATES) {
    try {
      if (isTypeSupported(type)) return type;
    } catch {
      // A browser that throws on an unknown type just doesn't support it.
    }
  }
  return null;
}

/** "audio/webm;codecs=opus" -> "audio/webm"; anything outside the bucket's
 * list -> null. */
export function bareVoiceMime(type: string | null | undefined): VoiceMimeType | null {
  if (!type) return null;
  const bare = type.split(";")[0].trim().toLowerCase();
  return isVoiceMimeType(bare) ? bare : null;
}

/** The container, read from the first bytes of the take. Firefox reports an
 * empty MIME on both the recorder and the blob (0097), so the bytes are the
 * only thing that can't be wrong.
 *   webm: EBML magic 1A 45 DF A3
 *   ogg:  "OggS"
 *   mp4:  "ftyp" at offset 4 */
export function sniffVoiceMime(head: Uint8Array): VoiceMimeType | null {
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "audio/webm";
  if (head.length >= 4 && head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53) return "audio/ogg";
  if (head.length >= 8 && head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) return "audio/mp4";
  return null;
}

/** The content type a take is uploaded with: the bytes first, then what the
 * blob or the recorder said, then what was requested. Null means the take is
 * in no container the bucket accepts; it can be listened to, not sent. */
export function resolveUploadMime(
  head: Uint8Array,
  reported: string | null | undefined,
  requested: string | null | undefined,
): VoiceMimeType | null {
  return sniffVoiceMime(head) ?? bareVoiceMime(reported) ?? bareVoiceMime(requested);
}

export type RecorderSupport = "supported" | "unsupported";

/** Feature detection, never a user-agent sniff (0097, "In-app-browser
 * fallback"): getUserMedia AND MediaRecorder must both exist. */
export function recorderSupport(env: { hasGetUserMedia: boolean; hasMediaRecorder: boolean }): RecorderSupport {
  return env.hasGetUserMedia && env.hasMediaRecorder ? "supported" : "unsupported";
}

/** 0:07, 2:30, 10:00 — the recording clock. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Upload progress as a whole percent, 0-100. */
export function uploadPercent(loaded: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.min(100, Math.max(0, Math.round((loaded / total) * 100)));
}

/** What the submit route's refusal means for the recorder.
 *   practice: this learner can't send here (no enrolment the lesson is open
 *             through, 0110 Decision 2) — fall back to local-only practice;
 *   locked:   feedback was published meanwhile — reload to show it;
 *   sent:     the same take was already accepted (a retried send whose first
 *             answer was lost) — treat as sent;
 *   retry:    anything else, the learner may try again. */
export type SubmitOutcome = "sent" | "practice" | "locked" | "retry";

export function submitOutcome(status: number, error: string | null | undefined): SubmitOutcome {
  if (status >= 200 && status < 300) return "sent";
  switch (error) {
    case "duplicate_submission":
      return "sent";
    case "not_enrolled":
    case "lesson_not_open":
    case "not_a_voice_block":
    case "unauthenticated":
      return "practice";
    case "locked":
      return "locked";
    default:
      return "retry";
  }
}
