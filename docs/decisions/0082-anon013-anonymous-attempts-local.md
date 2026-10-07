# 0082 — ANON-013: anonymous attempts are recorded to the local store

## Context

docs/handoff.md ("Audience and language"): "progress lives in localStorage
until registration, then migrates." Both migration paths existed and were
tested: the same-browser mount-time flush (0068 Decision 6) and
RegistrationOffer's cross-browser `pending_claims` stash (0068 Decisions
3–4). Neither had anything to migrate. `LessonPlayer.handleScore` returned
before `attemptStore.record()` unless `isSignedIn`, and that was the only
`.record(` call in `app/` and `lib/` (introduced in 4edf65a, ANON-005).
Measured in ANON-009's OAuth test (#135 evidence comment, "Surprises"): an
account created after answering every exercise of a free lesson had 0
`lesson_attempts` and no new `pending_claims` row.

## Decision 1 — record on `lessonVersionId` alone; upload on `isSignedIn`

`handleScore` now records every scored block to the local store whenever
`lessonVersionId` is set. Only `recordSignedInAttempt` (the upload, and the
dynamic `@/lib/supabase/client` import behind it) still needs `isSignedIn`.

- `lessonVersionId` stays the guard for recording at all. The only caller
  that passes it is the public lesson page
  (`app/(english)/courses/[courseSlug]/[lessonSlug]/page.tsx` →
  `LessonPageClient.tsx`; `rg -n "lessonVersionId=" app` outside tests), so
  the admin preview and the demo still write nothing. Covered by the second
  case in `LessonPlayer.anonymous.test.tsx`.
- The mount-time flush is unchanged. It was already correct; it was reading
  an empty store.

Options considered: a separate "anonymous" store or key. Rejected: 0048
Decision 1 and 0067's own "what would make us revisit this" already assumed
one store for both states, and RegistrationOffer reads the same key.

## Decision 2 — the anonymous-path test lives in its own file

`LessonPlayer.anonymous.test.tsx`, not a case in
`LessonPlayer.recording.test.tsx`. The "no `@supabase/ssr` loaded" claim is
checked by counting runs of the `@/lib/supabase/client` mock factory, and
vitest runs that factory once per file, on first import; the signed-in cases
in the recording file would already have run it. The counter was checked to
be able to fail: the same test with `isSignedIn` set reports 1, not 0.

"No network call" is asserted as "no request other than `/api/events`".
OPS-008's `lesson_start` / `lesson_complete` funnel events fire for every
learner (`lib/funnelSource.ts`, `fireFunnelEvent`) and predate this card;
the test first failed on them, and they are not attempt recording.

## Decision 3 — the OAuth hop itself was not driven

The same-browser check ran on the local stack, signing in at `/login` in the
browser that played the lesson, then opening the lesson path. That is what
`/auth/callback?next=<lesson>` hands back after Google. Google itself can't
be driven from a headless local run: the local stack has no OAuth provider.
ANON-009 already checked on the hosted project that a Google signup returns
to the lesson (#135). The remaining check is the owner's Incognito Google
test, repeated after push.

## Why ANON-004 and ANON-005 did not catch this

Read from their closing comments (#101, #102) and their decision files.
**Confirmed, not a hypothesis:** every check used a store or claim that the
check had seeded, never one the player filled for an anonymous learner.

- ANON-005 (#102) scoped recording to a signed-in learner, by its own
  acceptance ("A signed-in learner's completed lesson writes a
  lesson_attempts row"). Its E2E drove the seeded `play006-signedin` user
  only. 0067 says outright that anonymous recording was left to "a future
  card" ("What would make us revisit this": "If a future card needs the
  local attempt store to ALSO record for an anonymous learner (the
  ANON-004/006 claim flow's own eventual wiring)…").
- ANON-004 (#101) was that card, and wired the migration side only. Its
  mount-flush test ("ANON-004: flushes a pre-existing local attempt on
  mount", `LessonPlayer.recording.test.tsx`) writes the attempt into
  `localStorage` by hand before rendering. Its cross-browser E2E "created a
  `pending_claims` row via the real `/api/pending-claims` route" directly,
  not through the player. `RegistrationOffer.test.tsx` checks the POST and
  the redirect URL, not where the attempts come from. 0068 Decision 6
  describes the flush as covering "a learner who finishes an entire lesson
  anonymously", which nothing at that point made true.

So each half was verified against an input the check supplied itself. The
two halves were never run together from an anonymous answer. The ANON-013
E2E (#137 evidence comment) runs that whole chain.

## Consequence, by the existing design

0048 Decision 1 already uploads "any later login on a browser that still has
local attempts sitting unsynced". Until now that path was dead, so this is
its first live use. On a shared browser, attempts made anonymously go to
whoever signs in next. They are lesson scores only and grant no access
(`record_lesson_attempts` re-checks `can_read_lesson`, 0048). Recorded so it
reads as a choice rather than a surprise; this card doesn't change it.

## What would make us revisit this

- A learner reporting someone else's scores on their account (the shared
  browser consequence above).
- Local attempts across several lessons coming near 0066's 16 KiB
  `pending_claims` payload cap before the offer is seen. That was already a
  revisit trigger in 0068, and it's now reachable: a learner can play every
  free lesson without signing up.
- A future need to show the just-finished result after the signup redirect
  (the lesson re-renders empty). Out of scope for ANON-013 by its own notes.
