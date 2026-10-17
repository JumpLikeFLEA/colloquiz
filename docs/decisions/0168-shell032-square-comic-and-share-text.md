# 0168 — SHELL-032: the square comic panel; the old headline removed

Status: built 2026-10-17. Three requests from the owner on 2026-10-17, after
SHELL-031 (0167): keep "вы" in the account menu, remove "Английский без
напряжения" completely, and copy the mockups' square four-quarter comic block
(`docs/design/alina-cher/owner-landing-hero-{ru,en}.png`). The owner approved the
plan below before work began.

## Decisions

1. **The comic panel is one square block of four quarters**, as the mockups draw
   it. It is a 2×2 grid, `aspect-square`, framed in `--comic-frame`. The inner
   lines are each cell's own right/bottom border. The block carries the violet
   offset shadow and is tilted −1° (0° under `prefers-reduced-motion`).
   - Top left: the big dinosaur on `bg-brand-subtle`. On this surface that is
     `#f2f0fc`, beside the mockup's sampled `#F4F1FC` (0162), so no new token.
   - Bottom left: the small dinosaur at half the cell's width, its "ээ...мм"
     bubble at the cell's top right, and a dashed line under it.
   - Right column: the captions, now bold sans (`text-base` → `lg:text-2xl`), as
     in the mockups, in place of SHELL-027's handwritten Caveat. The bubble and
     the note under the block stay handwritten.
   - The sticker is a yellow circle (`size-[5.5rem]`, `sm:size-28`) over the top
     right corner, "10–15" in the display face over the unit.
   The two separate cells with their own shadows (SHELL-027) are gone.
2. **The sticker's overhang is `-right-1` up to `xl`, `-right-5` from `xl`.** The
   tilted parent and the rotated sticker together produced 1px of horizontal
   scroll at 512–576px and at 1024px with an 8px overhang. Swept 320–1600px in 8px
   steps: none after the change. Only `xl` has room for the wider overhang.
3. **"Английский без напряжения" is removed with its whole block.** `copy.ts`'s
   `landing` object held it, the SHELL-010 subtitle, and two strings nothing read
   (`ctaPrimary`, `catalogueLink`; `rg "alliengllCopy.landing"` found only the
   title and subtitle in use). It is deleted. The lesson routes ship `copy.ts`,
   so their JS fell by 0.2 KB.
4. **Share cards and the meta description read the landing's own words**, through
   `landingShareText()` in `landingCopy.ts`: the headline as plain text ("Ты
   знаешь больше, чем можешь сказать") and the subtitle. That covers four share
   cards: `/` (the surface default), and the invite, course and lesson fallbacks.
   One place to change them. Russian, as before: a share card is cached per URL,
   and the metadata stays Russian (docs/handoff.md). `landingCopy.ts`'s import
   rule now names these server-only callers as the one exception.
5. **The account menu keeps "вы"** (owner, 2026-10-17): "Вы вошли как" and "Вы
   вошли в аккаунт" in `accountCopy.ts`, which this card does not touch. The
   landing's "ты" (0167 Decision 4) ends at the landing's own copy.

## Evidence

- `npm run check` exit 0 (hex-literal guard: 14 files within baseline; a first
  run flagged a hex quoted in a ComicPanel comment, reworded); `npm test`: 129
  files, 1500 tests passed.
- `rg "без напряжения" app lib`: no output, exit 1; positive control `rg -c "Ты
  знаешь" app lib`: `app\(english)\landingCopy.ts:1`.
- `npm run budget` before and after (`.env.local` points at hosted): `/` 177.9 /
  177.9 KB of 180; free lesson 257.4 / 257.2; applied-practice 285.3 / 285.1;
  `/login` 287.9, `/courses/future-imperfect` 173.0, `/invite` and `/join` 177.0
  unchanged. `/runs`, `/my`, `/my/messages` FAIL identically before and after (no
  fixtures on hosted, as in 0165–0167).
- Share cards from a production build (`next start`), fetched and read as PNG:
  before, `/` showed "Английский без напряжения"; after, `/`, the invite fallback
  (zero token), the course fallback (`/courses/no-such-course/...`) and the
  lesson fallback (`/courses/future-imperfect/no-such-lesson/...`) all show "Ты
  знаешь больше, чем можешь сказать" over "Короткие курсы, которые переводят
  знания в речь." Cyrillic renders in Satori's default font. `<meta
  name="description">` on `/` reads the new subtitle.
- `npm run viewport360 -- --expect="You know" /`: `scrollWidth/innerWidth
  360/360`. Playwright, light and dark × EN and RU × 360/390/768/1024/1440:
  `scrollWidth` equal to the width every time; the block measures 334×334,
  364×364, 553×553 and 453×453 (the tilted box), so it stays square; the sticker
  overlaps neither caption nor the social row.
- `git diff -- 'app/(english)/accountCopy.ts' | wc -l`: 0.

## Not measured

- A signed-in session on `/`.
- The block in a real phone's in-app browser.

## Revisit when

- The owner wants the captions handwritten again, or the block straight.
- The share card should follow the visitor's language (it cannot while one URL
  has one cached image).
