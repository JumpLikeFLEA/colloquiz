# 0084 — ANON-015: signup and the lesson player survive blocked storage

## Context

#135's audit hypothesised, unverified, that `getCurrentFunnelSource()`
(`lib/funnelSource.ts`) throws when `sessionStorage` is blocked, and that
because `RegistrationOffer.tsx` calls it inside its signup handlers' `try`
blocks, the signup fails with the generic error instead of only losing the
source. ANON-015 also asked for the same check on the local attempt store
reads and writes that ANON-013 (0082) put on the anonymous lesson path.

## Reproduction

Tests that make storage throw, run against the code before this card
(`git stash` of the two source files; 7 failed, 48 passed):

- `RegistrationOffer.test.tsx`, "ANON-015 — browser storage blocked": with
  the `window.localStorage` and `window.sessionStorage` getters throwing a
  `SecurityError`, `signUp` and `signInWithOAuth` were each called 0 times.
  **The hypothesis reproduced.** Two throws were on the email path, not one:
  `stashLocalAttempts()` → `createAttemptStore()` threw first, before
  `buildEmailRedirectTo` was reached. The OAuth path only reaches
  `getCurrentFunnelSource()`.
- `LessonPlayer.anonymous.test.tsx`, "ANON-015 — renders and scores…":
  **worse than the hypothesis.** `LessonPlayer` threw during its first
  render. The stack ran from `resolveBackend` (`lib/lessonPlayer/
  attemptStore.ts`, `!window.localStorage` outside any `try`) through
  `createAttemptStore` to `LessonPlayer`'s `useState` initializer. So the
  lesson itself didn't render, for a signed-in or anonymous learner. This
  predates ANON-013: the unguarded read came in with the store (2bb336a,
  ANON-002), and `LessonPlayer` has created the store on every render
  since 4edf65a (ANON-005) (`git log -S` on each line). ANON-013 only
  added the anonymous `record()` call, which was already guarded.
- `lib/funnelSource.test.ts`: `getCurrentFunnelSource()` threw when the
  `sessionStorage` getter threw, when `getItem` threw, and when `setItem`
  threw.
- `lib/lessonPlayer/attemptStore.test.ts`: `createAttemptStore()` with no
  injected backend threw when the `window.localStorage` getter threw.
  `getItem`/`setItem` throws were already covered and handled ("never
  throws when the backend is unavailable or full"). Only the property read
  was not.

Each new group has a control case that passes on both old and new code
(working storage classifies to `"telegram"` / persists one attempt), so a
pass is not a pass over stubs that were never reached.

This is simulated in jsdom and node, not a real browser with storage
blocked. Which browsers throw on the property read and which throw only on
`getItem`/`setItem` was not measured here. Both shapes are covered.

## Decision 1 — `getCurrentFunnelSource()` returns `null` on any storage throw

One `try` around the whole browser-globals wrapper, not inside
`resolveFunnelSource`. `null` is the value an opted-out visitor already
gets: `RegistrationOffer` then threads no `source` param, and no
acquisition row is written (0069, 0081). So a visitor with blocked
storage goes uncounted, not misattributed.

Options considered: classify without caching when storage fails.
Rejected. Without the per-tab cache, the second page's `document.referrer`
is this site's own URL, so the result would be `"direct"` for almost
everyone who browsed before signing up. That is a wrong value recorded as
if it were right. The card's acceptance also specifies `source = null`.

`fireFunnelEvent` already wrapped its call in a `try`, so its behaviour
changes only in that it now sends `source: null` instead of skipping the
event. That matches how an opted-out visitor's events are sent.

## Decision 2 — `resolveBackend` treats a throwing `window.localStorage` as no backend

The store's existing in-memory fallback, built for SSR and full storage,
now covers blocked storage too. Scoring works on the page; nothing
persists across loads.

## Known limitation, not fixed here

With storage blocked, `LessonPlayer` and `RegistrationOffer` each call
`createAttemptStore()` and get separate in-memory lists. The offer's stash
therefore sees no attempts and creates no `pending_claims` row: the
learner's attempts are not migrated at signup. Signup itself succeeds.
Fixing this means sharing one store instance across the two components,
which is new work, proposed rather than absorbed. Not measured, and
labelled as an assumption: a browser blocking site storage may also
block the auth cookies a later session needs, which would limit what
migration could achieve anyway.

## What would make us revisit this

- A real-browser report of blocked storage where signup or the lesson
  still fails. These tests stub the property and the methods. A browser
  that fails some third way, like a `Storage` object whose `length` throws,
  is not covered.
- A decision to count blocked-storage visitors by some channel other than
  the source cache.
