# 0021 — SHELL-002: Geist Cyrillic coverage, proven not assumed

## Context

docs/decisions/0018-alliengll-content-model.md Decision 5: "No fallback to a
system font is allowed" anywhere Alliengll content renders, and the served
webfont "must be proven from the font files served, not assumed from a
subset name." SHELL-002 (issue #63) is that proof.

## What was checked and how

1. **Configuration**: `app/layout.tsx`'s `geistSans` (`next/font/google`
   `Geist`) `subsets` widened from `["latin"]` to `["latin", "cyrillic"]`.
   `geistMono` was left at `["latin"]` — it is Colloquiz-quiz-only (per its
   existing comment; no Alliengll surface uses it) and Alliengll content
   never renders in it.

2. **Glyph-table check, against the real build output.** `npm run build`,
   then every served `.woff2` file Next attributed to the `Geist` family
   (via `@font-face` rules in the emitted CSS — 5 files, split by
   `unicode-range`) was parsed with `fontkit` (installed in a throwaway
   scratch npm project outside this repo, per the acceptance line: "checked
   ... with a one-off script, not committed as a dependency" — no font
   parser was added to `package.json`). The script called
   `hasGlyphForCodePoint` directly, not the CSS `unicode-range` hints, for
   every code point SHELL-002's acceptance line names: U+0410-U+044F
   (Cyrillic А-Я/а-я), U+0401/U+0451 (Ёё), U+00AB/U+00BB/U+2013/U+2014/U+2116
   (« » – — №), U+0022/U+0027 (straight quotes), U+2018/U+2019/U+201C/U+201D
   (curly quotes). Result: **68/68 required code points present** across
   the 5 files (0 gaps) — printed per-group counts, no group partial.

   This distinction matters: `unicode-range` only tells a browser which file
   to *fetch* for a given character; it says nothing about whether that
   file's glyph table actually contains a drawable glyph for every code
   point in its declared range. A subsetted build can under-declare or
   (rarely) over-declare its own range. Checking the parsed font directly is
   what "proven from the font files served, not assumed" requires.

3. **Rendered-fonts check, in a real browser.** A standalone HTML page
   (outside the Next app, so it renders with zero application code — just
   the `@font-face` rules copied verbatim from the real build CSS, repointed
   at local copies of the same 5 served files) displaying the full required
   character set with `font-family: Geist` and **no fallback stack**,
   loaded in headless Edge via Playwright (the repo's existing precedent for
   driving a real browser — `.claude/skills/verify/SKILL.md`). Playwright's
   CDP session called `CSS.getPlatformFontsForNode` on the text container —
   this is the exact data Chrome DevTools' "Rendered Fonts" panel shows,
   not a CSS declaration or a script's guess. Result: exactly one font
   family rendered the node, `"Geist"`, `isCustomFont: true` — no fallback
   used for any character. A screenshot was captured as the acceptance
   line's required visual evidence: https://claude.ai/artifact/UzUr1aia2H2bkPj4sQusor
   (published artifact; also viewable as the Playwright screenshot referenced
   in the SHELL-002 evidence comment).

## Result

No gap. **No font-choice decision was triggered** — Geist Sans (`latin` +
`cyrillic` subsets) covers the full required set. The acceptance line "any
gap stops the card and becomes a font-choice decision" did not fire.

## What would make us revisit this

- A future required character set grows beyond what SHELL-002 named (e.g.
  a currency symbol, an IPA character for pronunciation notation) — re-run
  the same two-step check (glyph table, then rendered-fonts) against the
  new set before assuming coverage.
- Geist itself changes its Cyrillic glyph set in a future version bump —
  `next/font/google` pins by family/weight, not by a font-file hash, so a
  Google-side font update would silently change what ships. If Alliengll
  content ever reports visibly wrong Cyrillic rendering, re-run this check
  before assuming a CSS/layout bug.
