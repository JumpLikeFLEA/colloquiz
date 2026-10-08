# 0091 — `<html lang>` follows the interface language (SHELL-018)

## Context

`app/(english)/layout.tsx` hardcoded `<html lang="ru">`. Since 0080 the
chrome language varies by page: `/` and the course page follow the saved
EN/RU choice, lesson pages are English, and the 404 and error pages are
Russian. Reproduced on `6dd229f` with the real-browser script below: an
English lesson page reached by client-side navigation reported
`document.documentElement.lang === "ru"`.

Two constraints shape the fix:

- A root layout gets no pathname, and it persists across client-side
  navigation (it re-renders on a full load or a Server Action only), the
  reason `EnglishFooterGate` reads `usePathname()` (0080 Decision 4).
- The 404 and the error boundary render on the URL that failed, so the path
  can't tell `/courses/x/no-such-lesson` (Russian 404) from a real lesson
  (English).

## Decisions

1. **One pure rule.** `pageLangForPath(pathname, savedLang)` in
   `lib/alliengll/surfaceLang.ts`: `/` and `/courses/<c>` → saved choice,
   `/courses/<c>/<l>` → `en`, anything else → `BOUNDARY_LANG` (`ru`).
   `footerLangForPath` is now that rule plus "null on `/`", so the footer and
   the page marker can't disagree (a test pins it).

2. **Server value from a proxy header.** `proxy.ts` sets
   `x-colloquiz-pathname` (`lib/requestPath.ts`) on the forwarded request;
   the layout renders `<html lang={pageLangForPath(header, savedLang)}>`.
   The proxy always overwrites the header (checked: a request sent with
   `x-colloquiz-pathname: /spoofed` still got the right value per route), and
   the rule can only return `ru`/`en` anyway. The layout already read
   `cookies()`, so reading `headers()` changes nothing about rendering.
   Rejected: a client-only fix. The first HTML a translator or screen
   reader sees would still say `ru` on an English lesson.

3. **Client sync for soft navigation.** `HtmlLangSync`
   (`app/(english)/HtmlLang.tsx`, rendered by the layout) re-applies the rule
   on every pathname change.

4. **Pages that know better claim the language.** `PageLang` is rendered by
   `not-found.tsx` and `error.tsx` (`BOUNDARY_LANG`) and by `LandingContent`
   (its live toggle state; the landing switches strings on the client
   before the Server Action's re-render reaches the layout). While mounted
   it wins; on unmount the route's language returns. Module-level state, not
   a context: a provider would have to wrap `{children}` in the root layout
   for this alone.

## Known limits

- An in-segment `notFound()` from a streamed page is served by Next as an
  `<html id="__next_error__">` shell with no `lang` at all (seen in dev and
  in `next start`), so its marker is `ru` only after hydration. This is
  Next's shell, not the layout.
- After a client-side navigation the marker updates in a passive effect,
  after the URL changes. Measured in dev: still the old value immediately
  after `waitForURL`, the new one 200 ms later.

## Verification

`lib/alliengll/surfaceLang.test.ts`, 29 tests. In a real browser (Edge via
Playwright, `next start`), `document.documentElement.lang` was:

| step | lang |
|---|---|
| `/` full load, no cookie | en |
| `/` toggle → RU / → EN / → RU | ru / en / ru |
| soft nav `/` → course | ru |
| course toggle → EN / → RU | en / ru |
| soft nav course → lesson | en |
| soft nav lesson → course | ru |
| full load `/courses/future-imperfect/no-such-lesson` (404) | ru |
| soft nav 404 → `/` (saved ru) | ru |
| full load `/nope` (global 404) | ru |

The console output was identical to HEAD's on the same script (dev).
`npm run budget`: `/` 178.0 → 178.3 KB (budget 180), course page
171.7 → 172.0 KB (budget 182).

## What would make us revisit it

- A third chrome language, or a route whose language depends on more than
  path and saved choice.
- `/` running short of budget: `HtmlLang.tsx` costs about 0.3 KB on every
  English route.
- Next giving layouts the pathname, which would make the proxy header
  unnecessary.
