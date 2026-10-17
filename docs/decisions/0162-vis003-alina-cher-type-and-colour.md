# 0162 — VIS-003: Alina Cher type and colour

Status: decided by the owner on 2026-10-17, from a picker published on
claude.ai (https://claude.ai/artifact/4W1URX12TKGJhyiAQMEovZ). Nothing in the
app changes with this record: the tokens and fonts are built by SHELL-026.

## Context

0156 Decisions 12 and 13 call for a heavy display font and a handwritten accent
font, both with Cyrillic, and a violet primary on the English surface. The
owner's screenshots were the only design source, so the owner picks from
rendered candidates rather than from names.

## Options shown

- **Display fonts:** Unbounded 800, Dela Gothic One, Rubik 800, Montserrat
  Alternates 800.
- **Handwritten accent fonts:** Caveat 600, Neucha, Bad Script, Marck Script,
  Pangolin.
- **Paper:** `#FBFAF5` (a warm paper, rejected as too yellow), `#F4F5F7`,
  `#EDEFF2`. The picked `#FAF9FE` is the mockup's own paper.
- **Marker yellow:** `#FFD84D` (the mockup's), `#FFF27A`, `#FFE55C`.
- **Violets:** `#5B3FD9` (the owner's illustrations), `#6D28D9`, `#7C3AED`
  (the existing `--brand-accent`).

## Decision

**Fonts**

- Display: Unbounded 800, latin + cyrillic.
- Handwritten accent: Caveat 600, latin + cyrillic.
- Rejected: Dela Gothic One, Rubik 800, Montserrat Alternates 800; Neucha, Bad
  Script, Marck Script, Pangolin.
- **Known gap, chosen knowingly:** the mockup's headline face is not Unbounded.
  It is narrower and has a double-storey «а»; of the candidates Rubik is
  closest. The owner kept Unbounded after seeing them side by side.

**Colours** (verbatim; light is the first option in every section, dark is the
picker's dark value)

| Role | Light | Dark |
|---|---|---|
| violet, button fill | `#5B3FD9` | `#5B3FD9` |
| violet as text, links, the oval | `#5B3FD9` | `#A595EA` (`#5B3FD9` mixed 45% toward white) |
| paper (page ground) | `#FAF9FE` | `#17142A` |
| grid line, 25 px cells | `#F0EFF5` | `#232035` (ink at 4.5% over paper / white at 5% over dark paper) |
| ink (text) | `#1E1A3A` | `#F2F0FA` |
| marker yellow | `#FFE55C` | `#FFE55C` |
| offset shadow (buttons, cards) | `#1E1A3A` | `#0A0817` |

- Text on the marker is ink `#1E1A3A` in both themes. In the light mockup the
  marker is a band behind the lower part of the word; the picker's dark
  preview used a full-height band so the ink text stays on yellow. SHELL-026
  decides the shape; both are recorded.
- Muted text keeps the existing tokens; the picker's muted greys were
  stand-ins.
- Dark mode on the English surface still follows the system preference (0046).
  Nothing about that changes.

**Comic panel** (SHELL-027's input, recorded so it isn't re-derived)

| Part | Light | Dark |
|---|---|---|
| cells | `#FFFFFF` | `#211C3B` |
| cell frame | `#1E1A3A` | `#4A4370` |
| big dinosaur fill | `#E4DEF9` | `#3A3170` |
| small dinosaur fill | `#F3F0FC` | `#2E2759` |
| drop | `#DCD5F7` | `#4B3F99` |

The panel's offset shadow is the violet, not the ink. The light fills come from
the SVGs in `docs/design/alina-cher/`.

## Evidence

Mockup measurements (the owner's two hero mockups as PNG, pixel-sampled, about
±2 per channel; the screenshots are not in the repo): paper `#FAF9FE`; grid
lines ≈`#F1F0F6` every ≈25 px; button violet `#5A40D9`; headline ink `#1F1C3B`;
marker `#FFD84D`; big-dinosaur cell fill `#F4F1FC`; the comic panel's offset
shadow is violet; the button and audio-card shadows are ink. The owner chose
`#FFE55C` over the mockup's `#FFD84D`.

WCAG 2 contrast, printed by a one-off script (not committed) on 2026-10-17:

```
#5B3FD9 on #FFFFFF 6.65
#5B3FD9 on #FAF9FE 6.35
#A595EA on #17142A 6.91
#1E1A3A on #FAF9FE 15.86
#1E1A3A on #FFE55C 13.14
#F2F0FA on #17142A 15.92
mix45: #A595EA
```

All six match the expected figures. The same script confirms `#A595EA` is
`#5B3FD9` mixed 45% toward white.

woff2 bytes of the files Google's css2 API served to a current Chrome user
agent (what next/font downloads at build time), same script:

```
Unbounded 800  cyrillic  13156 bytes
Unbounded 800  latin     21828 bytes
Caveat 600     cyrillic  45508 bytes
Caveat 600     latin     51220 bytes
```

Caveat is the heavy one (96.7 KB for both subsets, against 35.0 KB for
Unbounded). It is why SHELL-026's acceptance says the accent font is not
preloaded.

## Why no Studio type page was built

The card's acceptance line described a temporary page at
`app/(studio)/studio/dev/type/page.tsx`. The options went to the owner in a
claude.ai picker instead, and the owner reviewed it at phone and desktop widths
in light and dark. So SHELL-026's acceptance line "The VIS-003 page is deleted"
has nothing to delete.

## Revisit when

- The landing (SHELL-027) reads wrong next to the mockup's headline: try Rubik
  or a narrower grotesk.
- The owner supplies exact colours from the design file.
