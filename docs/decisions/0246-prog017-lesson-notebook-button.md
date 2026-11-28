# 0246 — PROG-017: saving a phrase from inside a lesson is a strip button, signed in only

Status: decided by the owner in chat, 2026-11-26 (#336). Probed on the throwaway branch
`spike/prog017` (commit `84c7441`, left for the owner, not merged). No migration, no new dependency,
no hosted write. The build is PROG-022; the phone harness it is tested with is OPS-045.

## Context

0235 settled input 6: a learner adds a phrase, with an optional note, "from any lesson (text-only
courses included)", and the source course and lesson are recorded automatically. Migration 112
already takes the lesson: `notebook_add_note(p_phrase, p_note DEFAULT NULL, p_lesson_id DEFAULT
NULL)` (`supabase/migrations/112_notebook.sql:500`) records the lesson and its titles, or answers
`not_readable` when `can_read_lesson` refuses (112:525-526). What was open is how the learner gets
there from the lesson page, and whether a signed-out visitor can save at all (0235 input 7).

Two constraints shape every option:

- **The free lesson has no room.** `/courses/future-imperfect/true-or-false` printed 259.9 KB of
  its 260 KB budget on the local stack (0235, and `npm run budget:local` on 2026-11-26, below).
- **The player already owns the long-press.** Drag items start on a touch held 200 ms:
  `useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })`
  (`app/components/lesson-player/practice/useLessonPlayerSensors.ts:35`). Typed gaps and text
  inputs own focus and the on-screen keyboard.

## Options

The general claims below about iOS and in-app browsers are **reasoning from the chat of
2026-11-26, not measurements**: the owner has no iOS or Android test devices, so none of them was
run on a phone.

**A. A notebook button in the lesson's sticky strip** that opens a form in a dialog. The learner
types the phrase, or copies it with the phone's own menu and pastes it in. Clashes: none with drag
(the strip is outside the player's column and is never an ancestor of matching's bank, 0079 D5,
0039 Decision 5); with text inputs, only that the dialog takes focus while open, so the inputs
must keep their text across it (a PROG-022 test). The risk is the on-screen keyboard covering the
dialog, which is why it is pinned to the top of the screen.

**Pre-filling A's form from the current text selection.** Reasoning: iOS gives a page no way to add an
item to its own selection menu, so reading the selection at the moment of the tap competes with
the native callout, and in-app browsers differ in how they keep a selection when focus moves.
None of it can be shown to work without the phones. Left out of v1, not designed away. Superseded in part by 0253.

**An action over selected text.** Same reasoning as the pre-fill, plus the gesture clash measured above:
the long-press that starts a selection is the gesture that starts a drag here (TouchSensor, delay
200). Not picked. Superseded in part by 0253.

**B. Save chips under author-marked phrases** (theory phrases, the fix in the AI feedback, an
explanation). It needs authoring: the existing `english` inline mark tags language, not phrases
worth keeping (it marks "Yes", "OK", "-ing"). Counted on 2026-11-26 over `authored/courses/*.json`
(local data, gitignored) without the two fixture files `auth003-smoke-test.json` and
`voice-dry-run.json`: 16 course files, `english` in 9, `"type": "example"` blocks in 7
(`grep -o '"english"'` / `grep -o '"type": *"example"'` per file). B would need a new mark, an
editor button, new import prompts and a marking pass over every course, and its renderer check
would cost every lesson's first load, the free lesson included. Not picked.

**C. A pick mode** (tap the first word, then the last). The most code: a word-splitting renderer
over runs, line breaks, tables and lists. Word-sized targets are also smaller than the 44px the app
uses (`min-h-11`), so mis-taps on short words are likely (reasoning, not measured). Not picked.

B and C stay possible later, as more ways into A's dialog.

## Decision (owner, 2026-11-26)

1. **Option A.** An icon button (`NotebookPen`, 44px, "Add a phrase") at the right end of the
   lesson's sticky strip opens a dialog pinned to the top of the screen: Phrase, Note (optional), a
   read-only "From: <course> · <lesson>" line, Save. The dialog is a chunk fetched on the first tap
   (the AskTeacher precedent, 0153).
2. **Signed-in learners only.** The anonymous free lesson's first load does not change in shape:
   no button, no dialog code. PROG-018 (signed-out notes in browser storage, moved at sign-in) is
   dropped. This takes the alternative 0235 input 7 left open.
3. **For a signed-in learner, the strip also renders on a lesson with no exercises**: the back
   link and the button, with no bar and no count. This supersedes 0079 D5 in part.
4. **The phone matrix is replaced by Playwright in two engines** (decision 6 below).

## Mechanism: the signed-in lazy lesson client (LinkedLesson widened)

0153 ("Budget") already measured the two obvious shapes on this page, so they were not rebuilt:
`page.tsx` importing a client component put its code in a chunk shared with the ordinary lesson
client (free lesson 257.2 → 258.3 KB), and a `"use client"` `next/dynamic` stub cost 0.2 KB by
itself. The free lesson had 0.1 KB of room.

The probe's mechanism (c), not to be confused with option C, widened the lazy boundary that is already paid for. `LinkedLesson.tsx` is a
`"use client"` `next/dynamic` stub whose bytes are already inside the 259.9 KB; until now only
`page.tsx`'s `if (ask)` branch rendered it. On the branch:

- `page.tsx` renders `LinkedLesson` for every signed-in learner, `askTeacher` optional. Signed-out
  visitors keep `LessonPageClient` exactly as it is.
- `LinkedLessonPageClient` without `askTeacher` is `LessonPageClient` plus the button: the plain
  `practiceRenderer` and `voiceTasks`, no Ask links. With it, the Ask code path is unchanged.
- It passes a stub button to `LessonFrame` as an optional `stripAction`, which `LessonFrame` hands
  to `LessonProgressStrip`. The strip returns null only when there are no exercises AND no action,
  renders bar and count only when there are exercises, and puts the action last (the button
  carries `ml-auto`, so no spacer element is needed).
- The stub button opens a stub Radix Dialog (`app/components/ui/dialog`, one input) through its
  own `next/dynamic`.

### Figures (local stack, `next build` + `next start`, cold, cache disabled)

Exact bytes from a scratch copy of `scripts/budget.ts` on the branch
(`scripts/probe-prog017/probeBudget.ts`, `--local`), which prints bytes beside the KB.

| route / state | before (main code) | after (c) |
|---|---|---|
| free lesson, anonymous | 259.9 KB (266,181 B) | 260.0 KB (266,210 B), +29 B |
| applied-practice, anonymous | 287.7 KB (294,649 B) | 287.8 KB (294,678 B), +29 B |
| free lesson, signed in as `prog002-learner` (not linked) | 326.1 KB (333,916 B) | 329.2 KB (337,088 B), +3.1 KB |
| free lesson, signed in as `prog007-learner` (not linked) | 326.1 KB (333,916 B) | 329.2 KB (337,088 B), +3.1 KB |
| first tap on "Add a phrase" | — | 25.3 KB in 3 scripts (stub dialog) |

- The limit is 260 KB = 266,240 B, so the anonymous free lesson has **30 B of room** after (c).
  The 29 B are `LessonFrame`'s and the strip's handling of the optional slot; nothing else on the
  anonymous path changed. A first version of the strip (a ternary with a spacer `<div>`) measured
  266,219 B (+38 B); the `!!total &&` form with `ml-auto` on the button is the one kept.
- `npm run budget:local` after (c): free lesson 260.0 KB of 260, not flagged; every other route
  as before except applied-practice 287.7 → 287.8 KB. `/runs/…f1a1` reads 182.0 of 179 before and
  after (over before this card).
- Which client each fixture gets today: neither fixture is linked. `prog002-learner`'s only
  `teacher_student_links` row has `ended_at` 2026-10-16; `prog007-learner` has none. Both pages
  showed 0 "Ask the teacher" links, so both get `LessonPageClient` on main, and the lazy client
  (Ask code included) after (c). That is the +3.1 KB.
- The first-tap figure is the stub dialog's; PROG-022's real dialog and form will be larger and
  are measured there.

**Chosen: (c).** It leaves the anonymous free lesson under its budget (the 29 B are not zero,
which is stated here rather than rounded away), and it is the only shape that does: 0153's two
measured shapes each cost the anonymous path 0.2 KB or more. PROG-022 builds on (c) and has 30 B of
anonymous headroom: any change to `LessonFrame` or the strip that the anonymous path ships is
measured in bytes, not KB.

**Accepted (owner, 2026-11-26):** the 29 B on the anonymous free lesson, 266,181 → 266,210 of 266,240 B.

**Rename, recommended for PROG-022.** "Linked" no longer describes who gets `LinkedLesson` /
`LinkedLessonPageClient`: every signed-in learner does. Renaming them (for example to
`SignedInLesson` / `SignedInLessonPageClient`) is PROG-022's, with its doc comments and 0153's
note below; the probe did not rename anything.

## What a signed-out learner loses

Saving a phrase before signing up. The notebook was signed-in only anyway (0235 input 1), so a
visitor never had a place to read a saved phrase; with PROG-018 dropped, they have nothing to
save into either. Its cost is gone with it: a versioned local store, a migration widening
`pending_claims` for the cross-browser path, an uploader independent of the lesson page, and
`course_delete_blockers` reading the new payload (PROG-018's acceptance).

## Decision 6 — the phone matrix becomes Playwright in two engines

PROG-017's acceptance line 3 (iOS Safari, Android Chrome, Instagram and Telegram in-app browsers,
run on real phones) is amended by the owner on 2026-11-26. The owner has no test devices. Phone
behaviour is checked in Playwright:

- **WebKit with the iPhone profile** stands in for iOS Safari and every iOS in-app browser, which
  all run WebKit.
- **Chromium with the Pixel profile** stands in for Android Chrome and Android in-app browsers.

A pass is evidence about the engines, not about any phone: real-device cells read "not tested".
The harness is its own card, OPS-045.

Checked on the branch that WebKit runs on this machine: `npx playwright install webkit` downloaded
WebKit 26.6 (playwright webkit v2359, `@playwright/test` 1.63.0). With `devices["iPhone 13"]` and
the viewport width set to 360: the anonymous free lesson printed `scrollWidth/innerWidth 360/360`,
`pointer: coarse` true, the iPhone user agent; signed in as `prog002-learner`, a `tap()` on
"Add a phrase" opened the stub dialog, `360/360`. One finding for OPS-045:
`navigator.maxTouchPoints` read 0 in that context even with the descriptor's `hasTouch`, so a spec
must not use it to tell touch apart.

Not measured on the branch: the strip on a lesson with no exercises, and the stub at 1280.

## What PROG-022 must handle

Both are already in PROG-022's acceptance; listed here so they are not rediscovered.

- `noteRpcOutcome` (`lib/notebook/noteForm.ts`) knows no `not_readable`, so today that refusal
  would read "failed". PROG-022 gives it its own message.
- `saveNote` (`app/(english)/my/notebook/actions.ts`) redirects to `/my/notebook` after an add. The
  lesson needs an action that does not redirect, or `NoteForm` takes one without a fork.

## What would make us revisit

- Learners ask to save before signing up (then PROG-018's shape comes back as a card).
- Typing the phrase is reported as the friction (then B or C, as more ways into A's dialog).
- A phone report of the on-screen keyboard covering the dialog.
- The anonymous free lesson needs more than its 30 B for anything in `LessonFrame` or the strip:
  then a separate route for signed-in learners (0153's "what would reach zero"), moving other bytes
  off the anonymous path, or a budget decision, which is the owner's.
