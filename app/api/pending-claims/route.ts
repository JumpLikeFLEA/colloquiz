import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractClientIp, generateClaimToken, hashClaimToken, isWithinPayloadSizeCap } from "@/lib/pendingClaims";

/**
 * POST /api/pending-claims — the unauthenticated create endpoint of 0048 §2 /
 * ANON-006. Called at signup form submission, before any session exists, to
 * stash an anonymous learner's local attempts (ANON-002) server-side so the
 * email-confirmation link — which typically opens in the system browser, not
 * the in-app webview the lesson was played in — can carry a token instead of
 * relying on localStorage the confirming browser doesn't have.
 *
 * Uses the SERVICE ROLE client, not the caller's (nonexistent) session: the
 * underlying RPC, create_pending_claim, is granted to service_role only,
 * because it trusts its p_ip argument for rate-limiting and must therefore
 * never be reachable directly over PostgREST with a caller-chosen IP —
 * migration 049 for the full reasoning.
 *
 * The token itself is generated HERE, not by the client (0048/0066): its
 * randomness quality is ours to guarantee, and only its SHA-256 hash ever
 * reaches the database. The raw token is returned once, for the caller to
 * embed in `emailRedirectTo` (ANON-004's job).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || !("attempts" in body)) {
    return NextResponse.json({ error: "Missing attempts" }, { status: 400 });
  }
  const { attempts } = body as { attempts: unknown };
  if (!Array.isArray(attempts)) {
    return NextResponse.json({ error: "attempts must be an array" }, { status: 400 });
  }
  if (!isWithinPayloadSizeCap(attempts)) {
    return NextResponse.json({ error: "Payload too large" }, { status: 400 });
  }

  const token = generateClaimToken();
  const tokenHash = hashClaimToken(token);
  // Vercel always sets x-forwarded-for; the fallback only matters for a
  // request with no proxy in front of it at all (local `next dev`).
  const ip = extractClientIp(request.headers) ?? "127.0.0.1";

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("create_pending_claim", {
    p_token_hash: tokenHash,
    p_payload: attempts,
    p_ip: ip,
  });

  if (error) {
    console.error("create_pending_claim failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  const result = data as { ok: boolean; error?: string; expires_at?: string };
  if (!result.ok) {
    if (result.error === "rate_limited") {
      return NextResponse.json({ error: "Too many attempts from this connection. Try again later." }, { status: 429 });
    }
    // invalid_token / invalid_payload: our own inputs, so this is a bug on
    // our side, not a caller-supplied problem — still a 400, not a 500,
    // since nothing failed on the database's end.
    return NextResponse.json({ error: result.error ?? "Could not create pending claim" }, { status: 400 });
  }

  return NextResponse.json({ token, expiresAt: result.expires_at }, { status: 201 });
}
