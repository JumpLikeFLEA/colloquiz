# 0080 — One EN/RU toggle for the landing and course pages

## Context

Ad-hoc owner request (2026-10-07): "Landing page and mini-courses preview
pages share EN/RU toggle + store the state from the previous page (landing
EN -> preview EN also, same with RU, page refresh doesn't reset the
language)."

Before this, the toggle existed only on `/` (docs/handoff.md, "Audience and
language", 2026-09-28 landing exception, which said "do not extend the
toggle past the landing page without asking again"; this request is that
ask). The course page was Russian-only, from `lib/alliengll/copy.ts`.

"Mini-courses preview pages" was read as the course pages
(`/courses/[courseSlug]`), the page a catalogue card opens into. The plan
stated that reading and the owner approved it.

## Decision 1 — one saved choice, read on the server

The choice lives in the cookie the landing already used
(`colloquiz_landing_lang`, now `SURFACE_LANG_COOKIE` in
`lib/alliengll/surfaceLang.ts`). The name keeps "landing" on purpose:
renaming it would reset every visitor's saved choice. `parseSurfaceLang`
accepts only `ru`/`en` and falls back to EN for anything else, the
2026-09-28 default for a first-time visitor.

Both pages read the cookie in their Server Component, so the first
response is already in the right language. The landing's existing
reasoning for a cookie over localStorage (no flash, no setState-in-effect)
applies unchanged.

**Default unchanged:** a visitor who arrives straight on a course page
(a Telegram link, docs/handoff.md) with no cookie sees English. The plan
flagged this; the owner did not ask to change it.

## Decision 2 — the toggle saves through a Server Action

`LanguageToggle` (shared by `LandingHeader` and the course page's
`BandTopBar`) calls `setSurfaceLang`, a Server Action that sets the cookie.
Setting a cookie in a Server Action makes Next re-render the current page
and its layouts in the same round trip
(`node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`,
"Cookies"). Both the course page's server-rendered strings and the root
layout's footer depend on that. A `document.cookie` write, which is what
the landing did before, would have left them in the old language until the
next full load.

Options considered:

- **Keep `document.cookie` and call `router.refresh()`.** That works for the
  current route, but `router.refresh()` "clears the Client Cache for the
  current route" only (`.../04-functions/use-router.md`), so browser Back
  could restore another page in the old language.
- **Render the course page's strings client-side from a shared store.**
  Rejected: it ships both languages' strings to the course page's client
  bundle, and the 0079 budget work existed to keep copy out of it.

The landing still switches its own strings instantly from local state.
`useOptimistic` moves the pressed button at once on the course page while
the re-render is in flight.

**Back/Forward, measured rather than assumed:** a Playwright run against
`next start` (scratchpad `toggle-check.mjs`, 12 checks, all passed) toggled
EN on the course page and then went Back to a landing that had been
rendered in RU. The landing came back in EN. Right after the Back, the URL
had changed while the course page's DOM was still showing. The landing
rendered in EN about 300 ms later. That delay is consistent with a refetch
rather than a client-cache restore, but it was not traced at the network
level; the observed result, not the mechanism, is what this records.

## Decision 3 — course-page strings live beside the page, in both languages

`app/(english)/courses/[courseSlug]/courseCopy.ts` holds `{ ru, en }`. The
Russian strings are 0079's, moved verbatim out of `lib/alliengll/copy.ts`;
the English ones are new and pending owner/partner review. This follows
`landingCopy.ts`: per-page bilingual copy, not an i18n layer.

Only Server Components import it, so neither language reaches the client.
Only chrome changes language: course title, descriptions and lesson titles
are authored content and render as written.

## Decision 4 — the footer follows the route, decided in one pure function

`footerLangForPath` (`lib/alliengll/surfaceLang.ts`, unit-tested) maps a
path to a footer language: none on `/` (the landing renders its own, so it
follows the client-side toggle without a round trip), the saved choice on a
course page, Russian anywhere else.

The root layout reads the cookie and renders BOTH footer variants on the
server. `EnglishFooterGate` (client, `usePathname`) picks one. The layout
persists across client-side navigation, so only the pathname can tell it
which route it is on now. Reading cookies in the layout makes no route
newly dynamic: in the build log every route under it was already `ƒ`
(`/`, `/courses/[courseSlug]`, `/courses/[courseSlug]/[lessonSlug]`).

`LandingFooter` was deleted. It differed from `EnglishFooter` only in where
its two translated strings came from. Both now read `footerCopy.ts`, and
`LandingContent` renders `EnglishFooter lang={lang}`. `footerCopy.ts` is
its own module because the landing renders the footer inside its Client
Component, and copy.ts must stay out of `/`'s bundle (0079, "Budget").

A missing course (`/courses/<bad-slug>`) matches the course-page pattern,
so its footer follows the saved choice under the Russian 404 text. That is
a known minor mismatch; the 404 page itself was out of scope.

## Budget

`npm run budget` with a temporary, uncommitted ROUTES edit pointing at the
published `auth003-smoke-test` course (the committed `future-imperfect`
routes 404 on hosted, see 0079), against `next start` of this change:

| route | before (23e50d1) | after |
|---|---|---|
| `/login` | 284.1 | 284.1 |
| `/` (budget 180) | 177.7 | 178.0 |
| `/courses/auth003-smoke-test` (budget 182) | 171.1 | 171.7 |
| `/courses/auth003-smoke-test/9` | 264.6 | 264.3 |
| `/courses/auth003-smoke-test/one-of-each-item-type` | 293.3 | 293.0 |

The two lesson routes were already above the 260/290 targets, which belong
to other lessons (0079).

## What would make us revisit it

- Analytics showing course-page visitors from Telegram leaving on English
  chrome: change the default for course pages, or default by referrer.
- The toggle spreading to a third kind of page: at that point the per-page
  `{ ru, en }` modules are an i18n layer in all but name, and that is a
  decision in its own right (docs/handoff.md, "Audience and language").
