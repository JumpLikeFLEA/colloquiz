# 0080 — One EN/RU toggle for the landing and course pages; English lesson chrome

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

## Decision 5 — lesson chrome is fixed English, with no toggle

The same request's second line: "Buttons text inside the lessons is always
EN - no RU option there". In the code every lesson button was Russian
(SHELL-011, a02dc32), so the line could be read three ways. The owner was
asked and chose "all lesson chrome in English": every interface string on
the lesson page is English and there is no toggle. That reverses the
2026-09-24 Russian-chrome rule (docs/handoff.md) for the lesson page; the
owner confirmed reversals are fine.

The two other readings were rejected by that answer:

- **"Only buttons English"** would mix the languages on every lesson page
  ("Задание 1 из 5" above a "Check" button).
- **"Lessons follow the toggle"** needs every player string in both
  languages. The player is client-side, so both would ship to lesson routes
  that are already near or over their 260/290 KB budgets.

What changed:

- `lib/alliengll/copy.ts`: `player`, `theory`, `completion`, `signupOffer`
  and `notAvailable` are now English, still one fixed language and no
  switch. Where SHELL-011 had replaced an English label with Russian, the
  earlier wording is reused ("Return to pool", "Hold and drag the handle to
  reorder.", "Gap N:"…). "Проверить" became "Check" rather than the old
  "Submit", because "Check" matches what the button does now. The consent
  line reuses the Colloquiz sign-up form's existing wording ("I am 13 or
  over and agree to the Terms of Service and Privacy Policy"), not new
  legal copy. All new English copy is pending owner/partner review.
- The lesson band's size line and the completion countdown pluralise with
  `en` rules. The countdown reads "3 exercises left", a suffix where the
  Russian had a prefix. Points format with `en-US` ("1.5 of 2").
- `footerLangForPath` returns `"en"` on a lesson page, so the footer
  matches.
- The admin lesson preview and the lesson-player demo render the same
  player, so they are English too. That is by design: the preview is the
  learner's view.

Not changed:

- **Authored content.** Theory, explanations and exercise text render as
  the partner wrote them, in whichever language she wrote them.
- **The 404 and error pages.** These stay Russian. A bad lesson slug
  therefore shows a Russian 404 under an English footer. Known minor
  mismatch, out of scope.
- **`<html lang="ru">`.** The English layout sets this for every route,
  and it is now wrong for lesson pages and for EN course/landing pages.
  Proposed as its own card rather than absorbed here.

Verified in a browser (scratchpad `lesson-check.mjs`, `next start`,
390px, with saved choice `ru` and `en`):

- **Soft navigation from the course page, and a direct load:** no Cyrillic
  anywhere on the lesson page and no toggle. The footer is English, and the
  countdown reads "5 exercises left".
- **Back to the course:** the course page is still in the saved language,
  footer included.

The `toggle-check.mjs` run from Decision 2 passed again on the same build.

Budget after this step (same temporary routes as above):

| route | after step A | after this step |
|---|---|---|
| `/` (budget 180) | 178.0 | 178.0 |
| `/courses/auth003-smoke-test` (budget 182) | 171.7 | 171.7 |
| `/courses/auth003-smoke-test/9` | 264.3 | 263.9 |
| `/courses/auth003-smoke-test/one-of-each-item-type` | 293.0 | 292.6 |

## What would make us revisit it

- Analytics showing course-page visitors from Telegram leaving on English
  chrome: change the default for course pages, or default by referrer.
- The toggle spreading to a third kind of page: at that point the per-page
  `{ ru, en }` modules are an i18n layer in all but name, and that is a
  decision in its own right (docs/handoff.md, "Audience and language").
