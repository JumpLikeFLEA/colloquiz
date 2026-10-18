# 0176 — OPS-028: the landing's cold-load budget, and a phone entry

Status: built. Owner approval to raise the budget for `/` for VIS-004 and VIS-005: 2026-10-18
(card OPS-028; 0174 and 0175 both record `/` as over 180 KB "until OPS-028").

## Context

`/` was at 180 KB (0078 Decision 5). VIS-004 (0174) took it to 184.5 KB and VIS-005 (0175) to
192.6 KB, both over budget with the owner's go-ahead. `scripts/budget.ts` says a budget is
re-derived from a real run, never guessed. Most visitors arrive on a phone, which downloads
the digits and the sparks but not the grid (0175 Decision 6), and the guard measured only a
desktop-sized context.

## Decisions

1. **Desktop `/`: 180 -> 202 KB.** Measured after VIS-005 with the hosted env
   (`npm run budget` against `.env.local`): 192.6 KB. 192.6 x 1.045 = 201.3, rounded up to
   202 (the PLAY-012 precedent, 0057). On the local stack the same build prints 191.6 KB; the
   hosted figure is used because it is the larger of the two. The difference is the Supabase
   URL and key, which are baked into the client bundle at build time (hypothesis, not
   isolated: the only difference between the two runs is those env values). The desktop
   context is Playwright's default, which matches the grid's media query, so the figure
   includes the grid chunk.
2. **Phone `/`: a second entry, 194 KB.** Context 390x844, `isMobile`, `hasTouch` (coarse
   pointer, no hover). Measured 185.6 KB hosted env, 184.7 KB local; 185.6 x 1.045 = 193.9,
   rounded up to 194. The entry prints as `/ (phone)`.
3. **The byte budget alone would not catch the grid reaching a phone.** The grid's chunk is
   13,765 bytes raw, 5,928 gzip (`gzip -c` of `0uxdu25pogqhk.js`), and the phone entry's
   headroom is 8.4 KB. So the phone entry carries `alsoForbid: ["cascadeReach", "hexagon"]`,
   the two strings 0175 matched on, and a downloaded chunk containing either is a FAIL, the
   same mechanism as `FORBIDDEN_SIGNATURES`. Positive control: the same two signatures put on
   the desktop entry, which does load the grid, print both against `0uxdu25pogqhk.js` and fail
   (output in the card's evidence). `guardForbiddenSignatures` stays on for both entries.
4. **Nothing else changed.** Every other route's budget is untouched; their figures before and
   after are identical (card evidence).

## What would make us revisit it

- Another card moves `/` by more than the headroom: re-derive from a run, as above.
- A phone-reachable feature that legitimately contains one of the two signatures (the strings
  are the grid's, not a package's): rename the signature rather than drop the check.
- OPS-028's sibling question, whether the 202 KB desktop figure is too heavy for the reel
  traffic, is the owner's call (0175 notes the `speed: 0` fallback).
