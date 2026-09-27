# 0073 — SHELL-015: gate `/reset-password` on a live session

## Context

Discovered during SHELL-007's full-protocol audit (docs/decisions/0049):
narrowing the unauthenticated bounce to `/app` made `/reset-password`
reachable anonymously. Not a security hole — `ResetPasswordScreen` does no
server-side read or write of its own, only a client-side
`supabase.auth.updateUser({ password })` call, which fails outright with no
live session — but it's a UX regression: an anonymous or stale-link visitor
saw a form that would only fail on submit.

## Options considered

1. **Gate in `proxy.ts`'s `authRoutes`.** Rejected — that list also bounces a
   SIGNED-IN user away from auth routes (the `user && isAuthRoute` guard), and
   a recovery session IS a real signed-in session. Adding `/reset-password`
   there would bounce a legitimate recovery visit to `/app` before the learner
   could set a new password. This was explicit in the issue's acceptance and
   confirmed by reading `proxy.ts` directly rather than assumed.
2. **Client-side-only check** (call `getSession()` on mount, show a spinner
   then swap views). Rejected — an unnecessary flash of loading state when the
   answer is already knowable server-side; this project's auth is
   cookie-based via `@supabase/ssr`, not the implicit hash-fragment flow, so a
   server check works.
3. **Server-side check in `page.tsx`, chosen.** `createClient()` (the
   `@supabase/ssr` server client) + `getUser()` in the Server Component,
   passed down as a `hasSession` boolean. Works because `proxy.ts` already
   refreshes/validates the session cookie unconditionally on every
   non-excluded route (`authUserFrom(supabase)`) before this page renders, and
   this project's actual recovery email template
   (`docs/release/launch-checklist.md:35`) points directly at
   `/auth/confirm?token_hash=...&type=recovery&next=/reset-password`, whose
   `token_hash` branch (`app/auth/confirm/route.ts`) calls `verifyOtp`
   server-side and writes the session cookie via the same SSR client before
   redirecting here — so a genuine recovery visit already has a readable
   cookie session by the time `page.tsx` runs.

## Verification finding: `generateLink()`'s `action_link` does not match production

Admin API's `generateLink({ type: "recovery" })` returns an `action_link`
pointing at Supabase's hosted `/auth/v1/verify` endpoint. Following it lands
on `/login?error=confirm_expired#access_token=...&type=recovery` — GoTrue's
hosted verify redirect delivers tokens in a URL **fragment**, which
`/auth/confirm`'s `code`/`token_hash` query-param branches never see (a
fragment is never sent to the server). This is NOT what a real reset email
does: this project's custom template builds the `/auth/confirm` URL directly
with `token_hash` as a query param, bypassing the hosted verify redirect
entirely. Verification therefore built the `token_hash` URL by hand
(`generateLink()`'s `properties.hashed_token`, formatted exactly as the
template does) rather than following `action_link` — confirmed against a real
throwaway user via the Admin API, Playwright driving Edge headlessly, cleaned
up after. Recorded so a future session doesn't reach for `action_link` again
and get a false "recovery is broken" reading.

## Decision

- `page.tsx`: async Server Component, `getUser()` via `lib/supabase/server.ts`,
  passes `hasSession` to `ResetPasswordScreen`.
- `ResetPasswordScreen`: renders an "expired link" view (reusing
  `AuthLeftPanel` and the login page's destructive-box precedent) when
  `!hasSession`, and also switches to it mid-flow if `updateUser` fails with
  `AuthSessionMissingError` — a session valid at page load can still be gone
  by submit time. The view's CTA links to `/login?error=recovery_expired`,
  reusing `RECOVERY_EXPIRED_MESSAGE` (now exported from `login/page.tsx`)
  instead of duplicating the string.
- The prop is named `hasSession`, not `hasRecoverySession`, because Supabase
  gives no way to distinguish a recovery session from an ordinary one. A
  signed-in user who navigates to `/reset-password` still sees the working
  form — unchanged from before this card. That changing a password this way
  needs no reauthentication is a separate, pre-existing gap.

## What would make us revisit it

- If Supabase ever exposes a way to tag/detect a recovery-type session
  specifically, `hasSession` could be tightened to `hasRecoverySession` and a
  non-recovery signed-in visitor could be redirected to Settings instead.
- If the email template configuration changes to use the hosted `/verify`
  redirect (fragment-based tokens) instead of the current direct
  `token_hash` template, `/auth/confirm` would need a client-side fragment
  handler — this card's server-side check would then only correctly gate the
  no-token case, not a token-in-fragment link that never reached the server
  check at all.

## Proposed follow-up (not filed as an issue)

A signed-in, non-recovery user can change their password via
`/reset-password` with no reauthentication step. Low severity (they're
already authenticated as themselves), but worth a card if Settings ever wants
this action gated behind re-entering the current password.
