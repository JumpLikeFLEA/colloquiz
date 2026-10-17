# 0169 — SHELL-029: the English sign-in screen in the Alina Cher violet

Status: built 2026-10-17. Decided unattended (`--no-approval`).

## Context

`/login` and `/signup` live in Colloquiz's route group, so their root layout
never carries `surface-alina` (0163 Decision 1). A learner who arrives with a
`next` outside `/app` (`isEnglishSurfaceEntry`, 0135) already sees
`EnglishAuthPanel`, but it was indigo like the rest of the screen.

## Decisions

1. **`AuthScreen`'s root `<div>` takes `surface-alina` when `englishEntry`, and
   nothing otherwise.** The card's wording is "`EnglishAuthPanel` takes the
   surface class locally"; the class went on the screen's root, which contains the
   panel, rather than on the panel alone. Reason: the class re-points `--brand*`,
   and the form on the right (Sign In, "Forgot password?", "Sign up", the consent
   checkbox) reads those same tokens. On the panel alone the learner would see a
   violet panel beside an indigo button, which is two products. A Colloquiz entry
   gets no class and keeps indigo.
2. **Colour only.** No new tokens, no new fonts, no layout change. `font-display`
   and `font-accent` are not used: their variables are set by the English layout,
   not by this one, so they would fall back to Geist here.
3. **Copy, the two forms and the OAuth buttons are unchanged.**

## Evidence

Edge against `next dev` on the local stack, `getComputedStyle` of the sign-in
button and of the screen root's `--brand`:

| state | width | `--brand` | Sign In background | `scrollWidth/innerWidth` |
|---|---|---|---|---|
| `/login?next=/` light | 1280 / 360 | `#5b3fd9` | `rgb(91, 63, 217)` | 1280/1280, 360/360 |
| `/signup?next=/` light | 1280 / 360 | `#5b3fd9` | `rgb(91, 63, 217)` | 1280/1280, 360/360 |
| `/login?next=/` dark | 1280 / 360 | `#5b3fd9` | `rgb(91, 63, 217)` | 1280/1280, 360/360 |
| `/signup?next=/` dark | 1280 / 360 | `#5b3fd9` | `rgb(91, 63, 217)` | 1280/1280, 360/360 |
| `/login` (Colloquiz) light | 1280 / 360 | `#4f46e5` | `rgb(79, 70, 229)` | 1280/1280, 360/360 |
| `/login` (Colloquiz) dark | 1280 / 360 | indigo (`lab(43.8% 36.4 -77.4)`) | same | 1280/1280, 360/360 |

Screenshots (scratchpad, not committed) of the English dark and the Colloquiz
light screens at 1280px were looked at: violet panel and violet buttons on one,
indigo on the other, the Colloquiz panel unchanged.

`npm run budget`, `/login`: 287.9 KB before and after, of 380 (plain `/login`; the English entry is the same component).

## Revisit when

- The English sign-in should carry the paper ground, ink outlines or the display
  face: that needs the fonts loaded on the auth route, which is a bundle decision.
