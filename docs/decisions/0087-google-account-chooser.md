# 0087 — Google sign-in always shows the account chooser

## Context

Owner report, 2026-10-07: after signing in with Google once, a second or
third Google account could not be chosen. Both Google sign-in calls
(`AuthScreen.tsx` and the lesson's `RegistrationOffer.tsx`) passed only
`redirectTo`, so Google's authorize URL carried no `prompt`.

Measured against the dev server, by clicking "Google" on `/login` and reading
the `Location` of Supabase's `/auth/v1/authorize` 302 (scratchpad
`google-prompt2.mjs`):

| code | `accounts.google.com/o/oauth2/v2/auth` `prompt` |
|---|---|
| before (stashed) | absent |
| after | `select_account` |

That a missing `prompt` makes Google reuse the browser's signed-in Google
account is an assumption from Google's OpenID Connect documentation. It is
confirmed only when a real second account sees the chooser. Signing out of
this app does not sign the browser out of Google, so without the chooser the
first account keeps coming back.

## Decision

`oauthQueryParams(provider)` in `lib/authRedirect.ts` (unit-tested) returns
`{ prompt: "select_account" }` for Google. Both call sites pass it as
`queryParams`, which auth-js forwards to the provider
(`node_modules/@supabase/auth-js/dist/main/GoTrueClient.js`,
`_getUrlForProvider`), and GoTrue forwards to Google (table above).

Every Google sign-in now shows the chooser, even for someone with one Google
account. That is one extra tap, accepted: a wrong account silently chosen is
worse than one tap.

Discord is unchanged. Nobody reported it, and its `prompt` values
(`consent`, `none`) mean something different.

## What would make us revisit it

- The owner's test with a second account still skipping the chooser: then
  the cause is elsewhere (for example a Supabase session that was never
  ended), and this change is kept only if it does no harm.
- Learners in in-app browsers dropping off at the chooser (OPS-007).
