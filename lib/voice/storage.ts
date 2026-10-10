import type { SupabaseClient } from "@supabase/supabase-js";
import { VOICE_BUCKET, VOICE_SIGNED_URL_TTL_SECONDS } from "./recording";

/**
 * Storage calls for voice recordings (VOICE-004, docs/decisions/0110). The
 * client is passed in, so the access rule is always whoever's client it is:
 *
 * - Playback is signed under the CALLER's session. The bucket's SELECT
 *   policy (migration 060) lets the learner sign their own takes and a
 *   course editor sign that course's; anyone else gets an error and no URL.
 * - Removal takes the SERVICE-ROLE client: no app role has a DELETE policy
 *   on the bucket. Objects are only ever removed through the Storage API,
 *   never by deleting storage.objects rows.
 */

export async function signVoicePlaybackUrl(
  client: SupabaseClient,
  objectName: string,
  ttlSeconds: number = VOICE_SIGNED_URL_TTL_SECONDS,
): Promise<{ url: string; expiresAt: Date } | null> {
  const issuedAt = Date.now();
  const { data, error } = await client.storage.from(VOICE_BUCKET).createSignedUrl(objectName, ttlSeconds);
  if (error || !data?.signedUrl) return null;
  return { url: data.signedUrl, expiresAt: new Date(issuedAt + ttlSeconds * 1000) };
}

/** Storage API's remove() takes a list; kept well under its request size. */
export const VOICE_REMOVE_BATCH = 100;

/**
 * Removes the objects through the Storage API, then tells SQL which names
 * are gone (voice_mark_removed: a retention-purged take keeps its row with
 * object_name NULL; queued names leave the queue). A batch whose remove()
 * errors is NOT marked, so it stays due and the next purge run retries it.
 * remove() of a name that no longer exists succeeds with nothing removed,
 * which is why a whole successful batch is marked, not only the names
 * remove() echoes back.
 */
export async function removeVoiceObjects(
  admin: SupabaseClient,
  names: readonly string[],
): Promise<{ removed: string[]; failed: string[] }> {
  const removed: string[] = [];
  const failed: string[] = [];
  const unique = [...new Set(names)];

  for (let i = 0; i < unique.length; i += VOICE_REMOVE_BATCH) {
    const batch = unique.slice(i, i + VOICE_REMOVE_BATCH);
    const { error } = await admin.storage.from(VOICE_BUCKET).remove(batch);
    if (error) {
      failed.push(...batch);
      continue;
    }
    const { error: markError } = await admin.rpc("voice_mark_removed", { p_names: batch });
    if (markError) {
      // The objects are gone; the rows still point at them. The next purge
      // run lists them again, remove() succeeds on a missing name, and the
      // mark is retried then.
      failed.push(...batch);
      continue;
    }
    removed.push(...batch);
  }
  return { removed, failed };
}
