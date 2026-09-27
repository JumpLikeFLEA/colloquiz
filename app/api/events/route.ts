import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractClientIp } from "@/lib/pendingClaims";

/**
 * POST /api/events — OPS-008's minimal funnel analytics. Fires for
 * landing_view, lesson_start and lesson_complete (client-side beacons) and
 * for signup (server-side only, from /auth/confirm and /auth/callback — see
 * docs/decisions/0069; this route is still the one write path either way).
 *
 * UNAUTHENTICATED ON PURPOSE: every one of these events can happen with no
 * session (anonymous landing/lesson play), so there is no caller JWT to
 * check. Uses the SERVICE ROLE client, not the caller's session, because the
 * underlying RPC (record_funnel_event, migration 051) is granted to
 * service_role only and trusts its p_ip argument for rate-limiting — same
 * posture as /api/pending-claims, and the same reason it must never be
 * reachable directly over PostgREST with a caller-chosen IP.
 *
 * Best-effort by design: a failure here must never surface to the learner or
 * block anything they're doing. Every non-2xx response is something the
 * caller (a `fetch(..., { keepalive: true })` the caller doesn't await, or a
 * server route that only logs on error) already ignores.
 */
const EventSchema = z.object({
  event: z.enum(["landing_view", "lesson_start", "lesson_complete", "signup"]),
  source: z.enum(["instagram", "telegram", "direct"]).nullable(),
  path: z.string().max(512).optional(),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = EventSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  const { event, source, path } = parsed.data;

  // Same fallback as /api/pending-claims/route.ts: a request with no proxy
  // in front of it (local `next dev`) carries neither header at all.
  const ip = extractClientIp(request.headers) ?? "127.0.0.1";

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("record_funnel_event", {
    p_event_type: event,
    p_source: source,
    p_path: path ?? null,
    p_ip: ip,
  });

  if (error) {
    console.error("record_funnel_event failed", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }

  const result = data as { ok: boolean; error?: string };
  if (!result.ok) {
    const status = result.error === "rate_limited" ? 429 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true }, { status: 202 });
}
