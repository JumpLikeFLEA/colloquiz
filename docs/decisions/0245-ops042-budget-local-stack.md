# 0245 — OPS-042: the budget guard measures every route, on the local stack

Status: built 2026-11-26 (#325). No migration, no new dependency, no hosted write. Every hosted contact
in this card was the guard's own: the login form's sign-in attempt for two fixture emails and page loads.

## Context

On 2026-11-21 (AUTH-025, #323) every `signInAs` route in `scripts/budget.ts` printed
"FAIL (sign-in as …: page.waitForURL: Timeout 15000ms exceeded.)" and `/runs/…f1a0` "FAIL (navigation
returned 404)", so eight budgets were not enforced. The card's hypothesis: `npm run budget` serves
against `.env.local`'s hosted project, and the fixtures exist only on the local stack.

## The cause, re-derived

- **Which project the server reads.** `npm run budget` is `tsx --env-file=.env.local`, and `.env.local`'s
  `NEXT_PUBLIC_SUPABASE_URL` is a `*.supabase.co` URL (read from the file, ref not printed). The guard
  now prints the URL it serves: run A printed `Supabase: https://*.supabase.co (from the environment /
  .env.local).`
- **Whether each fixture exists there.** Run A (new code, hosted env): for both `prog002-learner@example.com`
  and `prog007-learner@example.com` the login form answered "Invalid login credentials", on all seven
  `signInAs` routes, and `/runs/c0050000-0000-4000-8000-00000000f1a0` returned 404. On the local stack
  (read-only `psql` on `supabase_db_colloquiz`): both users exist, and `course_runs` holds both
  `…f1a0` and `…f1a1`.
- **Why they can only be there.** `scripts/seed-local-fixtures.ts` refuses any host but
  `localhost`/`127.0.0.1` (lines 55-66, "it must only ever run against a local `supabase start` stack").
- **Why a missing fixture took 15 s.** `signInCookies` waited only for the URL to leave `/login`; a refused
  sign-in stays on `/login` with the error box, so it sat out the timeout.

**Hypothesis confirmed.** The before run (`npm run budget`, old code) reproduced the eight FAILs exactly.

The goal's second gap was stated as "a `next build` run with other env vars can be reused by the guard".
**Replaced:** run D ran `npx next build` outside the guard, and the next guard run printed
"Rebuilding: .next has no budget source stamp", because `next build` removed `.next/budget-source-fingerprint`.
The gap that was real is a guard run whose *process env* names another Supabase URL while the `.env*`
files are unchanged: the old fingerprint hashed only the files, so it matched and reused a build that
had the other URL frozen into its client bundle (from the old `buildIfNeeded`, which passed nothing else
to `sourceFingerprint`). `--local` is exactly that case.

## Decisions

1. **`npm run budget:local` (`scripts/budget.ts --local`) is the one documented way to measure every
   route.** It reads `API_URL`, `ANON_KEY` and `SERVICE_ROLE_KEY` from `npx supabase@2.120.0 status -o env`
   and sets them as `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY` in the guard's env, which `next build` and `next start` inherit. A key
   already in `process.env` wins over every `.env*` file (`@next/env`'s `processEnv` only fills keys whose
   initial value is undefined). Other `.env.local` values (e.g. `NEXT_PUBLIC_SITE_URL`) are left as they
   are. With the stack down it stops and says how to start and seed it. It cannot be combined with `--url`.
   Options not taken: seeding the fixtures on hosted (real auth users with a known password on the shared
   project; the seed refuses it on purpose, 0052); keeping hosted and dropping the signed-in entries
   (loses the budgets).
2. **Plain `npm run budget` still serves against `.env.local`.** Its public routes measure; its signed-in
   routes fail at once. Not made to fail early as a whole: the hosted figures of the public routes are
   still what OPS-028 derived `/`'s budget from.
3. **A missing fixture fails fast, by the form's own answer.** The sign-in races leaving `/login` against
   AuthScreen's error box (`form p.bg-destructive-subtle`) and, when the box wins, fails with the form's
   message, the fixture's email, the served URL and how to seed. Chosen over a direct GoTrue call: it works
   the same under `--url`, where the guard does not know the server's project. The selector is a class,
   since the box has no role; changing AuthScreen to add one was left out (no visual change is owed here).
4. **A seeded route's 404 names the seed.** Routes whose data comes from the seed carry `seeded: true`.
   The hint points at the exact env the seed needs, because `npm run seed:local` alone reads `.env.local`'s
   hosted URL and refuses.
5. **The build stamp is `{ fingerprint, supabaseUrl, buildId }`** (JSON; a bare hash from the old guard is
   read as "no URL" and rebuilds). A run rebuilds when the URL it will serve differs from the stamp's
   (trailing slash ignored), or when `.next/BUILD_ID` differs from the stamp's. The second is
   belt-and-braces: run D showed `next build` removes the stamp today, but the guard should not depend on
   that. Rule in `scripts/budgetBuildStamp.ts`, 20 tests (12 failed before the change, 20 pass after).
6. **Printed URLs mask a hosted ref** (`https://*.supabase.co`), so guard output can go in an issue
   comment as it is.

## Measured (2026-11-26, one machine)

- Before (`npm run budget`, old code, hosted env): 9 routes measured, 8 FAIL (`/runs/…f1a0` 404; seven
  `signInAs` routes `Timeout 15000ms exceeded`), true-or-false 261.1 of 260.
- A (`npm run budget`, new code): `Rebuilding: the stamp records no Supabase URL (written by a guard
  older than OPS-042)`; the same 9 measure with the same figures; the 8 FAIL with "Invalid login
  credentials … missing on https://*.supabase.co" or the 404 seed hint.
- B (`npm run budget:local`, right after A): `Rebuilding: the build was made against https://*.supabase.co,
  and this run serves http://127.0.0.1:54321`. All 17 entries print a KB figure; 0 sign-in timeouts.
- C (prog002's email renamed on the LOCAL stack, then restored): `Reusing .next: sources and Supabase URL
  unchanged`; prog002's 4 routes FAIL with the form's answer, prog007's 3 measure; the whole run took 28 s.
- D (`npx next build` with the hosted env, then `npm run budget:local`): `Rebuilding: .next has no budget
  source stamp`; all 17 measure, the same figures as B.

The figures from B and D, local stack, voice mode off: `/login` 288.1, `/` 191.9, `/` (phone) 185.0,
true-or-false 259.9, applied-practice 287.7, the course page 176.5, `/invite`, `/join`, `/completed` 176.0,
`/runs/…f1a0` 182.0, `/my` 175.2 and 175.2, `/runs/…f1a1` 182.0 (OVER, 179), `/my/notebook` 169.3,
`/my/messages` 176.0, `/my/settings` 201.1, `/courses/coh005-fixture` 176.5. The local and hosted builds
differ by about 1 KB on the same code (e.g. `/` 191.9 here, 192.9 in A).

`/runs/…f1a1` over its budget is not a regression from this card: 0240 recorded 182.0 KB with
`VOICE_ANALYSIS_MODE` off and 172.3 with it on, the mode its entry was measured with, and the guard does
not set the mode. Proposed as its own card.

## What would make us revisit this

- The fixtures are ever seeded somewhere other than the local stack (a staging project).
- AuthScreen's error box changes class or gains a role: the fast-fail selector follows it.
- Next stops removing `.next`'s extra files on build: decision 5's BUILD_ID check then carries the case alone.
- A budget comes to depend on another env var (the voice mode above): the guard should pin it, not the reader.
