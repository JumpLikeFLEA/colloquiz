# 0241 — PROG-016: own notes on the notebook page

Status: built 2026-11-26 (#332). The write side of `/my/notebook` (0240), over migration 112's RPCs
(0238). No migration. Below is what the card left open and was decided unattended.

## Decisions

1. **Server Actions, one per write kind** (`app/(english)/my/notebook/actions.ts`): `saveNote` (add or
   edit) and `deleteNotebookItem` (an entry or a summary). Each calls one 112 RPC under the learner's
   session; ownership is the RPC's `auth.uid()`, so another learner's id answers `not_found`. A route
   handler would have needed its own fetch code in the client; an action is what `useActionState`
   takes, and it re-renders the page with `refresh()`.
2. **The form mirrors 112's rule in `lib/notebook/noteForm.ts`**: the same trim (space, tab, LF, VT,
   FF, CR, U+00A0) and code-point counting (`char_length`), so 200 emoji pass in the form as in SQL.
   The form refuses early and the action re-checks; the RPC decides. The 1,000-note cap is a PT429
   from the insert trigger, mapped to its own message.
3. **A new note opens Phrases, All courses.** It has no lesson (saving from a lesson is PROG-017), so
   under a course chip it would vanish on save. The action redirects to `/my/notebook`.
4. **"Add a phrase" is a native `<details>` above the list,** in the empty notebook too: otherwise a
   learner with nothing copied yet could not write their first note.
5. **Copied text has no Edit** (said, fix, summary); only Delete. Own notes have both.
6. **Delete confirms in place, naming what goes:** the phrase (and "all N recordings in this course"
   for a merged phrase, since 112 deletes every take's row of it), the fix's two sides, or "this
   summary". Each says the lesson's feedback stays and it cannot be undone; a said phrase adds that a
   listed phrase shows in To try again. Not a modal: a row-level `role="alertdialog"` region with
   "Yes, delete" focused.
7. **An already-deleted item (another tab) counts as done**: the action refreshes and the row is gone.
8. **A duplicate own phrase is allowed** (0236 section 4): a second row, its own note; deleting one
   leaves the other.
9. **Strings**: `noteFormCopy.ts`, EN/RU with the saved choice. The page hands one language's object
   to the client components; the confirmation text is built on the server.

## Tested

- `lib/notebook/noteForm.test.ts` (10 tests): empty and blank phrase, 200/201, note 500/501, a Cyrillic note
  (and 501 Cyrillic letters), 200 emoji, the trim, RPC outcomes including `not_found` and PT429.
- `lib/notebook/toTry.test.ts`: a merged phrase comes back to To try only once every take's row is
  gone; an own note of the same phrase changes nothing.
- `NoteForm.test.tsx` (4 tests): the empty-phrase and note-too-long refusals are shown and nothing is sent;
  the Cyrillic counter; an edit form starts from the note.
- `supabase/verify/112_notebook.sql`, local, `PROG-012 PASS: 112 full protocol (114 asserted cells)`.
  New cells: a Cyrillic note round-trips, 500 Cyrillic letters ok and 501 `note_too_long`; a duplicate
  phrase is a second row; deleting one deletes 1 and leaves the other. Cells already there cover the
  rest: blank, 201 and note 501 refused with 200/500 accepted; another learner's edit and delete
  `not_found` with the owner's as control; and a deleted said phrase, fix and summary not brought back
  by `voice_analysis_sweep()` (the copy recovery), in section 2 and again in section 3. After the run,
  0 seeded rows left.

## Measured (local stack, `next build` + `next start`, Edge)

- Browser run, 41 checks, 40 passed. EN and RU, all at 360px: 360/360 on load, with the add form open,
  with the empty-phrase error, with the note-too-long error over a 150-character word, after an add,
  with the edit form open, and with each confirmation open (said, fix, own, summary). Also checked: a
  note added, edited and deleted; Edit absent on a said phrase and on a fix; the said confirmation
  names the phrase and "2 recordings"; 0 page errors; 1280/1280.
- The failing check deleted "make up my mind" and expected it in To try. That phrase is on no lesson's
  list (the fixture's published voice blocks were read: only `prog014-fixture`'s two lists have
  phrases), so it is correctly absent. Rerun with a said row of "be about to", which is listed: To try
  before 0, after 1, with the control "on second thought" listed. The fixture's rows were backed up
  before the run and restored after (fix 1, own 1, said 2, summaries 2).
- `npm run budget`: `/my/notebook` 166.5 KB before, 169.3 KB after (limit 180); every other route
  unchanged.

Not measured: a phone, a screen reader, dark mode, the cap message in a browser.

## What would make us revisit this

- Learners want a note tied to a course from this page (today only PROG-017's lesson save gives one).
- Deleting by mistake is reported: an undo would need the row kept for a while, which the privacy
  text does not describe.
