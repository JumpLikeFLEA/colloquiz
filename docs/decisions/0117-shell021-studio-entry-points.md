# 0117 — SHELL-021: Studio entry points (account chip, post-sign-in landing)

Status: **decided unattended** (SHELL-021 ran `--no-approval`). Open to
correction.

## Context

0109 Decision 4 names three ways into Studio. Entry point 1 (the Colloquiz
sidebar links) landed with SHELL-020. SHELL-021 builds the other two: an
editor-only "Studio" link in the English `AccountMenu`, and an editor who
signs in with `next` absent or `/` landing on `/studio`.

"Editor" here means what the Studio layout's gate means
(`getCourseAccess`, lib/courseAccess.ts): an admin, or the holder of at
least one `course_editors` grant — `can_edit_course` (029) asked for any
course.

## Decision 1 — one rule, one check, both server-side

- `lib/postSignInDest.ts` is the pure rule: `postSignInDest(next,
  isEditor)` returns `/studio` for an editor whose `next` is exactly `/`,
  otherwise `next`. Under vitest.
- `lib/studioEditor.ts` `isStudioEditor(supabase, userId)` is the one
  check: `is_admin` (027) and a head+count of the caller's own
  `course_editors` rows, in parallel. It authorises nothing (the Studio
  layout and RLS do), so a failed read degrades to `false`: no link, land
  on `/` as before.

## Decision 2 — the password sign-in goes through `/auth/after-sign-in` (*unattended*)

AuthScreen signs in from the browser. Options:

1. Ask the editor question from the client (`is_admin` RPC + a
   `course_editors` select through the browser client). A second copy of
   the check, in client code.
2. Route that one case through a server hop. **Chosen.** When the sign-in
   was in login mode and `next` is `/` (`signInDestDependsOnRole`),
   AuthScreen does a full navigation to `/auth/after-sign-in?next=/`, a
   GET route handler that applies the same rule `/auth/callback` applies
   (303). A deeper `next` and a new signup (who holds no grant yet) keep
   the old `router.push`. A full navigation, not `router.push`, because the
   target is a route handler that redirects, possibly into another root
   layout.
3. Make proxy.ts's "signed-in user on /login" bounce apply the rule.
   Rejected: it relies on a refresh of /login after sign-in, and it would
   put an editor read in the proxy.

`/auth/after-sign-in` is not in proxy.ts's `authRoutes` (those bounce a
signed-in user away). A signed-out request just redirects to `next`.

## Decision 3 — "`/`" means exactly "/" (*unattended*)

`/?source=…` and `/#catalogue` are explicit landing targets, so they win
like any deeper `next`. On OAuth an absent `next` is already `/` (the
callback defaults it), so "absent" and "/" are the same case on both paths.

## Decision 4 — which sign-in paths carry the rule

- Password sign-in (AuthScreen, login mode): yes, Decision 2.
- OAuth (`app/auth/callback/route.ts`), from AuthScreen and from
  RegistrationOffer: yes. The editor check runs only when `next` is `/`;
  the funnel event and acquisition record keep the original `next`.
- Email confirmation (`/auth/confirm`): no. It confirms a new signup, who
  cannot hold a grant yet.
- Telegram (ANON-012): not landed (blocked by ANON-010). Left to ANON-012,
  which should call `postSignInDest` + `isStudioEditor` the same way.

## Decision 5 — the menu link (*unattended*)

- `getSignedInAccount()` now also returns `isEditor`, read only once a user
  is known, so an anonymous visitor pays nothing. A signed-in learner pays
  two parallel reads per English page that renders the chip.
- In the menu: a "Studio" link above "Sign out", same button classes and
  the `PenTool` icon Studio's own header tile uses. A plain `<a>`: Studio
  is another root layout, so it is a full load anyway, and it adds no
  client JS. Label "Studio" in both languages: it is Studio's name, and
  Studio's chrome is English (0109).

## Measurements

`npm run budget`, before → after (cold load, signed out): `/` 179.0 →
179.0 KB; `/courses/future-imperfect` 172.9 → 172.9;
`/courses/future-imperfect/true-or-false` 259.5 → 259.5;
`/login` 287.3 → 287.4. `/runs/c005…f1a0` FAILs 404 in both runs (no such
run in the database the budget ran against), unrelated to this card.

## Revisit when

- An editor finds landing on `/studio` from the landing's "Log in" wrong
  (e.g. she wanted to see the site as a learner): the "View site" link is
  the way back; if that's not enough, drop `/` from the rule and keep only
  an absent `next`.
- The per-page editor read on signed-in English pages shows up in latency.
