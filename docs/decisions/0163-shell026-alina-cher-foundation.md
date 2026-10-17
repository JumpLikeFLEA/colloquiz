# 0163 — SHELL-026: the Alina Cher foundation

Status: built 2026-10-17 from the owner's picks in docs/decisions/0162.

## Context

0156 Decisions 12 and 13 put a violet on the English surface only, with new
tokens, and phase the redesign behind shared tokens. SHELL-027 to SHELL-029 and
PROG-007 build on this card.

## Decisions

1. **A surface class, `surface-alina`, overrides the `--brand*` family.** It is
   on `<html>` in `app/(english)/layout.tsx`, and works on any wrapper element
   (the English sign-in panel, SHELL-029). It sets `--brand`, `--brand-text`,
   `--brand-subtle`, `--brand-subtle-hover`, `--brand-hover`, `--brand-deep` and
   `--brand-border`, light and dark. `--brand-accent`, the second gradient stop,
   keeps its existing violet. Colloquiz and Studio never carry the class.
   - Two selectors for dark, because the class can sit on the element that has
     `.dark` or inside it: `.surface-alina.dark` and `.dark .surface-alina`.
     Both are more specific than the light block, which follows `:root` and
     `.dark` in source order.
2. **Values.** The violet is the owner's `#5B3FD9` (0162). The rest are derived
   here, as mixes of it, not picked by the owner:
   - light: subtle `#F2F0FC` (92% toward white), border and subtle-hover
     `#E6E2F9` (85%), hover `#5037BF` (12% toward black), deep `#3B298D` (35%
     toward black);
   - dark: text `#A595EA` (0162), subtle `#2B2351`, subtle-hover `#2F255D` and
     border `#392B78` (the violet at 30%, 36% and 50% over the dark card
     `#171717`), hover `#684EDC` (8% toward white), deep `#402C98` (30% toward
     black).
   WCAG 2 contrast, computed on 2026-10-17 with a one-off script (not
   committed):

   ```
   light  white on --brand 6.65   --brand-text on --brand-subtle 5.90
          white on --brand-hover 7.95   --brand-text on --brand-border 5.26
   dark   --brand-text on --card 6.90   on --background 7.62
          on --brand-subtle 5.53   on --brand-subtle-hover 5.24
          white on --brand 6.65   white on --brand-hover 5.66
   ```
3. **New tokens**, in `:root` and `.dark` for every surface, mapped in
   `@theme inline`: `--highlight` `#FFE55C`, `--ink` (`#1E1A3A` / `#F2F0FA`),
   `--grid-line` (`#F0EFF5` / `#232035`), `--offset-shadow` (`#1E1A3A` /
   `#0A0817`), with a `shadow-offset` utility (4px 4px, no blur).
   Two more that 0162 implies:
   - `--paper` (`#FAF9FE` / `#17142A`), the ground the grid sits on;
   - `--highlight-foreground` (`#1E1A3A` in both themes), the text colour on
     the marker, because `--ink` flips in dark and light ink on yellow fails.
4. **`--background` and `--foreground` are NOT overridden on the surface in this
   card.** The paper is applied by the cards that use it (`.grid-paper` on a
   section), so no page changes its ground under another card's feet.
5. **Fonts**, in `app/(english)/layout.tsx` through `next/font/google`, both
   `latin` + `cyrillic`, weight pinned: Unbounded 800 (`--font-unbounded`,
   preloaded) and Caveat 600 (`--font-caveat`, `preload: false`). Utilities
   `font-display` and `font-accent` (falling back to Geist) come from
   `@theme inline`; on Colloquiz and Studio the variables are unset.
   Measured on a production build of `/`: three woff2 files are preloaded, matched to
   their `@font-face` in the built CSS (Geist 29,288 B; Unbounded 21,708 B and
   13,108 B); no Caveat file is. Those are
   fonts, not scripts, so `npm run budget` does not count them.
6. **Marks, all server-rendered, no client JS:** `.grid-paper` (25px cells) and
   `.marker` in `app/globals.css`; `Marker` and `HandOval` in
   `app/(english)/AlinaMarks.tsx`.
   - Marker shape (0162 left it to this card): in light, a band behind the lower
     part of the word, as in the mockup; in dark, a full-height band with
     padding, so ink text is always on yellow.
   - The oval is an SVG that stretches to the word's box, with a non-scaling
     3px stroke in `--brand-text`, hidden from assistive tech.
7. **There is no VIS-003 page to delete** (0162, "Why no Studio type page was
   built").

## Evidence

- Computed on a scratch English page at 360 and 1440, light and dark (Edge, local
  stack; the page is deleted): `--brand` `#5b3fd9`; `--brand-text` `#5b3fd9` /
  `#a595ea`; `scrollWidth/innerWidth` 360/360 and 1440/1440 in all four. Unbounded
  and Caveat both reported loaded.
- The class on a wrapper alone (removed from `<html>`): the wrapper reads
  `--brand` `#5b3fd9`, the page `#4f46e5`; dark, wrapper `--brand-text`
  `#a595ea`. A button on the wrapper paints `rgb(91, 63, 217)`.
- Colloquiz `/login` and Studio `/studio` (signed in as an editor), light and
  dark: `--brand` `#4f46e5` in light and the same oklch value as before in dark;
  no `surface-alina` on `<html>`.
- `npm run budget`, local stack, before and after, identical on every route:
  `/` 178.2 KB of 180; `/courses/future-imperfect` 172.0 of 182;
  `/courses/future-imperfect/true-or-false` 256.2 of 260;
  `.../applied-practice` 284.0 of 290; `/invite/...` 175.9 of 183; `/join/...`
  175.9 of 183; `/runs/...` 176.3 of 184; `/my` 174.0 of 180; `/my/messages` 175.9
  of 184; `/login` 286.8 of 380.

## Revisit when

- A card wants the paper as the whole page ground: override `--background` on
  the surface then, and re-check every English page in dark.
- A derived value reads wrong next to the owner's design file: change it here,
  the owner's own values (0162) stay.
