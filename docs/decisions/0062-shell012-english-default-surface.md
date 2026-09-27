# 0062 — SHELL-012: English is the default surface; Colloquiz behind a footer link

## Context

Settled input 7 (owner, 2026-09-24, docs/handoff.md "Open questions"): Colloquiz
is reachable only through a footer link; a signed-in user lands on `/` after
login, signup, OAuth or email-confirmation, not `/app`. SHELL-007 built the
English route group; this card verifies the redirect logic and adds the one
link off the English surface, per the issue's own scoping (production
confirmation that live English content actually sits at `/` is OPS-010's job,
since `/` still 307s to `/app` until SHELL-010, per SHELL-013).

## What was audited

- `proxy.ts`'s three redirect blocks (unauthenticated bounce, signed-in-on-
  auth-route bounce, stray-code forwarding) were already correct: all three
  are scoped to `isProtectedRoute` (`/app` only), and the signed-in-on-auth
  bounce already defaults to `/` when no `next` param is present. No change
  needed there.
- `/auth/callback` and `/auth/confirm` (`app/auth/*/route.ts`) already
  default `next` to `/`. No change needed.
- `AuthScreen.tsx`'s client-side `dest` (used by `router.push(dest)` after
  email/password sign-in and as the OAuth callback's `next` param) defaulted
  to `/app` whenever no `redirectTo` prop reached it — i.e. every direct visit
  to `/login` or `/signup` with no `?next=`. This is the actual bug: a
  learner or existing user signing in with no specific destination landed on
  Colloquiz, not `/`. Fixed: default changed to `/`.
- `ResetPasswordScreen.tsx` hardcoded `router.push("/app")` after a
  successful password update. Same bug, same fix, to `/`. (Distinct from
  SHELL-015, which gates the page on having a live recovery session at all —
  that card doesn't touch this redirect target.)
- Existing Colloquiz-internal links/redirects that read `/app` (AppSidebar,
  Topbar, SubjectGrid, QuizSession, invite/results/history pages,
  `ProvidersSection`'s reconnect-provider `next=/app/settings`) are
  navigation WITHIN the signed-in Colloquiz shell, not the post-auth landing
  target, and correctly stay pointed at `/app` per the issue's acceptance
  line 4.

## Decision

1. Changed `AuthScreen.tsx`'s `dest` fallback and `ResetPasswordScreen.tsx`'s
   post-update redirect from `/app` to `/`.
2. Added `app/(english)/EnglishFooter.tsx`, rendered from
   `app/(english)/layout.tsx` below `{children}` so it appears on every page
   under the English root layout. It is the ONLY link from this surface to
   `/app` — no header, no sidebar, no toggle, matching the settled "footer
   link only" answer. Copy lives in `lib/alliengll/copy.ts` (`footer.
   colloquizLink`), same Russian-only rule as the rest of that module.
3. No change to any Colloquiz-internal `/app` link.

## What would make us revisit it

- If SHELL-010 or a later card adds a header/nav to the English surface, the
  footer-only rule from docs/handoff.md's "Open questions" would need to be
  re-confirmed with the owner before adding a second path to `/app`.
- If a future auth path (e.g. a new OAuth provider, a new email template)
  introduces its own hardcoded destination, it should default to `/`, not
  `/app`, unless it's explicitly re-entering Colloquiz (e.g. the settings
  reconnect-provider flow).
