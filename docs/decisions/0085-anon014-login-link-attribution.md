# 0085 — ANON-014: attribute signups from the landing "Log in" link

## Context

ANON-009 (0081) records a signup's channel and course only when the signup
redirect carries `source`. `RegistrationOffer` threads it; `AuthScreen`, which
the landing header's "Log in" link opens, threaded neither `source` nor, for
email, `next` (0081, "Known gaps"). #135's audit also left a hypothesis: that
AuthScreen's email confirmation ends on an error page.

## Finding — the hypothesis is confirmed

Local stack with email confirmation ON (`enable_confirmations = true`,
changed for the run and reverted), dev server and browser on the same origin
(`http://localhost:3001`), email signup from the landing's "Log in" link on
the pre-change code, link taken from Mailpit:

```
email link: http://127.0.0.1:3001/auth/confirm?token_hash=pkce_148f…&type=email&next=http%3a%2f%2flocalhost%3a3001%2fauth%2fconfirm
307 http://127.0.0.1:3001/auth/confirm?token_hash=pkce_148f…&type=email&next=http%3a%2f%2flocalhost%3a3001%2fauth%2fconfirm -> http://localhost:3001/auth/confirm
307 http://localhost:3001/auth/confirm -> http://localhost:3001/login?error=confirm_expired
200 http://localhost:3001/login?error=confirm_expired
```

The account IS confirmed (`email_confirmed_at` set) and no
`signup_acquisitions` row is written. The mechanism: the confirmation
template (`supabase/templates/confirmation.html`) sends the whole
`emailRedirectTo` back as `next`; `unwrapNext` finds no inner `next` in a bare
`<origin>/auth/confirm`, keeps the URL itself, `safeNext` reduces it to
`/auth/confirm`, and the second hop has no token.

A first run with the browser on `127.0.0.1` and the server reporting its
origin as `localhost` ended at `/` instead: `safeNext` rejected the
cross-origin `next`. That is a local-environment artifact; in production the
two origins are the same, which is the run above. It affects every
AuthScreen email signup (Colloquiz's too) whenever confirmation is ON; the
hosted project has it OFF today (0081, "Finding").

## Decision 1 — the entry point is marked by an explicit `next` outside `/app`

`isEnglishSurfaceEntry()` (`lib/authRedirect.ts`) is true when AuthScreen
receives a `next` that it would follow and that is not `/app` or under it.
The landing header now links to `/login?next=/`.

Options considered:
- A new query flag (`?from=english`). Rejected: a second parameter to carry
  through the login/signup toggle, for information `next` already holds.
- Thread the source on every AuthScreen signup. Rejected: the card requires
  Colloquiz-only signups to be unaffected, and classifying a Colloquiz
  visitor writes sessionStorage they never consented to be classified in.
- Read only an already-cached source (no classification on /login).
  Rejected: the card names `getCurrentFunnelSource()`, and the cache is
  per-tab, so it would silently drop a learner who opened "Log in" in a new
  tab.

Every Colloquiz entry is a bare `/login` (the `redirect("/login")` calls in
`app/(colloquiz)/(main)`, sidebar sign-out, account deletion) or a `next`
under `/app` (proxy.ts's bounce, the `/app/s/[token]` share link), checked by
grep at the time of writing. A future English link to /login or /signup must
pass a `next` to be attributed; M3's lesson sign-in prompt is expected to
pass the lesson path, which also gives 0081's course resolution its course.

## Decision 2 — `next` is threaded into EVERY AuthScreen email signup

`signupEmailRedirectTo()` always adds `next`, also for Colloquiz entries
(`next=/` for a bare `/signup`). This fixes the Finding above for Colloquiz
signups too, including the `/app/s/[token]` share flow whose page comment
expects confirmation to return there. `source` stays English-only, so
Colloquiz signups still record no source, no acquisition row, and the same
`signup` funnel event as before (it was already fired on the first hop). A
Colloquiz OAuth callback is byte-identical to before (`oauthCallbackUrl()`
keeps the bare `/auth/callback` when there is nothing to carry).

This is a behaviour change to Colloquiz signups the card said to leave
unaffected. It was read as "unaffected in attribution": leaving Colloquiz on
the error page would have needed a second code path that exists only to
keep a bug.

## Decision 3 — the login/signup toggle keeps `next` in the URL

`handleToggle` used to rewrite the URL to a bare `/login` or `/signup`. The
component still held `next` in props, but a reload lost it, and with it the
attribution. The rewritten URL now keeps `?next=`.

## Verification

- `lib/authRedirect.test.ts` (unit) and `app/(colloquiz)/(auth)/AuthScreen.test.tsx`
  (component, 6 cases: English email, English OAuth, GPC, bare /signup,
  bare /login OAuth, `next` under `/app`). On the pre-change AuthScreen, 5 of
  the 6 fail; the sixth is the unchanged bare-/login OAuth case.
- Local stack, confirmation ON, after the change: landing (`?utm_source=telegram`)
  → "Log in" → "Sign up" → Mailpit link → one 307 to `/`, row
  `source = telegram`, `course_id` NULL (`next=/` is not a course). Bare
  `/signup?utm_source=telegram` → one 307 to `/`, no row.
- OAuth from the landing link needs a real provider; the local stack has
  none, so that run is the owner's (see the issue's closing comment).

## What would make us revisit this

- An English link to /login or /signup that cannot pass a `next`.
- A Colloquiz route that links to /login with a `next` outside `/app`.
- Launching with email confirmation OFF (0081's Finding): then no email
  signup reaches `/auth/confirm` and neither form records a row.
