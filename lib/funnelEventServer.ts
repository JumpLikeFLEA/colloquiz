import { createAdminClient } from "@/lib/supabase/admin";
import type { FunnelSource } from "@/lib/funnelSource";

/**
 * OPS-008 / docs/decisions/0069 — the server-side half of funnel-event
 * recording. `signup` is the only event fired this way (from /auth/confirm
 * and /auth/callback, never client-side — RegistrationOffer.tsx has no
 * "did the account actually get created" signal of its own, only "did the
 * request succeed"). Calls the SAME record_funnel_event RPC
 * app/api/events/route.ts calls, via the same service-role admin client, so
 * there is exactly one write path and one place the rate limit/validation
 * logic lives (migration 051) — this is not a second implementation of that
 * route, just a second caller of the RPC it also calls.
 *
 * Best-effort and silent on failure, same posture as `fireFunnelEvent`: an
 * auth redirect must never be blocked or altered by an analytics write.
 */
export async function recordServerFunnelEvent(
  event: "signup",
  params: { source: FunnelSource | null; path: string | null; ip: string },
): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.rpc("record_funnel_event", {
      p_event_type: event,
      p_source: params.source,
      p_path: params.path,
      p_ip: params.ip,
    });
    if (error) console.error("record_funnel_event failed", error);
  } catch (err) {
    console.error("failed to record server funnel event", err);
  }
}
