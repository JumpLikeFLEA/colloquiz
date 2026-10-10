// Voice-recording storage rules (VOICE-004, docs/decisions/0110). Pure and
// dependency-free, so the recorder (VOICE-005), the review queue (VOICE-006),
// the routes and the tests share one definition.
//
// These MUST stay in sync with migration 060, which is where they are
// enforced: the bucket's file_size_limit and allowed_mime_types, and the
// object-name check in submit_voice_recording. recording.test.ts reads the
// migration and fails if the two disagree (the 0034 guard pattern).

import { VOICE_MAX_SECONDS } from "../lessons/taskBlocks";

/** The project's first PRIVATE bucket: no public URL, playback through
 * signed URLs only. */
export const VOICE_BUCKET = "voice-recordings";

/** 10 MiB. Derived, not measured on a phone: the longest take a block allows
 * (VOICE_MAX_SECONDS = 600 s) at the 128 kbps Chrome records when no bitrate
 * is requested (0097: 125.3 and 126.2 kbps measured) is 600 × 128000 / 8 =
 * 9.6 MB. So even a browser that ignores the requested 32 kbps fits. */
export const VOICE_MAX_BYTES = 10 * 1024 * 1024;

/** The bare container types the bucket accepts. The uploader sets one of
 * these itself: Firefox reports an empty MIME for its own recording (0097),
 * so `Blob.type` cannot be trusted. `audio/mp4` was claimed by Chrome's
 * isTypeSupported but never produced in 0097; it is listed because it is
 * what Safari records (an assumption until VOICE-007 measures it). */
export const VOICE_MIME_TYPES = ["audio/webm", "audio/ogg", "audio/mp4"] as const;
export type VoiceMimeType = (typeof VOICE_MIME_TYPES)[number];

export const VOICE_EXTENSION: Record<VoiceMimeType, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
};

/** How long a signed playback URL lives. Longer than the longest take
 * (VOICE_MAX_SECONDS), so playback started on a fresh URL can finish;
 * short enough that a copied link stops working within the quarter hour.
 * A player that sits idle past it signs a new one. */
export const VOICE_SIGNED_URL_TTL_SECONDS = 15 * 60;

/** An upload that no submission references after this long is an orphan
 * (a take that was uploaded but never sent, or whose submit was refused)
 * and is removed by the daily purge. */
export const VOICE_ORPHAN_GRACE_HOURS = 24;

/** Recordings are deleted this many months after their run ends
 * (privacy-policy.md, "How long we keep it"). */
export const VOICE_RETENTION_MONTHS = 6;

/** The unrequested Chrome bitrate VOICE_MAX_BYTES is sized against (0097). */
export const VOICE_WORST_CASE_BITS_PER_SECOND = 128_000;

/** Bytes of the longest take at the worst-case bitrate; must fit the bucket. */
export const VOICE_WORST_CASE_BYTES = (VOICE_MAX_SECONDS * VOICE_WORST_CASE_BITS_PER_SECOND) / 8;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const EXTENSIONS = Object.values(VOICE_EXTENSION).join("|");
/** {course}/{user}/{submission}.{ext}, all ids lower-case UUIDs. */
export const VOICE_OBJECT_NAME_PATTERN = new RegExp(`^(${UUID})/(${UUID})/(${UUID})\\.(${EXTENSIONS})$`);

export function isVoiceMimeType(value: string): value is VoiceMimeType {
  return (VOICE_MIME_TYPES as readonly string[]).includes(value);
}

/** The object name a take is uploaded under. The submission id is chosen by
 * the uploader (a fresh UUID per take) and becomes the submission row's id. */
export function voiceObjectName(
  courseId: string,
  userId: string,
  submissionId: string,
  mime: VoiceMimeType,
): string {
  const name = `${courseId}/${userId}/${submissionId}.${VOICE_EXTENSION[mime]}`.toLowerCase();
  if (!VOICE_OBJECT_NAME_PATTERN.test(name)) {
    throw new Error(`invalid voice object name: ${name}`);
  }
  return name;
}

export type ParsedVoiceObjectName = {
  courseId: string;
  userId: string;
  submissionId: string;
  extension: string;
};

export function parseVoiceObjectName(name: string): ParsedVoiceObjectName | null {
  const m = VOICE_OBJECT_NAME_PATTERN.exec(name);
  if (!m) return null;
  return { courseId: m[1], userId: m[2], submissionId: m[3], extension: m[4] };
}
