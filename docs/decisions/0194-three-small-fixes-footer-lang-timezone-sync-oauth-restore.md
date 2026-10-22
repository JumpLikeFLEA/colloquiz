# 0194 — Three small fixes: footer language under /my, the zone script, the OAuth buttons after Back

Status: written 2026-10-22, ad hoc (owner's report, no card). No migration, no new token or colour.

## 1. A `<script>` rendered on a client navigation (revises 0159 Decision 7)

Report: the browser console said "Encountered a script tag while rendering React component. Scripts inside
React components are never executed when rendering on the client", and did not repeat on a second try.

- The message comes from React's client element creation (`node_modules/next/dist/compiled/react-dom/cjs/
  react-dom-client.development.js`, the `case "script"` branch, guarded by `didWarnScriptTags`, so once per page
  load, in development only). Hydrating server HTML does not go through it. The only `<script>` rendered inside a
  page component is `TimeZoneSync` (`/my`, `/studio/calendar`); the root layout's theme script renders on a full
  load only. So the warning needs a client navigation into one of those two pages, such as the "← My courses"
  link on `/my/settings`, which is why a reload did not show it. I did not catch the warning itself (a `next dev`
  server was already running on :3000, so a second one would not start); the above is from reading React's
  source and the code.
- The script did more than warn: it did not run on that path. Measured before (production build, local stack,
  cookie `colloquiz_tz` cleared, then `/my/settings` and a click on the link to `/my`): cookie not set, the page
  said "Your time zone isn't known yet, so times are shown in UTC."
- Decision: option (a) of 0159 Decision 7, a client component. `TimeZoneSync` is now `"use client"`, with the
  same logic in an effect and `router.refresh()` in place of `location.reload()`; same guard (only when the cookie
  was missing or different and the write stuck). 0159 rejected (a) for bundle bytes against `/my`'s budget; the
  measured cost is below and `/my` has room. 0159's "move to (a) and pay the JS" trigger was a first-visit
  reload, not this, but the reasoning for (c) (no client JS) cannot hold for a page reached by a link.
- Measured after: client navigation into `/my` sets the cookie and the page reads "Times are shown in
  Europe/Belgrade."; a full load of `/my` and of `/studio/calendar` with no cookie ends at "Times are shown in
  America/Lima." with the cookie set.

## 2. The footer on `/my/settings` and `/my/messages` was Russian (SHELL-018 `pageLangForPath`)

`pageLangForPath` matched only `/my` exactly; `/my/settings` (0181) and `/my/messages[/<teacher>]` (0151) fell to
`BOUNDARY_LANG`, so with English saved their `<html lang>` and footer were Russian while the page body followed
the saved choice. Measured before (saved EN): `/my` lang en, `/my/settings` and `/my/messages` lang ru and the
Russian footer. They now follow the saved choice (`/^\/my(\/settings|\/messages(\/[^/]+)?)?$/`); anything else
under `/my` stays Russian. Tests added in `lib/alliengll/surfaceLang.test.ts` (both saved values, the three
paths, and `/my/settings/x`, `/my/messages/a/b` staying Russian). Measured after, EN and RU saved, on all three:
lang and footer agree with the saved choice.

## 3. Google, Telegram and Discord buttons stay disabled after Back (`AuthScreen`)

Report: sign-up, click Google, press Back: the three buttons stay disabled until a refresh.

- A page restored from the browser's back/forward cache keeps its React state, including `oauthLoading`, which is
  set when the button is pressed and only cleared on failure. I did NOT reproduce the restore itself: in Edge
  (Chromium 155, bfcache enabled) `/signup` is not restored, and CDP's `backForwardCacheNotUsed` gives the
  reason `CacheControlNoStoreCookieModified` (the page is `no-store`, and `signInWithOAuth` writes a cookie).
  The report must therefore come from an engine that restores such a page (I could not run Firefox or Safari
  here: Playwright's Firefox build did not match). That cause is a hypothesis, supported by the symptom
  (state kept across a navigation away) but not by a run in the reporter's browser.
- Simulated stand-in, run on both builds: the provider redirect answered with 204 so the page stays in its
  in-flight state (buttons disabled), then a `pageshow` with `persisted: true` dispatched. Before: still
  disabled. After: enabled. `persisted: false` changes nothing, as intended.
- Change: `AuthScreen` listens for `pageshow` and on `persisted` clears `loading` and `oauthLoading`. The email
  form's `loading` has the same hole and is cleared by the same handler.
- Revisit if the reporter still sees it: ask which browser, and whether it is the OAuth buttons only.

## Budget (local stack, `npm run budget`, "All routes within budget." both times)

| route | before | after | limit |
|---|---|---|---|
| `/my` | 174.8 | 175.0 | 180, 182 |
| `/my/messages` | 175.9 | 176.0 | 184 |
| `/my/settings` | 199.7 | 199.7 | 208 |
| `/login` | 286.8 | 286.9 | 380 |

`/my` before is the figure after SHELL-034 (0193); the figure before that was 174.4. Not traced further; the
likely cause (hypothesis) is the small client component and the new listener.

## Not measured

The dev-mode warning itself, before or after (see 1). A real bfcache restore. A phone. Studio's calendar was
checked only for the zone line, not re-measured at 360px (no markup changed).
