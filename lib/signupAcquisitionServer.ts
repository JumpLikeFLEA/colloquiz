import type { SupabaseClient } from "@supabase/supabase-js";
import { courseSlugFromNextPath } from "./acquisition";
import type { FunnelSource } from "./funnelSource";

/**
 * ANON-009 (docs/decisions/0081) — record which course and channel a new
 * account signed up from. Called from the two genuine-signup branches only:
 * /auth/confirm's token_hash branch and /auth/callback's new-account branch,
 * the same two places that already fire the `signup` funnel event (0069).
 *
 * Takes the route's own SESSION client, not the service-role one:
 * record_signup_acquisition() (migration 053) keys the row on auth.uid(),
 * the same way claimPendingAttempts in /auth/confirm relies on the session
 * verifyOtp/exchangeCodeForSession just established on that client.
 *
 * `source = null` (GPC/DNT opt-out, or a signup path that doesn't thread a
 * source) writes nothing and makes no call at all (0069: an opted-out
 * visitor leaves no trace). Never throws: the auth redirect must not be
 * blocked or altered by this write, same posture as recordServerFunnelEvent.
 */
export async function recordSignupAcquisition(
  supabase: Pick<SupabaseClient, "rpc">,
  params: { source: FunnelSource | null; next: string },
): Promise<void> {
  if (!params.source) return;
  try {
    const { data, error } = await supabase.rpc("record_signup_acquisition", {
      p_source: params.source,
      p_course_slug: courseSlugFromNextPath(params.next),
    });
    if (error) {
      console.error("record_signup_acquisition failed", error);
    } else if (data && typeof data === "object" && (data as { ok?: unknown }).ok === false) {
      console.error("record_signup_acquisition refused", data);
    }
  } catch (err) {
    console.error("failed to record signup acquisition", err);
  }
}
