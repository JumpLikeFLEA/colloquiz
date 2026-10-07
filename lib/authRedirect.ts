/**
 * ANON-014 (docs/decisions/0085) — the redirect URLs AuthScreen hands to
 * Supabase for an email signup and an OAuth sign-in, and the rule for when
 * a visit to /login or /signup counts as the English surface's entry point.
 *
 * Pure and DOM-free: the caller passes `window.location.origin` and the
 * funnel source in, so this is testable in the "unit" vitest project.
 */

import type { FunnelSource } from "./funnelSource";

/** Where AuthScreen sends the user after auth. Kept relative and
 * single-slash to prevent open redirects; anything else falls back to "/". */
export function authDest(redirectTo: string | undefined): string {
  return redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/";
}

/**
 * True when /login or /signup was reached from the English surface: an
 * explicit `next` outside `/app`. The landing header links to
 * `/login?next=/`. Every Colloquiz entry is either a bare /login (the
 * `redirect("/login")` calls under app/(colloquiz)/(main), the sidebar's
 * sign-out, account deletion) or carries a `next` under `/app` (proxy.ts's
 * unauthenticated bounce, the `/app/s/[token]` share link), so neither of
 * those reads as English.
 */
export function isEnglishSurfaceEntry(redirectTo: string | undefined): boolean {
  if (redirectTo === undefined || authDest(redirectTo) !== redirectTo) return false;
  let pathname: string;
  try {
    pathname = new URL(redirectTo, "http://entry.invalid").pathname;
  } catch {
    return false;
  }
  return pathname !== "/app" && !pathname.startsWith("/app/");
}

/**
 * `emailRedirectTo` for `signUp`. `next` is always present: the
 * confirmation template (supabase/templates/confirmation.html) sends this
 * whole URL back as `next`, and /auth/confirm's `unwrapNext` reads the inner
 * `next` out of it. Without one, the learner is sent to a bare /auth/confirm
 * and lands on /login?error=confirm_expired (the redirect chain is in
 * docs/decisions/0085). `source` is added only when non-null, the same shape
 * RegistrationOffer builds.
 */
export function signupEmailRedirectTo(origin: string, next: string, source: FunnelSource | null): string {
  const params = new URLSearchParams({ next });
  if (source) params.set("source", source);
  return `${origin}/auth/confirm?${params.toString()}`;
}

/** `redirectTo` for `signInWithOAuth`. A bare /auth/callback when there is
 * nothing to carry, which is what a Colloquiz sign-in sent before ANON-014. */
export function oauthCallbackUrl(origin: string, next: string, source: FunnelSource | null): string {
  if (next === "/" && !source) return `${origin}/auth/callback`;
  const params = new URLSearchParams({ next });
  if (source) params.set("source", source);
  return `${origin}/auth/callback?${params.toString()}`;
}
