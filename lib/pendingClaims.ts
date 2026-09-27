import crypto from "crypto";

/**
 * ANON-006 — pure helpers for the cross-browser claim mechanism (0048 §2,
 * docs/decisions/0066). The stateful half (the SQL that owns rate limiting,
 * expiry and idempotency) lives entirely in migration 049; this module is
 * only what can be tested without a database — token generation/hashing, the
 * payload size cap, and IP extraction from a request's headers.
 */

/** Raw token length in hex chars — 128 bits, per 0048's "hashed 128-bit
 * random token". */
const TOKEN_BYTES = 16;

/** Mirrors the CHECK on pending_claims.payload in migration 049. Kept in one
 * place so the route's pre-flight rejection and the DB's hard cap agree. */
export const PENDING_CLAIM_PAYLOAD_MAX_BYTES = 16384;

/** A fresh, unguessable claim token. Generated server-side (not by the
 * client) so its randomness quality is ours to guarantee. */
export function generateClaimToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("hex");
}

/** SHA-256 hex digest of a raw token — what's stored at rest and what the
 * claim endpoint re-derives from the token it's handed. Never store the raw
 * token itself (0048: "hashed at rest"). */
export function hashClaimToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** True when `payload`'s JSON serialization fits the DB's byte cap. Checked
 * before ever hashing/writing so an oversized body is rejected as a plain 400
 * rather than a raw constraint-violation round trip to Postgres. */
export function isWithinPayloadSizeCap(payload: unknown): boolean {
  return Buffer.byteLength(JSON.stringify(payload), "utf8") <= PENDING_CLAIM_PAYLOAD_MAX_BYTES;
}

/**
 * The caller's IP from `x-forwarded-for` (Vercel appends the real client IP
 * as the first entry; a local `next dev` request carries no such header at
 * all). Falls back to `x-real-ip`, then to `null` — never fabricates an
 * address, since a fabricated one would silently pool every such request
 * into one rate-limit bucket rather than leaving the gap visible.
 */
export function extractClientIp(headers: Pick<Headers, "get">): string | null {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();
  return null;
}
