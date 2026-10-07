# 0086 — SHELL-019: account state on the English surface

## Context

The English surface had no account chrome. The landing header linked "Log
in" to `/login?next=/` for everyone. For a signed-in learner, proxy.ts's
`user && isAuthRoute` branch sends that straight back to `/`, so the link
looked dead. The only sign-out was in `AppSidebar.tsx`, inside the Colloquiz
shell. Found in ANON-009's OAuth test (#135).

The constraint is docs/handoff.md, "Performance boundary": the landing and
the free lesson render without an authenticated Supabase session, with no
`@supabase/ssr` client JS on the critical path. `/` had 2.0 KB of its 180 KB
budget left (178.0 KB below).

## Decision 1 — how a page knows a learner is signed in

Options, measured with `npm run budget` (cold, cache-disabled, anonymous
load). The routes were temporarily pointed at the published
`auth003-smoke-test` course, as in 0080, because the committed
`future-imperfect` routes 404 on hosted. That edit to `scripts/budget.ts` was
not committed.

| | `/` | cost |
|---|---|---|
| Baseline (b2a69fa) | 178.0 KB | — |
| **A. Server-side**: each page's Server Component resolves the session | 178.0 KB | +0.0 KB |
| B. Client-side: a client component reads `getSession()` with the `@supabase/ssr` browser client | 241.3 KB | +63.3 KB, and the OPS-013 guard flagged `@supabase/ssr` in `/`'s chunks |
| C. Client-side: look for an `sb-*` cookie in `document.cookie` | not built | see below |

B was measured with a throwaway `TmpSessionProbe.tsx` rendered in
`LandingContent`, built from scratch (`rm -rf .next`), then deleted. It puts
`/` 61.3 KB over budget.

C costs a few bytes but cannot verify the JWT. It would show "signed in" for
an expired or revoked session, and it still needs a server round trip to
sign out. Rejected without building it.

**Chosen: A.** A new server-only `lib/signedInAccount.ts`
(`getSignedInAccount`, wrapped in `cache()`) calls `authUserFrom`
(lib/auth.ts). The landing page, the course page and the lesson page each
call it in their Server Component. The course page (lib/courseAttempts.ts)
and the lesson page (lib/publicLesson.ts) already resolved the caller this
way for their own reads, so for them this is one more local JWT check, not a
new kind of cost. An anonymous visitor makes no network call:
`getClaims()` returns as soon as `getSession()` finds no session, before any
JWKS fetch (`node_modules/@supabase/auth-js/dist/main/GoTrueClient.js`,
`getClaims`). Every route under the English layout was already dynamic
(cookie reads), so nothing changes about caching.

Only the email is used. It is in the JWT, so no `profiles` read is added.

## Decision 2 — the indicator and the menu

A signed-in learner sees a white circle with their email's initial
(`lib/accountInitial.ts`, unit-tested; a person icon when the session has no
email). On `/` it sits where "Log in" was. On the course and lesson pages it
sits at the far right of the band's top bar. Tapping it opens a card:
"Signed in as <email>" and "Sign out". Its accessible name is the same
"Signed in as <email>" line.

`AccountMenu.tsx` is a Server Component with no client JS:

- Open/close is a native `<details>`. While open, the summary's `::before`
  becomes a transparent fixed full-viewport layer, so a tap outside the
  card lands on the summary and closes it. Verified in a browser (below).
  Escape does not close it; that would need JS. The summary toggles it from
  the keyboard.
- On `/`, the landing's strings switch client-side, so page.tsx renders
  the menu once per language and `LandingContent` picks the one that
  matches the toggle. This is the same pattern as the root layout handing
  `EnglishFooterGate` both footers (0079, "Budget"). Neither the menu nor
  its strings (`accountCopy.ts`) enter a client bundle.

A signed-out visitor sees exactly what they saw before: "Log in" on `/`,
and nothing on the course or lesson pages (BandTopBar has never had a login
link: registration is offered after a lesson, never before one).

Copy follows the per-route rules (0080): the landing and the course page use
the saved EN/RU choice, the lesson page is always English. The new strings
are pending owner/partner review.

## Decision 3 — sign-out is a form POST to a route handler

`app/auth/sign-out/route.ts`, POST only. The menu's form posts `next` (the
page it is on); the handler runs `safeNext` on it (lib/safeNext.ts), calls
`supabase.auth.signOut()` server-side, and answers 303 to `next`.

- **Not a Server Action.** A Server Action re-renders the page in place. On
  the lesson page that re-render generates a new `attemptId` in page.tsx,
  which would arrive as a new prop to a `LessonPlayer` still holding the
  old answers. This is read from the code (`attemptId =
  crypto.randomUUID()` per request in the lesson page.tsx), not reproduced;
  the form POST avoids the question rather than testing it. A 303 is a
  full page load, so the lesson starts over cleanly, signed out.
- **No client JS.** The form works before hydration and needs no
  `@supabase/ssr` browser client.
- **POST only**, so a prefetch or an `<img>` cannot end a session. Next
  answers GET with 405 (verified). A cross-site POST carries no session:
  @supabase/ssr writes its cookies `SameSite=Lax`
  (`node_modules/@supabase/ssr/dist/main/utils/constants.js`).
- **Default scope**, the same `signOut()` call `AppSidebar` makes, so "Sign
  out" means the same thing on both surfaces.

The learner stays where they were, signed out. Sign-out is not a path to
`/app`; the footer stays the only one (0062).

## Decision 4 — the course page's top bar on a phone

At 360px, a signed-in learner's course page has the wordmark, the toggle,
"← All courses" and the chip in one row. The first browser run showed the
back link wrapping onto two lines (header 56px instead of 44px). When the
bar holds both a toggle and the chip, the back link shows only its arrow
below `sm`, with the label as its `aria-label`; the label returns at `sm`.
The lesson page (no toggle) and every signed-out view keep the label at
every width.

## Verification

Static: `npm run check` exits 0; `npx vitest run lib/accountInitial.test.ts`
6/6.

Browser (scratchpad `account-check.mjs`, `next start` of this change, Edge
via Playwright, a test user created with the Admin API, signed in through
the real `/login` form, deleted afterwards), at 360px and 1440px:
87/87 checks passed. They covered:

- signed out: "Log in" on `/`, no chip anywhere;
- signed in, on all three pages: no "Log in", chip shown and named with the
  email, no horizontal scroll, header on one row, menu inside the viewport,
  copy in the page's language (EN, and RU on `/` and the course page after
  the toggle), an outside tap closes it without navigating;
- sign-out from the lesson page: back on the lesson, no chip, no `sb-*`
  cookie left, "Log in" back on `/`, `/app` bounces to `/login`;
- GET `/auth/sign-out` → 405; POST with `next=//evil.example/x` → 303 to `/`.

## Budget

`npm run budget`, same temporary routes as Decision 1, fresh builds:

| route | before (b2a69fa) | after |
|---|---|---|
| `/login` | 286.3 | 286.3 |
| `/` (budget 180) | 178.0 | 178.0 |
| `/courses/auth003-smoke-test` (budget 182) | 171.7 | 171.7 |
| `/courses/auth003-smoke-test/9` | 263.9 | 263.9 |
| `/courses/auth003-smoke-test/one-of-each-item-type` | 292.6 | 292.6 |

The two lesson routes were already above the 260/290 targets, which belong
to other lessons (0079, 0080).

## What would make us revisit it

- A real need for Escape-to-close or focus management in the menu: that is
  a small client component, and it would cost bytes on `/`.
- A profile picture or display name in the chip: that adds a `profiles`
  read on every English page for signed-in learners.
- Learners reporting being signed out on other devices: switch to
  `signOut({ scope: "local" })`, here and in AppSidebar together.
