# 0253 — PROG-023: save a phrase by selecting it in a lesson

Status: decided (owner, chat, 2026-11-28); card PROG-023, not built. No migration, no new
dependency, no hosted write.

Supersedes in part 0246: "An action over selected text" (not picked there) and "Pre-filling A's
form from the current text selection" (left out of v1 there). This file takes up the first; the
pre-fill stays out (see "Not built").

## Context

0246 turned down an action over selected text and left pre-filling the strip button's form from a
selection out of v1, because neither could be shown to work without phones. Its revisit line
"Typing the phrase is reported as the friction" has fired: on 2026-11-28 the owner asked for saving
by selection, with no typing.

## Decisions (the owner's picks, chat, 2026-11-28)

1. Selecting text in a lesson offers to save it; one tap saves it. The strip button and its typed
   form (PROG-022, 0248) stay as they are: a second way into the same save.
2. The Save bar sits directly under the lesson strip, not next to the selection. To be revisited
   from learner feedback.
3. A tap saves at once; afterwards the bar offers Add a note and Undo.
4. Russian text is saved like anything else.
5. Signed-in only (0246 Decision 2).

## Why the top

Reasoning, not measurement: no phone was used.

- The phone's own selection menu is drawn next to the selection, and a page cannot add to it or
  move it, so a fixed place does not have to dodge it.
- Matching's bank already holds the bottom on phones (`sticky bottom-0`,
  `app/components/lesson-player/practice/MatchingRenderer.tsx:421`).
- Hypothesis, unverified: Android Chrome may open its own panel at the bottom for a selection.
- Hypothesis, unverified: iOS Safari's toolbar moves fixed-bottom elements.
- The strip is where the notebook button already is (0248).

## Known trade-offs, for feedback

- While the bar shows, it covers about one row of text under the strip, so a phrase selected right
  there is hidden under it (its preview is in the bar).
- The phone's menu may overlap the bar when the selection is in the first lines under it.

Neither can be checked without a phone.

## What a Playwright pass proves

A selection made from code (a Range, then `addRange`), in WebKit and Chromium, proves the bar's
logic and the save. The long-press, the phone's own menu and the Instagram and Telegram browsers
stay "not tested". It stays safe because the strip button is unchanged: if selection never brings
the bar up somewhere, nothing is lost.

## Not built

A chip next to the selection (the alternative to Decision 2), pre-filling the strip button's dialog
from a selection, and saving before sign-up.

## What would make us revisit

- Learners say the bar is missed or in the way (then a chip next to the selection).
- A phone report of the phone's menu covering the bar.
- Accidental saves reported (then a confirm step, or the dialog pre-filled from the selection).
- The bar never appearing in an in-app browser.
