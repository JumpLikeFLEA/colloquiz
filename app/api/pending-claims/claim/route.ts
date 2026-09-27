import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUserFrom } from "@/lib/auth";
import { hashClaimToken } from "@/lib/pendingClaims";

/**
 * POST /api/pending-claims/claim — the authenticated claim endpoint of 0048
 * §2 / ANON-006. Called from the confirmation callback, which by then holds a
 * real authenticated session: looks up the token, feeds its stashed attempts
 * through the ANON-003 record RPC, and consumes the row so it cannot be
 * claimed twice.
 *
 * Uses the caller's OWN session client (not the admin client) so auth.uid()
 * inside claim_pending_claim resolves to the confirmed user — that identity
 * is what record_lesson_attempts attributes the attempts to.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || typeof (body as { token?: unknown }).token !== "string") {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }
  const { token } = body as { token: string };

  const { data, error } = await supabase.rpc("claim_pending_claim", {
    p_token_hash: hashClaimToken(token),
  });

  if (error) {
    console.error("claim_pending_claim failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  const result = data as { ok: boolean; error?: string; result?: unknown };
  if (!result.ok) {
    // not_found (never existed, or already claimed) and expired are both
    // ordinary outcomes for a stale/reused link, not server errors.
    const status = result.error === "unauthenticated" ? 401 : 404;
    return NextResponse.json({ error: result.error ?? "Could not claim" }, { status });
  }

  return NextResponse.json({ ok: true, result: result.result }, { status: 200 });
}
