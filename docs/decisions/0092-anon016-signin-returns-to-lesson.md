# 0092 — ANON-016: every sign-in path returns to the lesson

## Context

`/auth/confirm`'s failed `code` branch and both expired-link redirects built
`/login?...` without `next`, so a cross-browser confirmation ended on `/`
(source: the pre-change `app/auth/confirm/route.ts`, visible in `git show HEAD:app/auth/confirm/route.ts`).
The lesson page had no sign-in entry for an existing account.

## Decisions

1. **`loginRedirect()` in the confirm route** builds every failure redirect
   with `URLSearchParams`, carrying the already-`safeNext`ed `next`.
   Omitted when `next` is `/` (login's default) and when it is
   `/reset-password`: a learner who forgot their password would be sent to a
   page that needs the session they lack. `/login` already passed `next` to
   `AuthScreen` as `redirectTo`; a page test now pins that for `error` and
   `notice`.
2. **"Already have an account? Sign in"** link in `RegistrationOffer`, in the
   collapsed and expanded states, to `/login?next=<lesson path>`. A plain
   `Link`: no new client module. The existing `AuthScreen` email/OAuth
   sign-in then honours `next` through `authDest`.
3. Copy is English (lesson chrome, 0080 Decision 5): `signupOffer.signIn`.

## Evidence / limits

`route.failure.test.ts` prints the exact `Location` for each shape incl.
`next=%40evil.com`. `npm run budget` before/after: `/` 178.3 → 178.3 KB,
`/login` 286.3 → 286.3 KB, lesson `true-or-false` 257.8 → 257.9 KB (the Link).
NOT done in this session: live password/OAuth sign-in chains against the
hosted project, and the hosted "Confirm signup" template check (owner).

## Revisit if

The hosted template does not use `next={{ .RedirectTo }}` (0068 Decision 5).
