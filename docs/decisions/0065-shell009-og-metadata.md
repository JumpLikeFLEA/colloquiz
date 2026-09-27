# 0065 — SHELL-009: per-page OG metadata for Telegram

## Context

Telegram renders a rich link preview for a shared URL (settled input, issue
#103). The course and lesson pages under `app/(english)/courses/**` had no
OG metadata of their own — a share fell back to the app-root
`app/opengraph-image.tsx` and the `(english)` layout's generic title/
description (`alliengllCopy.landing.heroTitle`/`heroSubtitle`), so every
shared link looked identical regardless of which course or lesson it pointed
to.

`docs/decisions/0046`'s "opengraph-image.tsx / icon files" note had already
confirmed this file convention is per-route-segment (Next docs,
`opengraph-image.md:6-34`), so no root-layout constraint blocks a
course/lesson-scoped image.

## Decision

1. **`generateMetadata`** added to both `page.tsx` files
   (`app/(english)/courses/[courseSlug]/page.tsx`,
   `.../[courseSlug]/[lessonSlug]/page.tsx`), returning the real
   title/description from `getPublicCourse`/`getPublicLesson`. Next's
   Metadata API derives `og:title`/`og:description` from these when no
   explicit `openGraph` object overrides them (documented framework
   behaviour, not re-derived here).
2. **`opengraph-image.tsx`** added to both segments, generating a branded
   1200×630 card (`ImageResponse`/Satori) from the same course/lesson data:
   CEFR level badge, title, truncated description, and the course cover
   image composited under a bottom gradient when one exists. A course with
   no cover falls back to the brand gradient (`BRAND`/`BRAND_ACCENT`,
   `lib/site.ts` — no new hex literals; the card component itself needed 2
   literal `#000000`/`#ffffff`, added to the hex-literal baseline on the
   same precedent as `app/opengraph-image.tsx`'s existing 2).
3. Both `opengraph-image.tsx` files fall back to the generic Colloquiz
   brand copy (`alliengllCopy.landing.heroTitle`/`heroSubtitle`) when the
   course/lesson doesn't resolve, rather than erroring — a stale or
   mistyped share link still gets a real (if generic) card; the page itself
   still 404s independently.
4. Preview metadata is visible for every lesson regardless of entitlement
   (`docs/handoff.md`, "Preview, precisely") — the lesson `opengraph-image`
   and `generateMetadata` both use the lesson's title/description even in
   the `not_available` (paid, not bought) state. Only lesson *content* is
   gated; that gate is unchanged and lives on the page itself.
5. `getPublicCourse` (`lib/coursePage.ts`) and `getPublicLesson`
   (`lib/publicLesson.ts`) were wrapped in React's `cache()` — precedent:
   `lib/leaderboard.ts`, `lib/supabase/queries.ts` — so `generateMetadata`
   and the page component's identical call for the same slug(s) within one
   request dedupe to a single Supabase read, per Next's own documented
   "Memoizing data requests" pattern for this exact generateMetadata + page
   shape. `opengraph-image.tsx` is a separate HTTP request (fetched
   independently by the crawler/browser), so this dedup doesn't reach it —
   accepted, not worth a cross-request cache for two cheap RLS-scoped reads.
6. A shared, non-route-file component (`app/(english)/courses/ogImageCard.tsx`,
   deliberately not named `opengraph-image.*`/`page.*`/`layout.*` so Next
   attaches no file convention to it) holds the card's JSX so the two
   `opengraph-image.tsx` files can't drift apart.

## Verification

The hosted (cloud) project has no published course — both seeded courses
(`future-imperfect`, `auth003-smoke-test`) are `status: 'draft'` (confirmed
via a direct anon-key `select` returning `[]` and a service-role `select`
showing both as `draft`), so the real render path could not be exercised
against production data, and writing to the hosted project to publish one
is exactly what the working agreement forbids doing unattended. Verified
instead against a local `supabase start` stack (`db reset`, replaying all
48 migrations) seeded via the existing `scripts/seed-local-fixtures.ts`
(PLAY-006/SHELL-008 precedent), plus a real 1×1 PNG uploaded to the local
`lesson-images` bucket as the course cover so the `<img src>` compositing
path is exercised against a real fetch, not a guess:

- `og:title`/`og:description` on `/courses/future-imperfect`: "Future
  Imperfect · Colloquiz" / the real course description — not the generic
  layout fallback that was rendering before this card.
- `/courses/play-006-smoke/free-lesson` (free) and `.../paid-lesson`
  (`not_available`, paid/not-entitled): both render their own real
  title/description in `og:title`/`og:description` — confirms Decision 4
  (preview metadata unaffected by entitlement).
- Both `opengraph-image` routes return `200`, `image/png`, and a real
  1200×630 PNG (`file` confirms non-interlaced RGBA) — course-level image
  shows the level badge, title, truncated description and the composited
  cover; lesson-level image shows the lesson's own title/description with
  the parent course's level badge.
- The "no cover" gradient-fallback branch could not be exercised against a
  *published* course: migration 047's
  `courses_published_requires_catalogue_fields` CHECK constraint (confirmed
  by attempting to null `cover_image_url` on a published course locally —
  rejected with that exact constraint name) means a published course always
  has a cover. The branch is retained as defensive code matching
  `app/opengraph-image.tsx`'s existing pattern, not because it's reachable
  today.
- A not-found course slug (`/courses/bogus-course-slug`) 404s at the page
  level with no `og:*` tags emitted at all — Next does not surface OG tags
  from a segment whose page called `notFound()`, so the `opengraph-image.tsx`
  fallback branch for an unresolved slug is unreachable via normal
  head-tag discovery (only reachable by a crawler re-requesting a stale,
  directly-guessed image URL) and needed no further testing.
- `npm run check` and `npm test` (524/524) both pass on the final tree.

**Not verified, and cannot be from this environment:** acceptance line 2
("a real Telegram post of each URL type shows a rich preview, screenshot
attached") requires a publicly reachable URL (production or a preview
deployment) and an actual Telegram client — neither is available in this
session, and publishing to get one is exactly the "never push" /
"never touch the live Supabase project or Vercel production deployment"
boundary. This needs a human to post a real `colloquiz.app/courses/...` (or
preview) link in Telegram once the course is actually published, and attach
the screenshot.

## robots.txt (acceptance line 3)

`app/robots.ts` emits a blanket `User-agent: * / Disallow: /` with no
per-agent exemption (confirmed: `curl localhost:3000/robots.txt` against
this branch, unchanged by this card). Per Telegram's own documented crawler
behaviour (TelegramBot — Telegram's link-preview fetcher — is reported by
multiple independent sources, e.g. `darkvisitors.com/agents/telegrambot`
and `chrisleverseo.com/user-agents/telegrambot`, to respect `robots.txt`
directives, unlike Facebook's/Twitter's fetchers which are commonly
documented as ignoring it), **this blanket disallow blocks Telegram's own
preview fetcher from every route, including `/courses/**`** — not just
search engines. This is evidence, not a guess, but it is third-party
documentation of Telegram's crawler behaviour, not a first-party Telegram
statement or an observed 403/empty-preview against a real deployment (which
would need the same public-URL access acceptance line 2 is missing).

Smallest fix (proposed as a separate card, not made here): add

```
User-agent: TelegramBot
Disallow:
```

as an additional rule block in `app/robots.ts`, alongside the existing
`User-agent: * / Disallow: /` — this is the documented syntax for
exempting one named agent from a blanket disallow while leaving the
1.0 "public but unlisted, not indexed" decision (DoR) intact for every
other crawler, including real search engines.

## What would make us revisit it

- If Next changes how `generateMetadata` and `opengraph-image.tsx` are
  deduped/cached relative to each other, re-check whether `cache()` still
  earns its keep.
- If migration 047's catalogue-fields CHECK is ever relaxed to allow a
  published course with no cover, the gradient-fallback branch becomes
  reachable in production and deserves an actual test against one.
- Once a course is actually published on the hosted project (OPS-010) and a
  preview/production URL is reachable, acceptance line 2's real Telegram
  screenshot becomes possible and should be captured then.
