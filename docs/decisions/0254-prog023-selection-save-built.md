# 0254 — PROG-023 built: the Save bar under the lesson strip

Status: built (card PROG-023, #345). Implements 0253's decisions; the owner's plan review
(chat, 2026-11-28) added corrections 1-5 below. No migration, no new dependency, no hosted write.

## Context

0253 decided the shape: select text in a lesson, one tap saves it to the notebook, from a bar
directly under the lesson strip, signed in only. This file records how it was built and what was
measured.

## Decisions

1. **The probe came first (owner correction 1).** Before any app code, a scratch spec (deleted)
   checked that both phone engines fire `selectionchange` for a selection made from code. Printed:

   ```
   [webkit-iphone] forward "second thought" -> selectionchange 1
   [webkit-iphone] backwards {"text":"second thought","anchor":33,"focus":19,"start":19,"end":33} -> total 2
   [webkit-iphone] field {"count":11,"anchor":"SPAN","anchorTag":"SPAN","active":"INPUT","text":"hello"}
   [chromium-pixel] forward "second thought" -> selectionchange 1
   [chromium-pixel] backwards {"text":"second thought","anchor":33,"focus":19,"start":19,"end":33} -> total 2
   [chromium-pixel] field {"count":4,"anchor":"SPAN","anchorTag":"SPAN","active":"INPUT","text":"hello"}
   ```

   The card's stop ("WebKit does not fire it") did not fire.

2. **The phrase rule is pure** (`lib/notebook/selectionPhrase.ts`). It gets the selection's text and
   the characters just outside it, read from the Range's `startContainer`/`startOffset` and
   `endContainer`/`endOffset`, never from the anchor and focus, and only when the container is a
   Text node (owner correction 2). The probe shows why: a backwards selection has anchor 33 and focus
   19, while start and end stay 19 and 33. A cut word is extended only when the selection's own edge
   character is a word character, so a selection that begins or ends with a space never pulls in the
   neighbouring word. A borrowed run loses a leading or trailing apostrophe or hyphen, which keeps an
   opening quote out. Length uses `noteLength` and `PHRASE_MAX` from `noteForm`. An ellipsis typed
   as `...` is kept, like `…`.

3. **Which selections count** (`lessonSelection.ts`). Both ends must be inside the lesson scope, a
   `display: contents` wrapper that SignedInLessonPageClient draws round both of its branches. Neither
   end may be inside an `input`, `textarea`, `select`, contenteditable, `[aria-roledescription]`
   (dnd-kit), `[role=dialog]`, the strip or the bar. On top of that, a focused field always refuses
   (owner correction 3). The probe showed that a selection inside an input reports the parent `SPAN`
   as its node, so `closest("input")` alone misses it. The e2e makes the field selection the way a
   learner would: tap the input, type, then `setSelectionRange` and Shift+ArrowLeft. It never puts
   an `addRange` round the field. The text is `Selection.toString()`, not `Range.toString()`.
   Assumption, not measured: across paragraphs the Selection's text keeps a break between them
   where the Range's would glue the last and first words together. No e2e selects across blocks.

4. **One dialog owner (owner correction 4).** NotebookStripButton owns the dialog. The strip button
   opens it in add mode. The bar's "Add a note" opens it in edit mode with the saved row's id and
   phrase. The bar's 8 s timer does not run while the dialog is open. On close, focus goes to the
   bar's "Add a note" while it is still connected, otherwise to the strip button (WebKit does not
   focus on tap, 0248). Edit mode has its own title ("Add a note"), its own success line ("Note
   saved") and no "Add another". Its Cancel closes the dialog. NoteForm gained `onCancel` for this,
   because its Cancel used to call `onDone`, which here would have shown the success state.

5. **Saved phrases are keyed by `phraseKey` (owner correction 5)**, so a capitalised repeat counts
   as the same phrase. Within one page view, a saved phrase selected again shows the saved state,
   with no Save button, until it is undone.

6. **Placement against the strip's sticky root works.** The bar is `absolute inset-x-0 top-full`
   inside the action slot. The strip's root is `position: sticky`, which is a positioned box, and its
   inner row is not, so the bar resolves against the root. LessonProgressStrip and LessonFrame are
   unchanged. `top-full` is the root's padding edge, so the bar covers the strip's 2px bottom border
   and draws its own (measured: bar top 335.5, strip bottom 337.5, in both engines).

7. **Taps keep the phrase.** The bar takes its phrase on `selectionchange` and keeps it in state.
   While a pointer is down inside the bar, a collapsing selection does not hide it, so a tap that
   clears the highlight still reaches Save. The Save button's `mousedown` is prevented, so a desktop
   click keeps the selection.

8. **Refusal wording is shared, not copied.** `selectionSaveCopy.saveRefusals` holds note_cap,
   not_readable, unauthenticated and failed. `lessonNoteCopy.form.errors` spreads them, so the bar
   and the dialog read the same strings. Undo has its own two lines ("…wasn't removed", "Couldn't
   remove it"), and a refused Undo offers Undo again.

9. **The fixture lesson.** `selection-lesson` (play-006-smoke, ordinal 10) holds an English sentence,
   a Russian line and a 230-character paragraph. It is a new lesson because the seed script publishes
   a lesson's document only the first time. Editing `theory-lesson` left its old version live: a psql read after re-seeding showed its
   published document still had 2 blocks and no Russian text.

## Known trade-offs (0253's, plus one)

- While it shows, the bar covers about one row under the strip. The e2e met this in WebKit: a tap
  on the first sentence under the strip landed on the bar's Notebook link (the timer test now taps
  lower).
- The phone's own selection menu may overlap the bar.
- **Added (owner, plan review):** at `lg` the matching bank is sticky at `top-16`
  (MatchingRenderer, 0133), so the bar can cover its top while both show. Accepted, since the bar
  only shows while text is selected or just after a save.

## Measured

`npm run budget:local` (local stack), before → after:

| route | before | after |
|---|---|---|
| free lesson, anonymous | 266,206 B | 266,207 B (limit 266,240) |
| applied-practice | 294,674 B | 294,675 B |
| `/` / `/ (phone)` | 196,519 / 189,442 B | 196,512 / 189,435 B |
| course page, coh005 | 180,701 B | 180,700 B |
| `/my/notebook` | 173,451 B | 173,545 B (NoteForm's `onCancel`) |
| `/login`, `/my`, `/my/settings` | 295,028 / 179,416 / 205,930 B | same |
| `/invite`, `/join`, `/completed`, `/my/messages` | 180,250 B | same |
| `/runs/…f1a0`, `/runs/…f1a1` | 186,407 B | same (f1a1 OVER its 179 KB before and after, 0245) |

**The anonymous free lesson's +1 B, traced.** A per-script probe on both builds differed in one
chunk only: 8,568 B `0fl4a_106k.48.js` became 8,569 B `0aqndi6wa397r.js`. That chunk holds
SignedInLesson's loader, whose string `"static/chunks/0n_.gpn5czt_p.js"` (module 110831) names the
signed-in chunk by its hash. The signed-in chunk changed, so its name changed, and the new string
compresses 1 B larger. No code was added to the signed-out path. Any change to the signed-in chunk
moves this figure by a byte or so (0248 recorded 4 B, untraced).

Signed-in free lesson (scratch probe, cold, cache disabled, prog002 and prog007): 337,164 B before
(0248's figure, reproduced) → 340,982 B after (+3,818 B, in 20 scripts both times). The first tap on
"Add a phrase" fetches 28,321 → 28,037 B in 3 scripts: the shared refusal strings moved to the first
load. The first tap on "Add a note" fetches 28,037 B in 3 scripts, the same dialog chunk. No budget
covers the signed-in lesson, and none was raised.

At 360 (`e2e/selectionSave.spec.ts`, webkit-iphone and chromium-pixel, touch), `scrollWidth/innerWidth`
360/360 in: hidden, ready, too long, saving, saved, removed, refused (failed, not_readable, note_cap,
unauthenticated), and the dialog in edit mode, before and after its save. 1280/1280 once, with the bar
saved (Chromium). Rows after a save and a second selection of the same phrase: 1 in both engines.

Privacy: a saved selection is an own row, which `linked_student_notebook` never returns (112:652).
The check 0248 relied on is `supabase/verify/112_notebook.sql:408-420`. Re-run on the local stack:
"own notes reach no teacher … got 2/0 (want 2/0)", "PROG-012 PASS: 112 full protocol (114 asserted
cells)". No new check added.

## What the phone harness drove, and what it didn't

- Every selection was made from code. The long-press, the phone's own selection handles and menu,
  and the on-screen keyboard were not emulated.
- applied-practice, after the bar showed and hid: chromium-pixel drove a CDP touch drag
  ("pointerdown → PointerSensor"); webkit-iphone drove the KeyboardSensor, as in 0248. A WebKit
  touch drag is not tested.
- **Not tested:** iOS Safari, Android Chrome, Instagram's and Telegram's in-app browsers.

## What would make us revisit

0253's list stands. Also:
- A report that tapping Save loses the phrase on a real phone (Decision 7's `pressing` guard is
  untested by a real long-press).
- A learner editing the phrase in "Add a note": the bar's saved-phrase map keeps the original
  phrase's key, so selecting the edited text shows Save again. Accepted for v1.
