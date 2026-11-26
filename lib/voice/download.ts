import { VOICE_EXTENSION, VOICE_MIME_TYPES, type VoiceMimeType } from "./recording";

/**
 * PROG-019 (docs/decisions/0235 "Playback and downloads", 0243) — downloading one's own voice
 * take. The bucket's SELECT policy (060) also lets an editor of the course sign the object, and
 * RLS on `voice_submissions` lets them read the row, so "may sign" is not "may download": the
 * route asks this function, which answers by the row's owner alone.
 */

export type RecordingFormat = (typeof VOICE_EXTENSION)[VoiceMimeType];

/** The container from the stored content type, or null for one the bucket never accepted. */
export function recordingFormat(contentType: string | null | undefined): RecordingFormat | null {
  const base = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return (VOICE_MIME_TYPES as readonly string[]).includes(base) ? VOICE_EXTENSION[base as VoiceMimeType] : null;
}

/** `alina-cher-recording-YYYY-MM-DD-HHMM.<ext>`, UTC. ASCII only, so no header encoding is needed. */
export function recordingFileName(submittedAt: string, format: RecordingFormat | null): string {
  const iso = new Date(submittedAt).toISOString();
  const stamp = `${iso.slice(0, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}`;
  return `alina-cher-recording-${stamp}.${format ?? "audio"}`;
}

export type DownloadRow = {
  user_id: string;
  object_name: string | null;
  content_type: string | null;
  submitted_at: string;
};

export type DownloadDecision =
  | { kind: "not_found" }
  | { kind: "gone" }
  | { kind: "ok"; objectName: string; fileName: string };

/**
 * Someone else's take is `not_found`, the same as no take, so the answer never says that it
 * exists. The owner's purged take (060's purge keeps the row with `object_name` NULL) is `gone`.
 */
export function decideRecordingDownload(row: DownloadRow | null, callerId: string): DownloadDecision {
  if (!row || row.user_id !== callerId) return { kind: "not_found" };
  if (!row.object_name) return { kind: "gone" };
  return { kind: "ok", objectName: row.object_name, fileName: recordingFileName(row.submitted_at, recordingFormat(row.content_type)) };
}
