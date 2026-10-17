# 0165 — SHELL-027: the Alina Cher landing

Status: built 2026-10-17 on the SHELL-026 tokens (0163), from the owner's
screenshots as rendered in `docs/design/alina-cher/picker-hero-*.png`. The hero
follows them; everything below the hero is designed here (0156 Decision 13).
Copy is pending the owner's review.

## Decisions

1. **The page is grid paper, not a gradient band.** `.grid-paper` wraps the
   header, hero and every section; the footer keeps its own ground. This
   supersedes 0078's layout (not its EN/RU toggle, cookie or sticky-footer
   rules). The gradient band stays on the course, lesson, invite, join, runs and
   `/my` pages until their cards (SHELL-028, PROG-007).
2. **Header:** wordmark, then the tagline "английский с умом" with the hand-drawn
   oval round "с умом", then Courses (`#catalogue`), the EN/RU toggle and Log in
   or the account chip. The tagline is Russian in both languages, as in the
   owner's English render. On a phone the header is a two-column grid (wordmark
   and controls, then tagline and Courses). `LanguageToggle` and `AccountMenu`
   gained a `tone="paper"` prop; the default is the old white-on-gradient look,
   so the other pages are unchanged.
3. **The oval is on the tagline, not the headline.** The acceptance line reads
   "the headline with the marker and the oval". The picker render (the only
   artefact of the mockup in the repo) draws the oval round the tagline and the
   marker on the headline, so that is what was built. If the owner's screenshot
   puts the oval on the headline, it is a one-line move.
4. **Hero:** eyebrow, headline (`font-display`, "English" plain and "without the
   stress" on the marker), subtitle, the violet offset button "Start for free"
   (`OFFSET_CTA_CLASS`, still `heroHref`: the first open lesson of the first
   published course, 0070 Decision 2), an "All courses" link, the "free lessons
   don't need an account" line, then the bio line. The bio line is Alina's photo
   in a circle, "Courses made by Alina", and Instagram and YouTube links (new
   tab). The photo is `public/images/alina.jpg`, a 192px square crop of the
   1080x1920 original (6,071 bytes); the original is never served.
5. **Comic panel and sticker** (`ComicPanel.tsx`): the owner's two dinosaurs
   redrawn inline with the same paths, the speech bubble and the "10-15 minutes a
   day" sticker added as HTML. The SVGs' hex colours became tokens: the five
   `--comic-*` values from 0162's table (new, in `:root` and `.dark`), the
   outline is `--ink` and the violet is `--brand-text`. **The outline in dark is a
   choice made here:** 0162 gives a dark frame colour for the cell but none for
   the drawing, and `#4A4370` on `#211C3B` is too faint for a line, so the
   drawing's strokes follow `--ink`, which flips to a light line.
6. **Removed:** `HeroDemo`, the hero's word chips, the value strip (and
   `valueIcons`), `.landing-float`, and the old demo, values and steps copy.
   The value strip is dropped by judgement, not by the owner: its four claims
   (10-15 minutes, A2-B2, first lessons free, every mistake explained) are now
   the sticker, the eyebrow and the "no account" line, and explanations are not
   a headline claim. Revisit if the owner wants it back.
7. **How it works** is now record, feedback, compare. The subtitle says "Voice
   tasks are part of cohort courses" because the feedback and the before/after
   screen exist only there today, and 0156 Decision 16 keeps the AI analysis out
   of public copy until OPS-027. No AI promise.
8. **Catalogue cards and the closing card:** `CourseCard` has the ink outline and
   offset shadow, a yellow level pill and, with no cover, a grid-paper tile with
   the level in the display face. The closing CTA is a yellow card with ink text
   (`--highlight`, `--highlight-foreground`, fixed in both themes) holding the
   same violet button. `SectionHeading` gained `display` (Caveat eyebrow, display
   title); it is off by default, so the course page is unchanged.
9. **Server-rendered pieces:** `ComicPanel` and `HeroBio` have no hooks. page.tsx
   renders each once per language and `LandingContent` picks one, the
   `account` pattern (0086), so neither adds client JS.

## Evidence

- `npm run check` exit 0 (hex-literal guard: 14 files within baseline);
  `npm test`: 129 files, 1500 tests passed.
- `npm run budget`, local stack, same seed, before and after: `/` 179.1 KB
  before, 178.1 KB after, of 180. Other routes: `/login` 287.9 / 287.9; free
  lesson 257.4 / 257.4; applied-practice 285.3 / 285.3; `/courses/future-imperfect`
  172.9 / 173.0 (the `SectionHeading` prop); `/invite` and `/join` 177.0 / 177.0.
  `/runs`, `/my` and `/my/messages` fail identically before and after (a 404 and a
  sign-in timeout on this local data: the seed fixtures are not loaded), so they
  were not measured by this card.
- `npm run viewport360` on `/`: `scrollWidth/innerWidth 360/360`. Also measured
  in Edge on a production build, light and dark, EN and RU: 360/360 at 360px and
  1440/1440 at 1440px.
- Screenshots read at 360 and 1440, light and dark. The first pass showed the
  sticker covering "English I speak" at 360; it was raised (`-top-8`) and the
  second pass shows it clear.

## Not measured

- A signed-in session on `/` (the paper-tone account chip and its open card).
- The keyboard order and focus rings in a browser; the classes are the ones the
  other pages use.
- The owner's actual screenshots: only the picker renders were available.

## Revisit when

- The owner's screenshot disagrees with the oval position (3) or the dark
  drawing outline (5).
- The partner wants a bio sentence beyond "Courses made by Alina" (4), or the
  value strip back (6).
- SHELL-030 adds the Day 1 / Day 7 audio card under the comic panel.
