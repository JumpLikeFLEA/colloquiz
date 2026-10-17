import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The caller's identity, resolved from their JWT.
 *
 * Deliberately narrow. Every call site in the app reads `id`, and exactly one
 * reads `email` (the Progress > Stats tab), so there is nothing to gain from
 * carrying the full Supabase `User` — and a lot to lose, since the rest of that
 * object is only obtainable with a network round trip.
 */
export type AuthUser = { id: string; email: string | null; username: string | null };

/**
 * The Telegram username of an account that has no email (SHELL-024), read
 * from the JWT's `user_metadata.preferred_username` so it costs no network
 * call. docs/decisions/0098 printed `preferred_username` in `user_metadata`
 * for a Telegram account, and a local access token minted for a user created
 * with that metadata carries it under `user_metadata` (SHELL-024 probe).
 * Returned without the leading "@", trimmed and capped; null when absent or
 * not a string. It is a display label, never an identifier: `user_metadata`
 * is user-editable, so nothing may be authorised on it.
 */
export function usernameFromClaims(claims: Record<string, unknown>): string | null {
  const meta = claims.user_metadata;
  if (!meta || typeof meta !== "object") return null;
  const raw = (meta as Record<string, unknown>).preferred_username;
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/^@+/, "").slice(0, 64);
  return name || null;
}

/**
 * Resolves the caller from their access token, verifying the signature locally.
 *
 * This replaces `supabase.auth.getUser()`, which sends the token to Supabase
 * Auth and waits — ~80-120ms on the front of every request, before any data
 * fetching can start. `getClaims()` verifies the signature with WebCrypto
 * against the project's JWKS instead. The key set is cached in a module-level
 * global inside auth-js (10 minute TTL), so building a fresh client per request
 * still reuses it and the steady-state cost is zero network calls.
 *
 * Safe to prefer over getUser() here because auth resolution is not the security
 * boundary: nothing on the request path uses the service role key, so every
 * query goes through PostgREST, which verifies the JWT itself and enforces RLS.
 * This supplies identity for redirects and `user.id`, not authority.
 *
 * The trade-off is revocation latency — a session ended on another device stays
 * valid here until the access token expires (up to an hour) rather than being
 * caught on the next navigation. Accepted deliberately.
 *
 * If the project ever reverts to a symmetric (HS256) signing key, getClaims()
 * transparently falls back to a getUser() network call, so this degrades to
 * today's behaviour rather than breaking.
 */
export async function authUserFrom(supabase: SupabaseClient): Promise<AuthUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) return null;
  // `||`, not `??`: an account with no email (Telegram sign-in) carries
  // `email: ""` in its JWT (docs/decisions/0098), and "no email" has one value here.
  const email = (data.claims.email as string | undefined) || null;
  // Only an account with no email shows a username; an email account is unchanged.
  return { id: sub, email, username: email ? null : usernameFromClaims(data.claims) };
}
