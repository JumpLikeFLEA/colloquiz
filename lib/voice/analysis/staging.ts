/**
 * Pure helpers for handing a take to AssemblyAI (VOICE-012, docs/decisions/0187).
 *
 * A take's own signed URL cannot be given to the provider: the object is stored under
 * {course}/{user}/{take}, and both the path and the token inside the URL name the learner.
 * 0182 Decision 2 also rules out /v2/upload (the upload CDN is S3 us-west-2). So the
 * pipeline copies the audio to a name made of two random UUIDs, signs THAT, and removes
 * the copy once the transcript is stored. The provider is never told whose it is.
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const EXTENSION = /\.(webm|ogg|m4a)$/;

/** `<uuid>/<uuid>.<ext>` with the extension of the take. Random parts are passed in, so a test can see them. */
export function stagedObjectName(takeObjectName: string, randomA: string, randomB: string): string {
  const ext = takeObjectName.match(EXTENSION)?.[0] ?? ".webm";
  return `${randomA}/${randomB}${ext}`;
}

export function namesNoUser(stagedName: string, userId: string, courseId: string): boolean {
  return !stagedName.includes(userId) && !stagedName.includes(courseId) && new RegExp(`^${UUID}/${UUID}\.(webm|ogg|m4a)$`).test(stagedName);
}

/**
 * A URL AssemblyAI cannot reach: the local Supabase stack. Only there does the pipeline send
 * the audio bytes with /v2/upload instead, which is the one way to run it against real keys
 * on a development machine. A hosted project never has a loopback host, so this is false for
 * every URL production signs.
 */
export function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1" || host.endsWith(".localhost");
  } catch {
    return false;
  }
}

/** How long after a row last moved the status route offers it for re-claiming (the claim itself decides). */
export const RECLAIM_AFTER_MS = 30_000;

export function shouldReclaim(status: string, updatedAt: string, nowMs: number): boolean {
  if (status !== "pending" && status !== "transcribing" && status !== "analysing") return false;
  const t = Date.parse(updatedAt);
  return Number.isNaN(t) || nowMs - t >= RECLAIM_AFTER_MS;
}
