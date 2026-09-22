# 0021 — SHELL-002: Geist Cyrillic coverage, proven not assumed

## Context

docs/decisions/0018-alliengll-content-model.md Decision 5: "No fallback to a
system font is allowed" anywhere Alliengll content renders, and the served
webfont "must be proven from the font files served, not assumed from a
subset name." SHELL-002 (issue #63) is that proof.

**Revised after review.** The first version of this file and the code change
it described were wrong about the mechanism, caught by two questions asked
in review: (1) whether `fontkit`/`playwright` had landed as real project
dependencies, and (2) whether the Cyrillic font file was being preloaded on
every route, Colloquiz included. (1) was already fine — see "What was
checked, corrected" below. (2) was real, and re-deriving *why* uncovered
that the original code change (`subsets: ["latin", "cyrillic"]`) added that
unwanted preload while contributing nothing to actual glyph coverage. The
shipped fix is a full revert of the `subsets` change, not a `preload: false`
patch.

## What `subsets` actually does for this font (re-derived from `next/font`'s own source)

`next/dist/compiled/@next/font/dist/google/get-google-fonts-url.js`
constructs the Google Fonts CSS request from family, weights, styles and
`display` only — `subsets` is never part of the URL. Fetching Google's css2
endpoint for `family=Geist` directly (`curl`) confirms the response always
contains the font's full split, five `@font-face` blocks, each preceded by
a comment naming its subset:

```
/* cyrillic-ext */ ... unicode-range: U+0460-052F, ...
/* cyrillic */     ... unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116
/* vietnamese */   ...
/* latin-ext */    ...
/* latin */        ... unicode-range: U+0000-00FF, ..., U+2000-206F, ...
```

`find-font-files-in-css.js` then uses `subsets` for exactly one thing: which
of those comment-labeled blocks gets marked `preloadFontFile: true`
(`subsetsToPreload.includes(currentSubset)`) — i.e. which files get an eager
`<link rel=preload>` / HTTP `Link` header on every route. **The CSS itself,
and therefore which glyphs are servable, does not depend on `subsets` at
all for this font.** The Cyrillic `@font-face` rule (and thus the glyphs
SHELL-002 cares about) is present in the page's font CSS whether or not
`"cyrillic"` is listed — this is also why `geistMono` (still `subsets:
["latin"]`, never touched by this card) was already observed shipping a
cyrillic-range file of its own: nothing font-specific about Sans caused
that, it's this loader behavior, for every `Geist`-family font in this app.

Confirmed empirically, not just from source, with matched pairs of clean
builds (`rm -rf .next && npm run build`, then `npm start` + `curl -sI
/login | grep Link:`, each pair using a fresh server process — a first
attempt at this comparison was invalidated by a stale server left on port
3000 from an earlier build, since this environment's `pkill` is not
available and silently no-ops; verified via `Get-NetTCPConnection` before
trusting a result the second time):

| `subsets` | `@font-face` blocks in the built CSS | Files preloaded (`Link:` header) |
|---|---|---|
| `["latin"]` | 5 (all, cyrillic included) | 1 (latin only) |
| `["latin", "cyrillic"]` | 5 (identical) | 2 (latin + cyrillic) |

Same CSS either way; the only difference is a second font file force-fetched
on every route when `"cyrillic"` is listed — including every current
Colloquiz page, none of which render Cyrillic text yet. That runs against
the performance boundary (`docs/handoff.md`) for no coverage benefit, so
**the shipped code reverts `subsets` to `["latin"]`, unchanged from before
this card.** The Cyrillic `@font-face` rule still ships in the shared CSS;
the browser fetches that specific file lazily, on its own, the moment
Alliengll content first renders a Cyrillic character — no system-font
fallback at any point, satisfying Decision 5 with less eager network cost
than the first version of this change.

## What was checked, corrected

1. **No new project dependency.** `fontkit` and `playwright` were installed
   only in a throwaway scratch npm project outside this repo (`npm init -y`
   + `npm install <pkg>` run from a temp directory, never from
   `D:\Git\colloquiz`). `git show <SHELL-002 commit> -- package.json
   package-lock.json` is empty — confirmed on review request, not assumed.

2. **Glyph-table check, against the real build output.** Every `.woff2`
   file Next attributes to the `Geist` family (5 files, by `unicode-range`)
   was parsed with `fontkit` and checked via `hasGlyphForCodePoint` — not
   the CSS `unicode-range` hint, which only says which file a browser
   *would* fetch for a character, not whether that file's glyph table
   actually contains it — for every code point SHELL-002 names: U+0410-U+044F
   (Cyrillic А-Я/а-я), U+0401/U+0451 (Ёё), U+00AB/U+00BB/U+2013/U+2014/U+2116
   (« » – — №), U+0022/U+0027 (straight quotes), U+2018/U+2019/U+201C/U+201D
   (curly quotes). **68/68 covered, 0 gaps** — re-confirmed against the
   final (`subsets: ["latin"]`) build's actual files, not only the
   intermediate `["latin", "cyrillic"]` build; the file's content and glyph
   set are identical between the two, only its "is this preloaded" filename
   marker (`-s.p.` vs `-s.`) differs.

3. **Rendered-fonts check, in a real browser.** A standalone HTML page
   (outside the Next app — just the `@font-face` rules copied verbatim from
   the real build CSS, `font-family: Geist` with **no fallback stack**)
   showing the full required character set, loaded in headless Edge via
   Playwright. CDP's `CSS.getPlatformFontsForNode` (the same data behind
   DevTools' "Rendered Fonts" panel) returned exactly one family, `"Geist"`,
   `isCustomFont: true`, for the whole node — no fallback used. Screenshot:
   https://claude.ai/artifact/UzUr1aia2H2bkPj4sQusor. This check depends on
   the `@font-face` rule being present with a correct `src`, not on preload
   timing, so it is unaffected by the subsets revert above.

## Result

No coverage gap — confirmed against both the intermediate and final builds.
**No font-choice decision was triggered.** The code change that shipped is
narrower than SHELL-002's acceptance line implies at first read: `subsets`
was reverted to its pre-card value, and the actual deliverable is the proof
itself plus this record of how `next/font`'s Google loader behaves for this
font family, so a future session does not re-derive it from scratch or,
worse, re-add the unwanted preload while "fixing" the subsets array to
literally match the acceptance line's wording.

## What would make us revisit this

- A future required character set grows beyond what SHELL-002 named — re-run
  the same two checks (glyph table, then rendered-fonts) against the new set.
- Geist changes its Cyrillic glyph set in a future version; `next/font`
  pins by family/weight, not a file hash, so a Google-side update would
  silently change what ships. Re-run this check before assuming a
  CSS/layout bug if Alliengll content ever renders Cyrillic wrong.
- If Alliengll content later needs the Cyrillic file preloaded on ITS OWN
  routes specifically (once `app/(english)/` exists, M2) — that is a
  legitimate, narrower use of `subsets`/`preload`, scoped to a layout that
  actually renders Cyrillic, not the shared root layout every Colloquiz page
  also loads. A future card doing that should re-read the mechanism above
  rather than re-add `"cyrillic"` to the shared root layout's `subsets`.
