# 0255 — PROG-024: the Save chip under the selection, and the selection colour

Status: decided (owner, chat, 2026-11-28); card PROG-024, not built. No migration, no new dependency,
no hosted write.

Supersedes 0253 Decision 2 (the Save bar under the lesson strip) and 0254 Decision 6 (its
placement against the strip's sticky root). Everything else in 0253 and 0254 stands.

## Context

After PROG-023 was built (0254), the owner saw the Save bar lag on a phone when a phrase was selected
near the top of the screen. No measurement says why. Hypothesis, unverified: a phone repaints the
blurred sticky strip, and the bar drawn inside it, late while scrolling. 0253's first revisit
trigger ("the bar is missed or in the way, then a chip next to the selection") has fired.

## Decisions (the owner's picks, chat, 2026-11-28)

1. **The Save control appears under the selection**, as browser extensions do, instead of in a bar
   under the strip.
2. **The old bar is removed, not fixed.** Its lag is not investigated further.
3. **The selection is drawn in the app's light violet** on the English surface: `::selection` with
   `--brand-subtle` behind `--brand-text`. These are existing tokens, so this is not a new colour.
   Marker yellow (`--highlight`) was the other option and was not picked.
4. **A new card (PROG-024)**, not a change to PROG-023, whose acceptance names the bar's position.

## Known limits, for the build

- The highlight's height is the line box the browser paints. Without changing the lesson's line
  spacing, CSS cannot shorten it, and this card does not try.
- Hypothesis, unverified: iOS Safari may keep its system selection tint whatever `::selection`
  says. WebKit in Playwright is not proof about iOS.
- Hypothesis, unverified: phones draw their own selection menu above the selection, so the chip
  goes below it, with a gap for the selection handle.
- The chip covers a line or two of text under the selection while it shows.

## What would make us revisit

- The chip overlaps the phone's own menu or handles on a real phone.
- iOS ignores the colour and the mismatch with Android is reported.
- Accidental saves, or a chip that is missed (0253's list).
