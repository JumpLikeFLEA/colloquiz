# 0256 — PROG-024 built: the Save chip under the selection, and the selection colour

Status: built (card PROG-024, #346). Implements 0255. Supersedes 0254 Decision 6 (the bar's
placement against the strip's sticky root); every other 0254 decision stands. No migration, no new
dependency, no hosted write.

## Context

0255 moved the Save control from a bar under the lesson strip to a chip under the learner's
selection, removed the bar rather than fixing its lag, and coloured the selection in the surface's
light violet. This file records how it was built and what was measured. Decided unattended under
`--no-approval`: Decisions 2, 3, 4 and 6 below.

## Decisions

1. **The bar is gone.** `SelectionSaveBar.tsx` became `SelectionSaveChip.tsx`; its state machine,
   refusals, 8 s timer, `pressing` guard, saved-phrase map and the dialog hand-off are copied over
   unchanged. NotebookStripButton still owns the dialog and still renders the chip, but the chip is
   portalled to `<body>`, so the strip's action slot holds only the button again (PROG-022's shape,
   which `LessonStrip.notebook.test.tsx` asserts once more). LessonProgressStrip and LessonFrame are
   untouched. The chip is rendered only while it shows: hidden means absent from the DOM, not an
   empty box. Its attribute is `data-selection-chip` (was `data-selection-bar`), still in
   `lessonSelection`'s exclusion list, though from `<body>` it is outside the lesson scope anyway.
   The scope and the strip are now found from the strip button's ref, since the chip's own node is
   no longer inside them.

2. **Placement is pure** (`lib/notebook/chipPlacement.ts`, `placeChip`, 6 unit tests). Document
   coordinates in and out: the anchor is the selection's first-line top, last-line bottom and end x
   (the last client rect with a width, plus `scrollX`/`scrollY`), read on each counting selection
   change and on resize. The chip is `position: absolute` in `<body>` (which is not positioned, so
   the initial containing block is the document origin) and is placed in a layout effect, before
   paint, from its own measured size, so it moves with the text on scroll with no scroll listener.
   When the selection stops counting (a tap collapsed it), the anchor is kept, so a saved chip stays
   where the selection was.
   - **Gap: 28 px** under the last line (`CHIP_GAP`), chosen as room for a phone's end handle (a
     teardrop roughly 20-24 px tall under the line). **Not checked against a real handle.**
   - Centred on the selection's end, clamped **16 px** (`CHIP_EDGE`) inside both sides.
   - **Flipped** above the first line, by the same gap, when below would end past the viewport bottom
     less 16 px; then kept at least 16 px under the viewport top.
   - Hypothesis, unverified (0255): a phone draws its own menu above the selection, which is why
     below is the default. Flipping puts the chip where that menu may be.

3. **The chip's look.** Ready and saving: the violet button alone (unchanged classes) plus
   `shadow-offset`. Every other state: a panel, `rounded-xl border-2 border-ink bg-card p-1
   shadow-offset`. Saved is two rows (the status and the X, then Add a note, Undo, Notebook) instead
   of the bar's one wrapping row. Width `w-max`, at most `min(22rem, 100vw - 2rem)`; `z-30`, above
   the strip's `z-20` and below Radix dialogs. Existing classes and tokens.

4. **Selection colour:** `.surface-alina ::selection, .surface-alina::selection` with
   `background-color: var(--brand-subtle)` and `color: var(--brand-text)` in `app/globals.css`.
   The tokens already have light and dark values on the surface (0163). The highlight's height is
   untouched. Applies to everyone on the English surface, signed in or not, and to the English
   sign-in screen's wrapper (it carries `surface-alina`, 0169). Studio and Colloquiz have no
   `surface-alina` and keep the browser's default. `.design-sync/tw-input.css` was not regenerated.

5. **Signed-out stays chip-free.** Only SignedInLessonPageClient renders NotebookStripButton, so the
   signed-out path draws no chip and downloads none of it (budget below).

6. **e2e adjustments, not behaviour changes.** The timer test taps the lesson title instead of the
   long paragraph, which the chip now covers. The scroll test sets a 480 px tall viewport, because the
   fixture lesson does not scroll on the Pixel 7's 839 px; at that height the chip is flipped, so the
   scroll case is measured flipped.

## Measured

`npm run e2e` (webkit-iphone, chromium-pixel, 360 px, touch, local stack): **64 passed**, every
PROG-022 and PROG-023 case included. Selections are made from code; the long-press is not emulated.

Placement, printed (client px; WebKit first, Chromium second):

| case | selection | chip | flipped |
|---|---|---|---|
| "on second thought" | bottom 412.625 / 412.25 | top 440.625 / 440.25 (gap 28.0) | false |
| left edge, "This" | end x 45 / 44.1 | left 16 / 16 | false |
| right edge, "saving" | end x 342.2 / 342.2 | right 344.4 / 344.4 (16 px inside 360) | true (WebKit, ih 664) / false (Chromium, ih 839) |
| last line, viewport ih 443 | top 394.6 / 394.25 | bottom 366.6 / 366.25 (28 above) | true |
| scroll by 120 (ih 480) | scrollY 0 → 120 | offset to selection bottom −90 → −90; chip top 322.6 → 202.6 / 322.25 → 202.25 | true |

At 1280 (Chromium, saved): chip top 473 under a selection bottom of 445; `scrollWidth/innerWidth`
1280/1280.

`scrollWidth/innerWidth` 360/360 in both engines in: hidden, ready, chip at the left edge, chip at
the right edge, flipped above, too long, saving, saved, removed, refused (failed, not_readable,
note_cap, unauthenticated), and the dialog in edit mode before and after its save.

Selection colour, `getComputedStyle(el, "::selection")`, both engines identical:

- light: background `rgb(242, 240, 252)`, colour `rgb(91, 63, 217)`;
- dark (`colorScheme: dark`, `.dark` on `<html>`): background `rgb(43, 35, 81)`, colour
  `rgb(165, 149, 234)`;
- signed out, light: the same as light (the colour is CSS, for everyone);
- plain `/login` (Colloquiz, no `surface-alina`): background `rgba(0, 0, 0, 0)`, the engine default.

Screenshots of a selected line, light and dark, in both engines, were taken by the spec
(`e2e/.results/…/selection-{light,dark}.png`, not committed) and looked at: violet tint behind violet
text in light, dark violet behind light violet text in dark.

`npm run budget:local`, before and after: **identical on all 17 routes**, in bytes (anonymous free
lesson 266,207 B both times, limit 266,240; `/` 196,512; `/ (phone)` 189,435; applied-practice
294,675; course page 180,700; `/login` 295,028; `/my` 179,416; `/my/notebook` 173,545;
`/my/settings` 205,930; `/invite`, `/join`, `/completed`, `/my/messages` 180,250; `/runs/…f1a0` and
`/runs/…f1a1` 186,407, f1a1 over its 179 KB before and after, the known 0245 gap). No change to
trace.

Signed-in free lesson (0254's probe: fresh desktop Chromium context, cache disabled, Script
`encodedDataLength`, networkidle), prog002 and prog007 both: **340,982 B before → 341,515 B after**
(+533 B, 20 scripts both times): the placement module and the portal.

## Not tested

- A real phone: iOS Safari, Android Chrome, Instagram's and Telegram's in-app browsers.
- The phone's own selection handles and menu against the chip (the 28 px gap is a guess).
- Hypothesis, unverified (0255): iOS Safari may keep its system tint whatever `::selection` says.
  WebKit in Playwright computes the violet; that is not proof about iOS.
- Rotation and on-screen keyboard resizes (only `resize` is listened to).

## What would make us revisit

0255's list stands. Also:
- The chip lands under the phone's handle or menu on a real phone: change `CHIP_GAP` or the side.
- A selection inside a scrolling box (a wide table's own scroller): the chip is in document
  coordinates, so it does not follow that box's scroll. Not fixed here.
