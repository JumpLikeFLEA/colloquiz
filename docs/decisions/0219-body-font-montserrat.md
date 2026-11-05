# 0219 — Body font: Montserrat on the English surface and in Studio

Status: decided by the owner on 2026-11-05 (Montserrat, every language, body text only), the
loading details in the session that built it. Ad hoc, not a board card. No migration.

## Context

The author asked for Century Gothic on the course-editing side (Studio) and on the learners' side
(the English surface). Findings, before any code:

- Century Gothic is a Monotype typeface. Microsoft's copy lists code page 1251 Cyrillic, ships
  "exclusively included with Microsoft products and services" and in Office, and points web
  developers to a licence on fonts.com
  (https://learn.microsoft.com/en-us/typography/font-list/century-gothic, read 2026-11-05).
  Monotype sells Cyrillic-capable families (Century Gothic Paneuropean) with web licences.
- Apple does not install it with macOS or iOS, and Android has no copy (user reports on Apple's
  and Adobe's forums; no official Apple or Google statement was found). Most learners arrive on a
  phone from Instagram (docs/handoff.md), so a CSS stack naming "Century Gothic" would show it
  mostly to Windows users, the author included, and Studio's preview would stop matching a
  phone.

Options put to the owner: a licensed web font; "Century Gothic" where installed with a fallback;
a free look-alike; and, at the owner's question, a different face for Latin and for Cyrillic
(possible through the font stack or `unicode-range`, but a Russian sentence with English words in
it would show both faces side by side). The owner chose none of them: **Montserrat for every
language**, replacing the body text only.

## Decisions

1. **Montserrat replaces Geist as the body face** of the English surface, Studio, the global 404
   and the English sign-in screen. It comes from `next/font/google`, as a variable font (one file
   per subset for every weight the app uses), with Cyrillic. No dependency is added, no file is
   committed, and nothing is bought.
2. **Body text only.** Unbounded 800 (headlines) and Caveat 600 (accents) stay, as 0162 chose
   them. So does Geist Mono in Studio, for the slugs. Colloquiz (`/app`) keeps Geist.
3. **Wiring through the existing token.** `--font-sans` is now `var(--font-montserrat,
   var(--font-geist-sans))` (`app/globals.css`), and `--font-display`/`--font-accent` fall back
   to the same. A root layout that puts `bodyFont.variable` on `<html>` gets Montserrat; one that
   doesn't (Colloquiz) gets Geist. No component class changed. The English sign-in screen renders
   under the Colloquiz root, so its English-entry wrapper, the one that already takes
   `surface-alina` (0169), adds `bodyFont.variable font-sans` (`AuthScreen.tsx`).
4. **One definition, `app/bodyFont.ts`, imported everywhere it is used.** A second definition
   with `preload: false` for the sign-in screen was built and measured: it emitted the same font
   under different URLs (`…-s.p.0fzkl03jw-sdz.woff2` and `…-s.0fzkl03jw-sdz.woff2`), so a learner
   going from a lesson to the sign-in screen would have downloaded both files again.
5. **Preload Latin only** (the rule 0021 set for Geist). The Cyrillic `@font-face` ships either
   way and loads when Cyrillic text renders: measured `loaded` on the RU landing and `unloaded`
   on the EN landing.
6. **Geist is `preload: false` in the Colloquiz root layout.** next/font's preloads follow the
   CSS chunks a route loads, and Next's default `cssChunking` merges small CSS modules across root
   layouts without checking which routes use them (`css-chunking-plugin.js`, the loose-mode branch
   of the merge loop). With Geist still preloaded, every English route preloaded Geist's Latin file
   (29,288 bytes), which nothing on it uses. Switching `cssChunking` to `'strict'` would change CSS
   loading app-wide, so it was not done. Colloquiz now loads Geist through its `@font-face` on first
   paint, with next/font's size-adjusted fallback in the meantime.
7. **Not changed:**
   - share images (Satori, `sans-serif`);
   - the Colloquiz lesson-player demo at `/app/admin`;
   - two pre-existing layout faults that the wider face makes slightly worse (see "Measured").

## Preloads

From `.next/server/next-font-manifest.json`, grouped by route group. HEAD was built from a stash
of this change; "after" is this change.

| Route group | HEAD | After |
|---|---|---|
| English (11 routes) | Geist latin, Unbounded latin + cyrillic | Montserrat latin, Unbounded latin + cyrillic |
| Studio (28) | Geist latin, Unbounded latin + cyrillic | Montserrat latin |
| Colloquiz (35) | Geist latin, Unbounded latin + cyrillic | Montserrat latin |
| Global 404 (1) | Geist latin | Montserrat latin |

woff2 bytes from the build: Montserrat latin 35,508, cyrillic 21,492; Geist latin 29,288,
cyrillic 14,900; Unbounded latin 21,708, cyrillic 13,108. So an English route preloads 70,324 bytes
of fonts (64,104 at HEAD). Studio and Colloquiz routes preload 35,508 (64,104 at HEAD, Unbounded
having reached them through the same chunk merge). On Colloquiz that file is used only by the
English sign-in screen.

## Measured

All on the local stack, Edge headless, a throwaway admin added for the admin pages and deleted
afterwards (0 users, 0 profiles left).

- **`npm run budget`** before and after: identical script bytes on every route except `/login`,
  286.9 → 287.1 KB (limit 380), from the font object the sign-in screen now imports.
  `/runs/c0050000-…-f1a1` reads 180.8 KB of 179, over budget both before and after (as in 0218).
- **Width:** 56 route × state rows measured at 360px and at 1280px, before (`next dev`, HEAD) and
  after (`next start`, this change). The rows cover:
  - the English surface signed out (EN, RU, dark): landing, course pages, lessons with matching,
    sort, ordering, True/False and selection items, the paid and sign-in states, `/completed`,
    `/invite`, `/join` and `/runs`;
  - the English surface as a signed-in learner (EN and RU): `/my`, `/my/settings`,
    `/my/messages`, a thread, `/runs`, a cohort lesson;
  - `/login` and `/signup` with `next=/`, plain `/login`, and the global 404;
  - Studio as a seated teacher: inbox, courses, the course editor, the lesson editor, preview,
    runs, stats, reviews, voice, learners, a learner, groups, homework, results, calendar,
    messages, guide;
  - Studio as an admin: authors, catalogue, costs; and `/app`.

  Results:
  - After, 360px: `scrollWidth/innerWidth` 360/360 on all 56 (55 × 200 and the intended 404);
    1280/1280 on all 56 at 1280px.
  - The one inner scroller that overflows, the lesson editor's `main`, went 476 → 495/360. It is
    pre-existing (the AUTH-020 entry), from the header's buttons. Every other inner scroller is
    unchanged.
  - The `--expect` text failed once, on plain `/login` at 1280, before and after alike: the
    desktop panel doesn't carry the word checked for.
- **Computed families:**
  - Montserrat on `<body>` on every English and Studio row;
  - Montserrat on the heading and buttons inside the English sign-in wrapper;
  - Geist on plain `/login` and `/app`;
  - Unbounded on `font-display` and Caveat on `font-accent`.
- **Screenshots, HEAD beside after, 360px:** the RU landing, `/my/settings` and the Studio course
  editor. The visible wraps (the RU "Все курсы" link below the CTA, "Email & password" on two lines,
  Duplicate under Stats) are the same at HEAD; the wider face re-breaks lines inside paragraphs
  only.
- **Pre-existing, not fixed here:** on `/my/settings` a connected method's "Connected · <email>"
  is an `inline-flex` span inside a `truncate` paragraph that ends at x 180, so the email is clipped
  with no ellipsis, as it was with Geist; it now runs to x 365 (EN) and 379 (RU) before the clip.
- **Not measured:** a lesson with gaps (`slots`; no local lesson has one), dialogs and other states
  behind a click, a real phone, Safari, LCP, and the size of the first-paint swap on Colloquiz now
  that Geist is not preloaded.

## Revisit when

- The owner licenses Century Gothic for the web: swap `app/bodyFont.ts` for `next/font/local`.
  The rest of the wiring stays.
- Learners or the author report text wrapping or crowding in a specific place: fix it there, not
  by changing the face.
- Field data (Speed Insights) shows a worse LCP on the English surface.
- A Next upgrade changes CSS chunking: re-read the font manifest. A preload set by a layout can
  appear on routes that never use the font (Decision 6).
