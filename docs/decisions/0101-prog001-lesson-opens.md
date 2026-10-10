# 0101 — PROG-001: per-learner lesson opens

Status: **decided unattended** (PROG-001 ran `--no-approval`).

## Context

AUTH-011's learners page needs to know which lessons each signed-in learner
opened, and when. PROG-001 records that in `lesson_opens` (migration 056).
The privacy policy (1.2, OPS-022) already describes it: "which lessons you
opened while signed in, and when", exported, and deleted outright with the
account (privacy-policy.md:76, :251, :277).

## Decision 1 — record on mount, not in the server render

The card's hypothesis: a write during the lesson page's server render could
be triggered by a `<Link>` prefetch from the course page, recording a lesson
the learner never opened.

Options:

- (a) Record in `page.tsx`'s render and prove a prefetch doesn't reach it.
  The proof would depend on Next 16's prefetch behaviour for dynamic routes,
  which can change (`prefetch` modes, segment prefetching) without this code
  changing.
- (b) Record from the player's mount, in the same effect that already fires
  `lesson_start` (`LessonPlayer.tsx`). A prefetch renders on the server and
  never mounts a client component, so the hypothesis does not apply.

Chosen: (b). The page's server code is unchanged by this card. Signed-in
only (`isSignedIn && lessonVersionId`). The Supabase client and
`lib/lessonPlayer/lessonOpen.ts` are dynamically imported inside that branch,
so an anonymous visitor downloads neither (asserted by
`LessonPlayer.anonymous.test.tsx`, which counts the client mock's loads).

Consequence: `last_opened_at` moves on every mount, including a reload or a
`router.refresh()` that remounts the player with a fresh `attemptId`. That is
an open in every sense the learners page cares about.

## Decision 2 — keyed by lesson, resolved and gated in SQL

The player knows the lesson VERSION; the card asks for (user, lesson). The
RPC takes `p_lesson_version_id`, resolves the lesson itself and records it
only if `can_read_lesson()` is true. So a direct PostgREST caller can't
record a lesson they couldn't open, and a republished lesson (new version)
keeps one row per learner. Refusals are returned (`not_readable`,
`unauthenticated`), not raised: the player ignores them.

## Decision 3 — owner read only; the author's read is AUTH-011's

056 grants the learner SELECT on their own rows (the export reads them with
the learner's session, the `lesson_attempts` precedent). It does not decide
how a course author reads other learners' rows: that is AUTH-011's design
(an RPC over `can_edit_course`, most likely), and the `lesson_id` index is
there for it.

## Decision 4 — export section, format version 4

`lesson_opens` is a new top-level section with the lesson and course slug
and title embedded (null once the lesson isn't readable), so the file reads
without a catalogue. Adding a section a reader would notice bumps
`EXPORT_FORMAT_VERSION` 3 → 4, as ANON-009 did for `signup_acquisition`.

## Budget

`npm run budget`, before → after: the free lesson
`/courses/future-imperfect/true-or-false` 258.6 → 258.6 KB;
`/courses/future-imperfect/applied-practice` 285.9 → 286.0 KB; `/`,
the course page and `/login` unchanged. Both lessons load the same
`LessonPlayer` chunk, so the real increase is the same on both and lies
between 0 and 0.1 KB: the signed-in-only call site and its dynamic import.
Accepted: the alternative is a server-side write, which Decision 1 rejects.

## Observation (unexplained, not relied on)

In vitest, `recordSignedInOpen` first imported `@/lib/supabase/client` and
then `@/lib/lessonPlayer/lessonOpen`; the `vi.mock` of the client was not
applied and the real `createBrowserClient` ran. With the order swapped
(lessonOpen first) the mock applies. Cause not established. Production
bundling is unaffected either way; the order is kept because the tests need
it.

## Revisit if

- AUTH-011 needs a read shape the owner-read policy can't serve (expected:
  it adds its own author read).
- The learners page needs "opened" to mean something narrower than a
  player mount (e.g. exclude reloads).
