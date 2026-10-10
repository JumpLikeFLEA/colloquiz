# 0104 — ANON-011: the sign-in prompt on sign-in lessons

Status: decided unattended (`work on ANON-011 --no-approval`), for review.

## Context

0094 settled what a visitor sees on a `signed_in` lesson: the title,
description and the leading theory up to the first exercise or self-check
(Decision 3, option b), a sign-in prompt, and a link to an open lesson of
the course (Decision 2, option C). 055 shipped `lesson_teaser` and
`course_lesson_states`; CNT-014 (0102) made `getPublicLesson` return
`not_available` with `access: "needs_sign_in" | "needs_entitlement"`.
ANON-016 (0092) made every sign-in path honour `/login?next=`.

Hosted has no `signed_in` lesson (anon probe on 2026-10-10: 9 `anyone`, 1
`entitled` visible), so the screen is verified by render tests here, not live.

## Decision 1 — where the extras are read

`readPublicLesson` (lib/publicLesson.ts), only on `needs_sign_in`, runs three
reads in parallel: `lesson_teaser`, the course's lessons, and
`course_lesson_states`. The teaser rows go through `parseLessonTeaser`
(lib/lessonTeaser.ts), the open lesson through `firstOpenLessonLink`
(lib/coursePageProgress.ts). An open lesson and a paid lesson make no new
round trip. Reading in `readPublicLesson` rather than in the page means
AUTH-009's "Visitor view", which calls it with a session-less anon client,
shows the same teaser and link without code of its own.

## Decision 2 — the teaser renders through a server-only dispatcher

The first version rendered the teaser with `TheoryBlockRenderer`. `npm run
budget` moved the open lesson from 258.6 to 259.1 KB (applied-practice
286.0 → 286.4). Swapping in a dispatcher over the server-safe block views
restored 258.6 / 286.0; adding `VideoBlockView` back alone gave 258.9 /
286.3. Cause, as measured: referencing a `"use client"` component from a
Server Component on the lesson route makes it a new client entry, which
re-splits the route's chunks even though the module is already in
`LessonPageClient`'s graph.

So `TeaserBlock.tsx` dispatches over the player's own heading, prose,
example, callout, list, image and table views (all server-safe; `next/image`
and `next/link` were measured as no change), and renders `video` as
`TeaserVideo`: `VideoBlockView`'s facade markup and classes, as an `<a>` to
`youtube.com/watch?v=<id>` in a new tab instead of a stateful button that
loads the embed in place. Nothing third-party loads until a tap, as with the
player's facade.

Options considered:
- `VideoBlockView` as is: +0.3 KB on every open lesson, against this card's
  acceptance.
- Leave `video` out of the teaser: contradicts 0094 Decision 3's whitelist
  and the handoff's "shows its leading theory"; a `--no-approval` stop.
- Link-out facade (chosen): no client JS, keeps the block, costs a
  behavioural difference on this screen only.

## Decision 3 — an unparseable teaser block shows no teaser

`parseLessonTeaser` re-validates each row with `TheoryBlockSchema` (and
rejects `self_check` even though SQL already cuts before it). A failure
throws; `readPublicLesson` logs it and returns an empty teaser, so the
screen falls back to title + description + prompt, 0094's option (a). The
alternative, throwing to the error boundary, would make a published lesson
unreachable over a preview nicety.

## Decision 4 — copy and layout

- Strings in `signInCopy.ts`, English (lesson chrome, 0080 D5), not in
  `lib/alliengll/copy.ts`: copy.ts ships to every open lesson's client JS
  through `LessonPlayer`.
- One CTA, "Sign in or create an account", to `/login?next=<lesson>`.
  `/login` already offers both modes; ANON-016 returns the learner here.
- The card reuses the paid card's frame and padding (`py-10 sm:py-12`,
  `px-6 py-10`); a first version's `sm:py-8`/`sm:py-10` added 100 bytes of
  new utilities to the shared stylesheet and were dropped. The CTA reuses
  `SUBMIT_BUTTON_CLASS`. Headings in the teaser get `HEADING_WIDTH_CLASS`,
  every other block `READING_WIDTH_CLASS`, inside the reading frame; a
  `table` is therefore capped at reading width here (its own overflow
  scroll still applies) rather than the player's FIT band.
- `needs_entitlement` renders exactly what it did.

## Revisit if

- The partner wants the video playable in place on the sign-in screen: then
  pay the 0.3 KB or find a client entry that doesn't re-split the route.
- Next changes how client entries are chunked (re-measure Decision 2).
- `funnel_events` shows the prompt converting worse than the post-lesson
  offer (0094's own revisit trigger).
