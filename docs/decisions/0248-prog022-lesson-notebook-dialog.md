# 0248 — PROG-022: "Add a phrase" from inside a lesson

Status: built (#342), 2026-11-27. Builds 0246's option A on its mechanism (c). No migration, no new
dependency, no hosted write.

## Context

0246 settled the shape: a `NotebookPen` button at the right end of the lesson's sticky strip, for
signed-in learners only, through the signed-in lazy lesson client, opening a dialog fetched on the
first tap. The open questions this card had were the form's reuse, how a save reaches the dialog
without touching the lesson, what success looks like, and how far the phone harness (OPS-045, 0247)
can show it.

## Decisions

1. **Rename.** `LinkedLesson` / `LinkedLessonPageClient` are `SignedInLesson` /
   `SignedInLessonPageClient` (0246's recommendation). `page.tsx` renders them for every signed-in
   learner, `askTeacher` optional; a signed-out visitor keeps `LessonPageClient`. Measured: the rename
   moved nothing on the anonymous path (266,210 B before and after the rename, step 1).

2. **The strip and frame are 0246's measured shape**, unchanged: `LessonFrame` passes an optional
   `stripAction`, the strip returns null only with no exercises and no action, draws bar and count
   only with exercises (`!!total &&`), and the button carries `ml-auto`.

3. **NoteForm is reused, not forked (owner, 2026-11-26).** It gained optional props: `action` (the
   notebook page's `saveNote` when absent), `hidden` (the lesson id), `errorExtra` (the expired
   session's sign-in link) and `autoFocus`; its `strings` prop now asks only for the fields it draws
   (`NoteFormFieldStrings`, a `Pick` of `NoteFormStrings`). Success reaches the dialog through the
   existing `onDone`, never a redirect. The notebook page passes none of the new props:
   `NoteForm.test.tsx` passes with no assertion edited (4 of 4), and `/my/notebook` printed 173,396 B
   before and 173,451 B after (+55 B: the new props and the `not_readable` string its copy type now
   needs).

4. **A separate Server Action, `addLessonNote`** (`lessonNoteAction.ts`), because `saveNote`
   redirects to `/my/notebook` after an add. It re-checks with `noteFormError`, answers
   `unauthenticated` itself when `getUser()` finds no user (`anon` has no EXECUTE on
   `notebook_add_note`, 112:538, so the RPC's permission error would otherwise read "failed"), calls
   `notebook_add_note(phrase, note, lessonId)` and lets the RPC decide `not_readable` and the PT429 cap.
   It neither redirects nor calls `refresh()`: re-rendering the lesson page would hand the player a new
   attemptId (0086, 0153).

5. **`not_readable` gets its own message** in `lib/notebook/noteForm.ts` (`NoteError`, `KNOWN`), with a
   test; before, it read "failed" (0246, "What PROG-022 must handle").

6. **Success stays in the dialog (owner, 2026-11-26, amending acceptance line 3's "the dialog closes
   and a role=status line").** The dialog shows its own state: `role="status"` "Added to your
   notebook" with focus moved there, a link to `notebookHref("phrases", courseId)`, "Add another" (an
   empty form, focus on Phrase) and Close (focus back to the button). Nothing is added to the strip.
   Reasons: the strip is shared with the anonymous path, which had 30 B left, so a second line would
   cost bytes there; it is a fixed `h-12` sticky row, so a line in it would keep it taller at 360px; a
   line under the band would shift the lesson; and the dialog is already open where the learner is
   looking.

7. **The dialog stays mounted after the first tap** and is opened and closed through its `open`
   prop, so it closes with its animation. `onCloseAutoFocus` focuses the button explicitly: WebKit
   does not focus a button on a tap, so Radix's own "focus what was focused before" would land on
   `<body>` there (the e2e test checks focus after Escape, the X and Close in both engines).

8. **Pinned to the top**: `top-4 translate-y-0`, `max-h-[calc(100dvh-2rem)] overflow-y-auto`. The e2e
   test reads the dialog's top after its open animation: 20 px or less in both engines. That is the
   only reading; that an on-screen keyboard does not cover it is reasoning, not measured (Playwright
   draws no keyboard).

9. **The notebook link is a `next/link` `Link`**, so the e2e test reaches `/my/notebook` by client
   navigation and a stale router cache would show (owner, 2026-11-26). The second note is checked with
   `page.goto`.

10. **Strings**: `lessonNoteCopy.ts`, English (lesson chrome, 0080 D5), imported only by
    `NotebookStripDialog`. Shared errors use the notebook's English wording. The button's own
    "Add a phrase" label sits in the button. Fields keep NoteForm's `text-base` (16px).

11. **Seed**: `play-006-smoke` gains `theory-lesson` (text only; no seeded published lesson had no
    exercise and no task) and `gaps-lesson` (one typed slots item; no seeded lesson had a typed gap,
    which the "typed inline input" test needs).

## Measured

`npm run budget:local` (Supabase `http://127.0.0.1:54321`), bytes printed beside KB (`budget.ts` now
prints them):

| route | before | after |
|---|---|---|
| free lesson, anonymous | 266,181 B | 266,206 B (stop at 266,210) |
| applied-practice, anonymous | 294,649 B | 294,674 B |
| `/my/notebook` | 173,396 B | 173,451 B |
| `/my` (both fixtures) | 179,398 B | 179,416 B |
| `/`, `/ (phone)` | 196,500 / 189,423 B | 196,502 / 189,425 B |
| course page, coh005 course page | 180,699 B | 180,701 B |
| `/login` | 295,029 B | 295,028 B |
| `/invite`, `/join`, `/completed`, `/my/messages` | 180,250 B | 180,250 B |
| `/runs/…f1a0`, `/runs/…f1a1` | 186,407 B | 186,407 B (f1a1 OVER its 179 KB, before and after; 0245) |
| `/my/settings` | 205,930 B | 205,930 B |

After step 1 (rename and strip slot, no button) the free lesson read 266,210 B, 0246's figure
exactly; with the button it reads 266,206 B. The 4 B fewer were not traced (hypothesis: chunk naming).
`/my`'s +18 B were not traced either.

Signed-in free lesson, scratch probe (cold, cache disabled, `prog002-learner` and `prog007-learner`):
333,916 B before; 336,672 B after step 1; 337,164 B with the button (0246's stub measured 337,088 B).
The first tap on "Add a phrase" fetches 28,321 B in 3 scripts (0246's stub dialog: 25.3 KB in 3).

At 360 (`e2e/lessonNotebook.spec.ts`, both projects): `scrollWidth/innerWidth` 360/360 for the strip
with the button, a lesson with no exercises, the dialog open, each refusal (empty, too long, note too
long, `not_readable`, the cap, an expired session) and the "added" state; 1280/1280 with the dialog
open (Chromium).

## What the phone harness drove, and what it didn't

- applied-practice drag: **chromium-pixel drove a touch drag** (CDP touch), captured by the
  **PointerSensor**; **webkit-iphone drove the KeyboardSensor** (Space, ArrowDown ×2, Space). A touch
  drag is not drivable in WebKit (0247), so the TouchSensor's 200 ms hold is **not tested** in either
  engine.
- **Finding:** in chromium-pixel, the first tap after a CDP-driven touch drag fires no click, whatever
  it lands on (the strip button and, as the control, the back link); the next tap does. The spec
  absorbs it with a tap on the exercise prompt. Hypothesis, not checked: an artifact of CDP touch
  emulation, not something a phone does.
- **Not tested:** iOS Safari, Android Chrome, Instagram and Telegram in-app browsers (no devices;
  0246 Decision 6); the on-screen keyboard.
- **Hypothesis, not tested:** a Supabase token refresh during `addLessonNote` writes a cookie, and a
  cookie written in a Server Action makes Next return a fresh render of the page
  (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`, "Understanding Cookie
  Behavior in Server Functions"), which would pass the player a new attemptId. Not reproduced: no run
  here refreshed a token mid-save.

## Privacy

A note added from a lesson is an own row, which `linked_student_notebook` never returns (112:652).
The existing check is `supabase/verify/112_notebook.sql:408-420`: the learner adds own notes in L1
(a lesson teacher `te` edits) and X2, and "own notes reach no teacher" expects `2/0`. Re-run on the
local stack: `PROG-012 PASS: 112 full protocol (114 asserted cells)`.

## What would make us revisit

- A phone report of the keyboard covering the dialog, or of a lost answer after a save.
- The cookie-refresh hypothesis above observed (then: a Route Handler instead of a Server Action, the
  AskTeacher shape).
- Anything else that needs room on the anonymous strip: it has 34 B left (266,206 of 266,240 B).
