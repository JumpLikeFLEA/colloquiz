# 0044 — SHELL-005: English URL scheme and the public-path rule

## Context

SHELL-005 (issue #90, `type:decision`) had to settle the public English URL
shape before any public route exists to link to — Telegram/reel links point
directly at a course or a lesson (docs/handoff.md), so the shape can't be
retrofitted later without breaking already-shared links. `lessons.slug` is
unique per `(course_id, slug)`, not globally (migration 043), so the route
needs both segments. This card is decision-only per the working agreement
(`type:decision`: lay out options, owner calls it); no code changes ship
from it.

**Owner approval (2026-09-26):** Decisions 1–4 below were drafted during the
CNT-010 session (commit `4f94314`) while auditing that card's dependency on
this one, but issue #90 was never formally closed at the time — no owner
sign-off was recorded. Approved as written, without change, before SHELL-007
proceeds. Recorded here rather than silently treating the earlier draft as
sufficient on its own, since a `type:decision` card is never decided
unattended, even incidentally.

## Decision 1 — URL shape

`/courses/[course-slug]/[lesson-slug]`.

Considered against `/c/[course]/[lesson]` (shorter, reads less clearly out of
context) and a root-level `/[course-slug]` (rejected outright — a bare
top-level segment collides with every other top-level route: `/login`,
`/terms`, any future English top-level page). `/courses` also matches the
existing admin naming (`/app/admin/courses`, docs/decisions/0041), so the
public and internal vocabularies agree.

Bare `/courses` (no course segment) issues a 307 to `/`, rather than
rendering a catalogue-less page or 404ing — `/` is the intended catalogue
entry point once it exists (see Decision 3).

**Revisit when:** a second catalogue-level surface is proposed that would
want `/courses` itself to render something (e.g. a dedicated catalogue page
distinct from `/`) — not expected before SHELL-010.

## Decision 2 — proxy.ts: public-path rule vs. session refresh

Two separate things were being conflated in the issue's acceptance line and
are now decided separately:

- **The unauthenticated `/login` bounce** (proxy.ts's `!user && !isAuthRoute`
  guard) — English course/lesson path prefixes are added to it as an
  exemption, admitted unauthenticated. This is the actual "make it public"
  change.
- **The session-refresh call** (`authUserFrom(supabase)`, which runs before
  any response per the comment at proxy.ts:32-35) — this keeps running
  unconditionally, on English routes exactly as on every other route. It is
  NOT skipped.

Rationale for not skipping the refresh: after SHELL-012, English routes are
where signed-in learners live day to day, not just where anonymous visitors
land. Skipping the refresh there would let a signed-in learner's session
expire (access tokens live ~1h) while they browse, since a Server Component
can't write a refreshed cookie back itself — only proxy.ts's `setAll`
callback can. That would silently break the ANON-005 progress-migration
write path (which needs a live session) for exactly the users who spend the
most time on these routes.

This also means the issue's premise — "skipping it only costs server
latency, no client-JS difference either way" — needed verification before
being repeated as a reason to skip, per CLAUDE.md's citation rule. Traced
into `@supabase/auth-js`, since `authUserFrom` (lib/auth.ts) calls
`supabase.auth.getClaims()`, not `getSession()` directly:

- `getClaims()` with no `jwt` argument calls `this.getSession()` first
  (`node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:5086-5091`).
- `getSession()` → `__loadSession()` reads the session from storage only
  (`getItemAsync(this.storage, this.storageKey)`,
  `GoTrueClient.js:2417-2419`) and returns immediately with
  `{ session: null }` and **no network call** when nothing is found in
  storage (`GoTrueClient.js:2429-2430`).
- `getClaims()` then returns immediately on that null session
  (`GoTrueClient.js:5088-5089`), also with no network call.

So for an anonymous request (no `sb-*` cookie for `@supabase/ssr`'s storage
adapter to find), the existing refresh call already costs zero network
round-trips — it is a storage read, not a request to Supabase Auth. The
"saves a server round-trip" framing in the issue's own acceptance line does
not hold for the anonymous case; it would only have mattered for a
signed-in user hitting an English route, which is precisely the case this
decision keeps the refresh running for.

**Net effect:** the change to proxy.ts (left to the implementing card) is
purely additive — a new set of admitted path prefixes alongside the existing
`publicRoutes` exact-match list — with no change to the refresh call itself.

**Revisit when:** `authUserFrom` or the underlying auth-js version changes
how `getClaims()`/`getSession()` resolve, since the "no network call for an
anonymous request" claim is pinned to the current auth-js internals cited
above, not to any guarantee in its public API.

## Decision 3 — `/` is out of scope for this card

SHELL-005 settles the *course/lesson* path shape only. `/` stays whatever
SHELL-013's temporary redirect currently makes it; SHELL-010 owns replacing
that redirect with the real English landing and is the card that will make
`/` itself public. Recorded here only so a future reader doesn't expect this
decision to have touched proxy.ts's root-redirect entry.

## Decision 4 — slug generation is not ordinal-derived (no new card needed)

The issue asked this card to check whether lesson/course slugs are generated
from position (the exact failure mode `docs/handoff.md` calls out under
"Ordinal-derived free samples," generalized to slugs) and, if so, propose a
card fixing it before slugs become shared URLs.

Checked against `create_lesson` (migration 044, lines 224-249) and
`lib/lessonSlug.ts`: the slug is generated from the lesson's **title** at
creation time (`slugify` + a within-course collision suffix, `-2`, `-3`, …),
never from `ordinal`. `update_lesson` (044, comment at lines 258-261)
explicitly excludes `slug` from its parameters — "immutable once created
(0023), no RPC path may change it" — so a later title edit does not
regenerate it either. `courses.slug` (`create_course`, 044 lines 398-425) is
author-supplied at creation, validated and checked for uniqueness, with no
RPC path to change it afterward. Both already satisfy "keyed off something
that doesn't move" (043's own comment makes the same point about why slug,
not ordinal, is the URL key). **No new card proposed.**

## What this card does not decide

The actual proxy.ts prefix-rule implementation, and updating any redirect
target list to the new path shape — left to the implementing card(s)
(SHELL-005's own remaining acceptance lines, and SHELL-012's redirect-target
review at `scripts/board/backlog.mjs:1305`, which explicitly reviews against
"the SHELL-005/SHELL-007 English paths").

## Addendum (2026-09-26) — Cyrillic titles break the slug, checked before `work on next`

Two follow-up questions were asked before moving to the next card, since
Decision 4 above only checked that slugs are title-derived, not that
title-derivation actually works for this audience's titles. Both findings
are real problems; per instruction, a card is proposed rather than fixed
inline.

**(1) Slug for a Cyrillic-only title.** Ran `slugifyLessonTitle` (its actual
body — the regex it applies is identical in shape to `create_lesson`'s SQL
step, migration 044 line 229) directly in Node:

```
node -e '
function slugifyLessonTitle(title) {
  const base = title.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base === "" ? "lesson" : base;
}
console.log(JSON.stringify(slugifyLessonTitle("Прошедшее время: вопросы")));
console.log(JSON.stringify(slugifyLessonTitle("Прошедшее время 2: вопросы")));
'
"lesson"
"2"
```

`slugifyLessonTitle("Прошедшее время: вопросы")` → `"lesson"` (the whole
title collapses to dashes, trimmed to empty, falls back to the literal
placeholder). `slugifyLessonTitle("Прошедшее время 2: вопросы")` → `"2"` —
whatever ASCII digit happens to be embedded survives as the entire slug.

Both `lib/lessonSlug.ts`'s regex (`[^a-z0-9]+`) and `create_lesson`'s SQL
regex (`[^a-zA-Z0-9]+`, migration 044 line 229) are ASCII-only, so this is
not just a client-preview quirk — the authoritative RPC has the identical
gap. Per `docs/handoff.md` ("Russian is for course content... the whole
learner-facing chrome... is Russian," and the partner's material is
Russian-sourced), lesson titles for this audience are expected to be
Cyrillic as the norm, not the exception. In practice every lesson in a
course would generate the RPC's fallback base slug `"lesson"`, deduped only
by `create_lesson`'s `WHILE EXISTS` suffix loop (044 lines 235-238) into
`lesson`, `lesson-2`, `lesson-3`, … in creation order. That is functionally
the same failure mode `docs/handoff.md` names for ordinal-derived free
samples — a URL segment that encodes creation order rather than content —
just reached through slug collision-suffixing instead of `ordinal` directly.
Decision 4 above is narrower than it should be: it correctly found slug
generation doesn't *read* `ordinal`, but didn't check whether the base slug
it computes is actually meaningful, which for a Cyrillic title it is not.

**(2) Placeholder title outliving a rename.** Checked the two authoring UI
paths (`app/(main)/app/admin/courses/[id]/CourseDetailView.tsx`):

- The **create** dialog (lines 346-382) does warn explicitly — "The lesson's
  slug is generated from its title and can't change later" — and starts
  `newTitle` at `""` with the Create button disabled while
  `!newTitle.trim()` (line 382), so there's no pre-filled placeholder
  default. But nothing stops an author from typing a rough working title
  ("Lesson 1", "draft", "новый урок") to get started and refining it later —
  the warning is advisory, not a gate.
  - "новый урок" (Cyrillic) would hit the same `"lesson"` fallback as (1).
  - "Lesson 1" (ASCII) would slugify to `"lesson-1"` and freeze there.
- The **edit** dialog (`EditLessonDialog`, lines ~433-499) lets the title be
  changed freely (`PATCH .../lessons/{id}`, via `update_lesson`, which
  excludes `slug` from its parameters by design, 044 lines 258-261) with
  **no display of the current slug anywhere in the dialog** and no repeat of
  the create dialog's warning. An author who renames a lesson here has no
  way to notice, from this screen, that the URL segment did not follow.

Both are confirmed problems, not run inline against them (no fix applied to
`lib/lessonSlug.ts`, migration 044, or the two dialogs).

**Proposed card:** *CNT-006 — Transliterate lesson/course slugs; show and
allow editing the slug until first publish.*

- Acceptance (draft, for triage to refine):
  - [ ] `create_lesson`'s and `lib/lessonSlug.ts`'s base-slug step handles
    non-Latin titles by transliteration (Cyrillic → Latin) rather than
    stripping to nothing, so a Russian title produces a distinct,
    recognizable slug instead of the `lesson`/`lesson-2`/… fallback ladder.
    (`courses.slug`/`create_course` has the same ASCII-only gap and is
    author-supplied today, not generated from a Russian title, but should be
    covered by the same fix if course titles are ever Russian too.)
  - [ ] `EditLessonDialog` displays the lesson's current slug (read-only)
    so a rename's mismatch with the URL is visible, not silent.
  - [ ] The slug is editable (subject to the existing per-course uniqueness
    check) up until the lesson's first publish, after which it freezes —
    matching the "author intent frozen into data" pattern already used for
    `in_free_sample`, so a rough working title doesn't permanently determine
    a lesson's public URL, while a URL that has already been shared (post-
    publish) still never moves.
  - [ ] `courses.slug`'s existing author-supplied, `slug_taken`-checked path
    (`create_course`) is left as-is unless the transliteration fix above is
    extended to it.

This card is not filed as a GitHub issue yet — recorded here per "propose a
card," pending confirmation of the epic prefix and priority.
