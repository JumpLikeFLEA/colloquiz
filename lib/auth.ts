import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The caller's identity, resolved from their JWT.
 *
 * Deliberately narrow. Every call site in the app reads `id`, and exactly one
 * reads `email` (the Progress > Stats tab), so there is nothing to gain from
 * carrying the full Supabase `User` — and a lot to lose, since the rest of that
 * object is only obtainable with a network round trip.
 */
export type AuthUser = { id: string; email: string | null };

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
  return { id: sub, email: (data.claims.email as string | undefined) ?? null };
}
