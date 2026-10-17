# 0166 — SHELL-028: the course page and lesson chrome in the Alina Cher look

Status: built 2026-10-17 on the SHELL-026 tokens (0163), in the vocabulary the
landing set (0165). Designed here from the existing app (0156 Decision 13); the
owner's screenshots cover only the hero.

## Decisions

1. **Grid paper, not a gradient band.** The course page (`<main>`), the lesson
   page (the player wrapper, the denied states) and the lesson band sit on
   `.grid-paper`. This supersedes 0079 D1 and D5's gradient bands for these two
   routes only. The gradient stays on `/invite`, `/join`, `/runs`, `/my` and
   `/my/messages` until PROG-007.
2. **`BandTopBar` has a `tone` prop** (`band` default, `paper`). Paper: the
   wordmark in the display face, ink links; the default keeps every other page
   unchanged. `LanguageToggle` and `AccountMenu` already had `tone="paper"`
   (0165) and are passed it here.
3. **Course hero:** yellow level pill, "Whole course free" in the ink-outlined
   pill, the title in `font-display`, a muted lead, the two progress numbers as
   ink-outlined tiles (still two numbers, never blended), the violet offset
   button (`OFFSET_CTA_CLASS`), and a cover with ink outline and offset shadow.
   A course with no cover shows the grid-paper level tile `CourseCard` uses
   (at `lg` only, as before).
4. **Lesson rows** use the catalogue card's frame (`PAPER_CARD_CLASS`) and a
   yellow numeral tile with the display face. The ✓ badge, "Best", "N of M
   exercises", "Opens <date>", "Sign in to open" and "Paid" pills are unchanged.
   The cohort calls, tiers and before/after cards take the same frame and tile
   so the page does not mix two looks; `SectionHeading` is used with `display`
   on this page.
5. **Lesson band** is the course hero's compact form: the course title in
   `font-accent`, the title in `font-display`, a yellow "Lesson N of M" pill and
   ink-outlined minutes, homework and exercise pills, an ink rule under it.
6. **Progress strip:** an ink-outlined track with a solid `bg-brand` fill (the
   gradient fill is gone) and the count or score in the display face, between ink
   rules, on `bg-paper/90`. Still CSS sticky, no client JS.
7. **Completion card:** when every exercise is answered, a marker-yellow card
   (`--highlight`, text `--highlight-foreground`, fixed in both themes) with the
   score as a display-face number and the violet offset "Next lesson" button, or
   an outlined "Back to course". Until then, the same dashed card with an ink
   dashed border. The registration offer and "Answer review" are untouched
   (their own cards, not in this card's scope).
8. **Denied states** (paid, scheduled, sign in) get the ink frame and offset
   shadow so they match the band above them. The Studio "Visitor view" renders
   the same components, so it shows the paper band too, in Studio's indigo (it has
   no `surface-alina`).
9. **Not changed:** access, scoring, the one-tap path, the exercise cards
   (`PRACTICE_CARD_CLASS`, shared with the Studio preview), the registration
   offer, the footer. No new tokens.

## Evidence

- `npm run check` exit 0 (hex-literal guard: 14 files within baseline);
  `npm test`: 129 files, 1500 tests passed.
- `npm run budget`, before and after (this environment's `.env.local` points at
  the hosted project, so these are reads of its public pages; hosted has no
  `play-006-smoke` fixtures): `/courses/future-imperfect` 173.0 / 173.0 KB of 182;
  `/courses/future-imperfect/true-or-false` 257.4 / 257.4 of 260;
  `/courses/future-imperfect/applied-practice` 285.3 / 285.3 of 290. `/` 178.1 /
  178.2 of 180 (not touched by this card; the 0.1 is not explained). `/runs`,
  `/my`, `/my/messages` fail identically before and after (404 and a sign-in
  timeout for a user that does not exist on hosted), so they were not measured.
- `npm run viewport360` against a dev server on the LOCAL stack (URL and keys
  passed as env vars), `scrollWidth/innerWidth` 360/360 on: the course page
  (EN and RU), a cohort course page (EN and RU), a free lesson, a lesson with
  drag and typed exercises, the paid state, the sign-in state. Also 360/360 and
  1440/1440 in Edge, light and dark, with a lesson completed (8 of 8 answered,
  63%). Screenshots read at 360 and 1440, light and dark.
- A first pass wrapped the wordmark onto two lines at 360px ("Alina / Cher",
  the display face is wider than the Geist wordmark it replaces); it is now
  `whitespace-nowrap` at `text-base` below `sm`.

## Not measured

- A signed-in session (the paper-tone account chip in the band, and the
  homework pill), the scheduled state, and a cohort page for an enrolled learner.
- The cover image: local cover URLs do not load in this environment, so the
  cover frame was seen with a broken image.
- The keyboard order and focus rings; they are the classes the landing uses.

## Revisit when

- The owner wants the exercise cards in the ink-and-offset frame too. It is one
  class string, but it is shared with the Studio preview and the demo.
- The full-width ink rules read too loud in dark (`--ink` is a light line there).
