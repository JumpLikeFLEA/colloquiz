# 0133 — PLAY-017: desktop matching, rows and bank side by side

## Context
Desktop is the main platform (owner, 2026-10-12). The pairs bank sat under the
rows and stuck to the viewport bottom (0039 Decision 5), covering rows while
the learner worked. 0055 rejected a side-by-side layout because "phone traffic
sees no benefit"; that premise is about phones and does not describe desktop.

## Decisions (made unattended)
1. At `lg` and up the rows and the bank share a grid
   `lg:grid-cols-[minmax(0,1fr)_16rem]`, `items-start`. The bank is a 16rem
   column, chips stacked, `lg:sticky lg:top-16` (the progress strip is 49px,
   measured), `max-h-[calc(100svh-5rem)] overflow-y-auto` so a long bank
   scrolls inside itself instead of leaving the viewport. The overflow is on
   the bank, not on an ancestor, so 0039 Decision 5's rule holds. After Check
   the bank is static (the 2026-10-12 rule), as before.
2. Below `lg` nothing changes: stacked, `sticky bottom-0`.
3. Supersedes 0055's rejection of side-by-side for `lg`+ only; 0055's
   full-width placed answer below the left content stays, and is what keeps a
   long placed answer from narrowing the row column.
4. **No wider band for practice blocks.** Practice cards stay at the 672px
   reading column (0043, 0079 Decision 11). At 672px the rows get about 1fr of
   the card minus 16rem + 1rem gap; the longest bank chip (138 characters,
   0055) wraps to a taller chip but the bank still fits (tallest measured
   bank 438px of a 820px cap). A wider band would make the matching card
   break out of the column its neighbours sit in, the alignment problem 0079
   D11 reversed for images. Revisit if a bank outgrows the cap.
5. `presentation: "sort"` (BucketRenderer) is untouched.

## Revisit if
A bank is taller than the cap in a real course (it then scrolls inside), or
the narrowed rows column wraps statements badly.

## Verification
Edge via Playwright against `npm run dev`, 1440x900, `future-imperfect`
lessons with matching items (vocabulary, applied-practice, grammar-drilling,
six-things-the-1960s-promised-us; 9 banks): bank 256px wide, 124-438px tall;
scrolling each card in 120px steps, rows overlapping the bank: 0 of all
samples; while the bank is stuck its top is 64px, below the 49px strip.
At 390px the bank stays full width (324px) and sticky, as before.
`MatchingRenderer.test.tsx` pins the classes and the pre/post-Check sticky
state; tap-to-fill and submit tests unchanged and passing.
