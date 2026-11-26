# 0247 — OPS-045: phone engines in Playwright

Status: built 2026-11-26 (#341). No migration, no new dependency, no hosted contact. Local stack only.

## Context

The owner has no iOS or Android test devices. 0246 Decision 6 replaced the real-phone matrix with
Playwright in two engines: WebKit for iOS Safari and every iOS in-app browser, Chromium for Android
Chrome and Android in-app browsers. This card builds that harness. A pass is evidence about the
engines, not about a phone: iOS Safari, Android Chrome, Instagram and Telegram stay "not tested".

## Decisions

1. **Two projects in `playwright.config.ts`, each a descriptor with only the width changed.**
   `webkit-iphone` is `devices["iPhone 13"]` and `chromium-pixel` is `devices["Pixel 7"]`, with
   `viewport.width` set to 360. Height, `deviceScaleFactor`, `isMobile`, `hasTouch` and the user agent
   are the descriptor's own. A `setup` project runs first. `workers: 1`: the runner shares the laptop
   with `next start`, and parallel browser processes have taken this machine down before. The resolved
   config, printed from the imported file:

   ```
   webkit-iphone  {"browser":"webkit","viewport":{"width":360,"height":664},"deviceScaleFactor":3,"isMobile":true,"hasTouch":true,"userAgent":"Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1"}
   chromium-pixel {"browser":"chromium","viewport":{"width":360,"height":839},"deviceScaleFactor":2.625,"isMobile":true,"hasTouch":true,"userAgent":"Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.8010.12 Mobile Safari/537.36"}
   testDir e2e workers 1
   ```

2. **`npm run e2e` (`scripts/e2e.ts`) builds and serves the way `budget:local` does, through shared
   code.** The local-stack env, the build stamp, the server lifecycle and the "start and seed it" hint
   moved from `scripts/budget.ts` to `scripts/localServer.ts`. The fixture sign-in that fails fast moved
   to `scripts/fixtureSignIn.ts`. `budget.ts` imports both, so nothing is copied. The two runners share
   one `.next` and one stamp. e2e serves on 4174 and the guard on 4173, so they never collide.
   `--url=<origin>` builds and checks nothing. Every other argument goes to `playwright test`.
   Considered: Playwright's own `webServer` option. It can't build only when the stamp says so, so it
   would either always rebuild or never check.

3. **The 360 check compares `scrollWidth` with 360, not with `innerWidth`.** The positive control (a
   scratch 400px element, run once, then removed) printed `400/360` in WebKit but `401/401` in
   Chromium. With `isMobile` on, Chromium widens the layout viewport to fit the overflow, as Android
   Chrome does. `scrollWidth <= innerWidth` alone would have passed there. The spec now asserts
   `scrollWidth <= 360` and `innerWidth === 360`, and failed in both projects with the control in place.
   This also applies to any future phone-context check outside this harness: in a mobile Chromium
   context, `scrollWidth/innerWidth` equal to each other is not evidence of no overflow.

4. **`e2e/` and `playwright.config.ts` are left out of the build fingerprint.** They are in
   `git ls-files`, so before this change editing a spec forced a full `next build`. They never reach the
   bundle. Shown: after the exclusion, three e2e runs and one `budget:local` with spec edits in between
   all printed `Reusing .next`. `next build`'s type check does cover them, so a type error in a spec could
   in principle fail a build that the stamp then reuses. `npm run check` catches the same error first.

5. **Storage state: one per fixture, made fresh every run, through the login form** (`e2e/auth.setup.ts`,
   written to `e2e/.auth/`, gitignored). A missing fixture fails with the form's answer (0245 Decision 3).
   Shown with a bogus email in place of prog002's: `the login form answered "Invalid login credentials":
   fixture prog002-missing@example.com is missing on the server at http://localhost:4174 …`, and the
   whole setup took 5.5 s.

6. **Browsers stay out of the repo.** They are installed with `npx playwright install webkit chromium`
   into Playwright's cache. This machine already had webkit-2359 (WebKit 26.6) and chromium-1243 for
   `@playwright/test` 1.63.0, so no version changed: `package.json` keeps `"@playwright/test":
   "^1.63.0"` and `git diff --stat package-lock.json` is empty.

## Measured (2026-11-26, local stack `http://127.0.0.1:54321`)

- Smoke, both projects, 6 passed: the free lesson `/courses/future-imperfect/true-or-false` signed out
  and `/my/notebook` as prog007, each `scrollWidth/innerWidth 360/360`.
- Positive control: 4 failed (`400/360` WebKit, `401/401` Chromium), then removed.
- `--url=http://localhost:4175` against a separately started `next start`: 6 passed.
- Stack stopped: `npm run e2e: could not read the local Supabase stack (… missing API_URL, ANON_KEY,
  SERVICE_ROLE_KEY). Start it with \`npx supabase@2.120.0 start\`, then seed …`, exit 1.
- `npm run budget:local` before the extraction, after it (rebuilt) and at the end (`Reusing .next`
  after e2e runs): the same 17 figures all three times, e.g. true-or-false 259.9 KB, `/my/notebook`
  169.3. `/runs/…f1a1` is 182.0 of 179 every time, the same as in 0245.
- vitest lists 219 files, 0 under `e2e/`. `tsc --listFilesOnly` includes the four `e2e/` files and the
  config, and eslint lints them (0 errors).

## What the harness can drive (finding, no pass/fail; read by PROG-022)

Touch signals, printed on every smoke page:

| | `pointer: coarse` | `hover: none` | `navigator.maxTouchPoints` | `"ontouchstart" in window` |
|---|---|---|---|---|
| webkit-iphone | true | true | **0** | true |
| chromium-pixel | true | true | 1 | true |

`maxTouchPoints` is 0 in WebKit (as 0246 found), so it can't be used to tell touch apart. The media
queries agree in both engines.

Where the app reads these (grep of `app/` and `lib/` for `maxTouchPoints`, `pointer: coarse/fine`,
`hover: none/hover`, `ontouchstart`, `matchMedia`, `pointerType` and the dnd-kit sensors; tests
excluded):

- `app/(english)/LivePaper.tsx:22`: `(min-width: 1024px) and (hover: hover) and (pointer: fine) and
  (prefers-reduced-motion: no-preference)`. False in both engines (360, coarse, hover none), so both
  keep the still CSS grid, as a phone should (0175).
- `app/components/lesson-player/practice/useLessonPlayerSensors.ts:34-36`: `PointerSensor`
  (distance 5), `TouchSensor` (delay 200, tolerance 5), `KeyboardSensor`. See the touch drag below.
- `app/(studio)/…/lessons/[lessonId]/BlockList.tsx:192-194`: the same three sensors in the Studio
  editor. Not driven here, since Studio is not a phone surface under test.
- `app/components/react-bits/ClickSpark.tsx:422,428`: sparks on `pointerdown` for `pointerType
  === "mouse"`, else on `click`. Which branch a tap takes in each engine was not measured.
- Tailwind's `hover:` utilities: the built CSS puts them under `@media (hover:hover)` (10 such blocks
  in the main stylesheet; two sampled, per-rule coverage not counted). So hover styles don't apply in
  either engine, since both report `hover: none`.
- `maxTouchPoints` and `ontouchstart`: no use in `app/` or `lib/`.

Touch drag on applied-practice's first ordering item: one press, held 300 ms (past the TouchSensor's
200 ms), then 10 moves down by 2.5 rows, then release. The sensor was read from dnd-kit's own
marker, `nativeEvent.dndKit.capturedBy`, named by its activator's event name, since the build
minifies class names.

- **chromium-pixel**, CDP `Input.dispatchTouchEvent`: captured `pointerdown → PointerSensor`, and the
  drop landed (row 1 moved to position 3 of 4). The TouchSensor never captured. Chromium sends
  `pointerdown` before `touchstart`, and `PointerSensor` is registered first and arms after 5 px with
  no delay (its config). So in this engine the TouchSensor's 200 ms hold is not what started the drag.
  A drag without the hold was not run. The handle is `touch-none`
  (`OrderingRenderer.tsx:241`), so its pointer stream isn't taken over by scrolling. Hypothesis, not
  measured: the same holds for the matching and slots drag sources wherever they are `touch-none`, and
  `useLessonPlayerSensors`' comment ("a touch has to stay within tolerance px for delay ms") describes
  a path Chromium doesn't take.
- **webkit-iphone: touch drag not drivable in WebKit.** Playwright has no touch-move API
  (`page.touchscreen` only taps), and the one try with synthetic TouchEvents failed at `new Touch(...)`:
  `TypeError: Illegal constructor`. Not tested, not passed.

`e2e/touchDrag.ts` keeps the helper, since it works in Chromium. In WebKit it returns
`method: "unavailable"` with that note. The one-off spike spec was removed.

## What would make us revisit this

- A real phone becomes available: its cells replace "not tested", and any disagreement with these
  engines goes here.
- Playwright gains a touch-move API for WebKit, or WebKit allows `new Touch()`: retry the drag.
- The harness moves into CI, or `viewport360` and `budget` move onto this config (a later card).
- A dnd-kit upgrade changes the `dndKit.capturedBy` marker or the sensors' static `activators`.
