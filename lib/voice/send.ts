import type { VoiceCap } from "./analysisCaps";
import { submitOutcome, type SubmitOutcome } from "./recorder";
import { VOICE_BUCKET } from "./recording";

/**
 * Sending a voice take (VOICE-005, docs/decisions/0111). Two requests:
 *
 * 1. The take goes STRAIGHT to Supabase Storage under the learner's own
 *    session, not through a Next route: a take may be up to 10 MiB (0110
 *    Decision 1) and a Vercel function body is capped well below that. The
 *    bucket's INSERT policy (060) checks the {user} segment. XMLHttpRequest
 *    rather than fetch, because only XHR reports upload progress.
 * 2. POST /api/voice/submissions, where submit_voice_recording decides
 *    whether the take counts (060 §3).
 *
 * The submission id is chosen once per take and kept across retries, so a
 * retry after a lost answer finds its own upload ("exists") or its own
 * submission ("duplicate_submission" -> sent) instead of making a second.
 */

export type UploadResult = "uploaded" | "exists";

export type UploadArgs = {
  supabaseUrl: string;
  anonKey: string;
  accessToken: string;
  objectName: string;
  body: Blob;
  contentType: string;
  onProgress: (loaded: number, total: number) => void;
};

/** True for Storage's "already exists" answer, which has come back both as
 * HTTP 409 and as HTTP 400 with statusCode "409" / error "Duplicate"
 * depending on the Storage version. */
export function isDuplicateUpload(status: number, responseText: string): boolean {
  if (status === 409) return true;
  if (status !== 400) return false;
  try {
    const body = JSON.parse(responseText) as { statusCode?: unknown; error?: unknown };
    return String(body.statusCode) === "409" || body.error === "Duplicate";
  } catch {
    return false;
  }
}

export function storageObjectUrl(supabaseUrl: string, objectName: string): string {
  const path = objectName.split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/${VOICE_BUCKET}/${path}`;
}

export function uploadVoiceTake(args: UploadArgs): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", storageObjectUrl(args.supabaseUrl, args.objectName));
    xhr.setRequestHeader("Authorization", `Bearer ${args.accessToken}`);
    xhr.setRequestHeader("apikey", args.anonKey);
    xhr.setRequestHeader("Content-Type", args.contentType);
    // Never overwrite: a take is a new object (060 has no UPDATE policy).
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) args.onProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve("uploaded");
      else if (isDuplicateUpload(xhr.status, xhr.responseText)) resolve("exists");
      else reject(new Error(`voice upload failed: ${xhr.status} ${xhr.responseText.slice(0, 200)}`));
    };
    xhr.onerror = () => reject(new Error("voice upload failed: network error"));
    xhr.onabort = () => reject(new Error("voice upload aborted"));
    xhr.send(args.body);
  });
}

export type SendDeps = {
  getAccessToken: () => Promise<string | null>;
  upload: (args: UploadArgs) => Promise<UploadResult>;
  submit: (body: {
    submissionId: string;
    lessonId: string;
    blockId: string;
    objectName: string;
  }) => Promise<SubmitResponse>;
};

/** The submit route's answer as the recorder reads it; `cap` is set for a refusal by a cap. */
export type SubmitResponse = { status: number; error: string | null; cap?: VoiceCap | null };

export type SendOutcome = SubmitOutcome | "upload_failed";

export async function sendVoiceTake(
  input: {
    supabaseUrl: string;
    anonKey: string;
    take: Blob;
    contentType: string;
    submissionId: string;
    objectName: string;
    lessonId: string;
    blockId: string;
    onProgress: (loaded: number, total: number) => void;
  },
  deps: SendDeps,
): Promise<SendOutcome> {
  const accessToken = await deps.getAccessToken();
  // Signed out in another tab since the page loaded: nothing can be sent.
  if (!accessToken) return "practice";

  try {
    await deps.upload({
      supabaseUrl: input.supabaseUrl,
      anonKey: input.anonKey,
      accessToken,
      objectName: input.objectName,
      body: input.take,
      contentType: input.contentType,
      onProgress: input.onProgress,
    });
  } catch {
    return "upload_failed";
  }

  try {
    const { status, error } = await deps.submit({
      submissionId: input.submissionId,
      lessonId: input.lessonId,
      blockId: input.blockId,
      objectName: input.objectName,
    });
    return submitOutcome(status, error);
  } catch {
    return "retry";
  }
}

/** The submit request itself, for the recorder. */
export async function postVoiceSubmission(body: {
  submissionId: string;
  lessonId: string;
  blockId: string;
  objectName: string;
}): Promise<SubmitResponse> {
  const res = await fetch("/api/voice/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let error: string | null = null;
  let cap: VoiceCap | null = null;
  try {
    const json = (await res.json()) as { error?: unknown; kind?: unknown; retryAt?: unknown };
    error = typeof json.error === "string" ? json.error : null;
    if (error === "voice_cap" && (json.kind === "task_cap" || json.kind === "daily_cap")) {
      cap = { kind: json.kind, retryAt: typeof json.retryAt === "string" ? json.retryAt : null };
    }
  } catch {
    // A non-JSON answer is a server failure; status carries it.
  }
  return { status: res.status, error, cap };
}
