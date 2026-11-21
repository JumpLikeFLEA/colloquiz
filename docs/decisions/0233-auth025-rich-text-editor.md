# 0233 — A rich-text editor with line breaks in every field (AUTH-025)

Owner, 2026-11-20 (the editor and its dependency, recorded in #323's body).
Implemented 2026-11-21, `work on AUTH-025 --no-approval`.

Supersedes **0033 Decision 3** (the run-by-run inline control) and **0224
Decisions 1 and 4** (line breaks in the voice prompt only; the `multiline`
textarea runs). 0224 Decisions 2 and 3 still describe how a voice prompt is
read and drawn; Decision 2's trap is gone (below).

## Context

Authors found the list of "runs" confusing: each run a separate input with
Em / EN / A / B buttons, and "+ Add run" to split a sentence so one word can be
marked (0033 Decision 3, chosen because a range-selecting editor needed a new
npm dependency). They also wanted Enter to start a new line wherever they
type, not only in the voice and writing prompts (0224, 0225). The owner chose
a real rich-text editor on 2026-11-20, which approves the dependency.

## Options

- **A. Tiptap (ProseMirror) with only the nodes and marks the schema stores.**
  The schema is closed by construction: an unregistered node or mark cannot
  enter the document, so a paste is filtered by the same rule that defines the
  field. Its JSON is the ProseMirror shape, convertible without the package.
- **B. A plain `contenteditable` with our own selection and mark handling.**
  No dependency, but paste sanitising, undo, and mark toggling over a
  selection are exactly what an editor library exists for, and each is a place
  to get stored content wrong.
- **C. Keep the runs, add a textarea per run.** Fixes Enter, not the
  complaint about runs.

## Decision

1. **A, pinned exactly at 3.32.3** (`@tiptap/core`, `react`, `pm`,
   `extension-document`, `-paragraph`, `-text`, `-hard-break`, and
   `@tiptap/extensions` for `UndoRedo`). 3.35.0 was the latest on 2026-11-21
   but one day old; 3.32.3 was published 2026-11-05. `npm audit` listed no
   advisory in the Tiptap or ProseMirror packages after install.
2. **Schema** (`richTextExtensions.ts`, Studio only): one paragraph of text and
   hard breaks, and four marks named exactly as stored: `emphasis`, `english`,
   `mark_a`, `mark_b`. `mark_a` and `mark_b` carry ProseMirror `excludes` for
   each other (0022 Decision 4). Enter, Shift-Enter and Mod-Enter insert a hard
   break that keeps the marks around the cursor; a heading's field ignores all
   three, and a pasted line break there becomes a space.
3. **The stored shape does not change.** Still `InlineRun[] = { text, marks? }`;
   a line break is `\n` inside a run's text (0224 Option A). No migration, no
   SQL change. `lib/lessons/richTextDoc.ts` converts both ways with no editor
   import: `runsToDoc` / `docToRuns`, merging adjacent runs with the same marks,
   marks in `INLINE_MARKS` order, a hard break carrying its run's marks, and an
   empty field read as `[{ text: "" }]` so validation refuses it as before.
   Round trip over every `lesson_versions` row on the local stack
   (`scripts/rich-text-roundtrip.ts`): `documents=21 inline_fields=1597
   unchanged=1597 normalized=0 with_line_feed=10 failures=0`.
4. **Every inline field takes `\n`.** `InlineContentSchema`'s runs allow it
   (CR/CRLF stored as LF, tabs and other control characters still refused).
   A heading's text alone is single-line (`SingleLineInlineContentSchema`): a
   level-1 heading is a chapter title (0128) and `dropTitleHeading` compares it
   with the lesson title. `MultilineInlineContentSchema` is an alias, so 0224
   Decision 2's trap (a multi-line prompt failing a single-line parse and
   showing nothing) no longer exists; the three Studio readers now name
   `InlineContentSchema`.
5. **Plain practice strings take `\n`:** every type's prompt, selection
   options, grid statements, ordering elements and matching text sides.
   Explanations and the fallback already did. Slots accepted answers, an image
   side's `src` and `alt`, an image block's alt and an example's label stay
   single-line: an accepted answer is matched against typed text (0014), the
   others are attributes or one-line labels. Decided unattended: the
   acceptance listed only the selection and slots prompts; the other three
   types' prompts take line breaks too, since the card is "line breaks in
   every field" and nothing reads a prompt as one line. Scoring never reads
   any of these strings (each type's header).
6. **Drawing.** `LineBreaks` (app/components/lesson-player) turns `\n` into
   `<br>`. `InlineContentView` uses it, which covers every theory block,
   caption, table cell and the voice and writing prompts; the five practice
   renderers use it for prompts, options, statements, ordering rows, matching
   text and slots sentence segments, and `ExplanationDisclosure` for
   explanations. The existing `whitespace-pre-line` places keep working: the
   text reaching them no longer holds a raw `\n`.
7. **Editing.** `RichTextField` replaces `InlineEditor` (deleted) everywhere:
   BlockForm fields, list items, table header and row cells, captions, the
   voice and writing prompts. "+ Add run", "Remove run", the `multiline` prop
   and the voice and writing forms' "Press Enter to start a new line." hint are
   gone. Plain practice inputs are `GrowingTextarea`s (`field-sizing-content`,
   one row per line as the fallback); `TextField` takes `multiline` for
   prompts.
8. **Studio only.** Nothing under `app/(english)` or
   `app/components/lesson-player` imports the editor; see "Bundle" below.

## Bundle

Client-reference manifests and `npm run budget`: see the 2026-11-21 entry in
`docs/ui-decisions.md`.

## Known limits

- Places that draw a plain practice string on one line — "Correct: <option>"
  (PLAY-015), the answer review's `truncate` line, Studio's answer and
  homework-results text, the ask-the-teacher card's option list, the course
  stats prompt (`plainText`) — show a line break as a space. Readable, not
  restructured.
- No placeholder extension: the field draws its placeholder as an overlay
  while empty.

## Revisit if

- An author needs a mark or node beyond the four (a link, bold, a list inside
  a paragraph). That widens the stored shape (0020, 0022), not only the editor.
- A pasted document routinely arrives as several paragraphs that should stay
  separate blocks: the field joins them with line breaks today.
- A line break reaches a place that cannot honour it (a Telegram message, a
  generated PDF): that place needs its own rendering of the break.
