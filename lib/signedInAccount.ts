import { cache } from "react";
import { authUserFrom } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * SHELL-019 (docs/decisions/0086) — who, if anyone, is signed in, for the
 * English surface's account chip. Server-only: it reads the session cookies
 * through lib/supabase/server.ts, so nothing about it reaches the client
 * bundle, and an anonymous visitor pays no network call: with no session
 * cookie, getClaims() returns as soon as getSession() finds nothing, before
 * any JWKS fetch or getUser() (read in node_modules/@supabase/auth-js/dist/
 * main/GoTrueClient.js, `getClaims`).
 *
 * `authUserFrom` verifies the JWT locally (lib/auth.ts), the same
 * resolution the course page (lib/courseAttempts.ts) and the lesson page
 * (lib/publicLesson.ts) already do for their own reads. `cache()` makes a
 * second call in the same request free; it does not dedupe against those
 * two, which build their own clients.
 *
 * Only `email` is returned: it is in the JWT, so it costs no profiles read.
 */
export const getSignedInAccount = cache(async (): Promise<{ email: string | null } | null> => {
  const supabase = await createClient();
  const user = await authUserFrom(supabase);
  return user ? { email: user.email } : null;
});
