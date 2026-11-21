# 0234 — Studio rich-text field: undo, paste, shortcuts and first paint (AUTH-026)

Status: written 2026-11-21; AUTH-026 (#326). Builds on 0233 (AUTH-025). The stored shape does not change.

## Context

From the 2026-11-21 review of AUTH-025's Tiptap field (chat), re-checked read-only at `4e3a7b1`:

- **Undo brings back removed text.** List items, table header cells, rows and cells are keyed by index
  (`BlockForm.tsx:248` `key={i}`, `:422` `key={c}`, `:473` `key={r}`, `:488` `key={c}`). After a removal React
  keeps the removed item's editor and feeds it the next item's value through `RichTextField.tsx:97`
  (`setContent(..., { emitUpdate: false })`). That records an undo step: Tiptap 3.32.3's `setContent` sets only
  `preventUpdate`, never `addToHistory` (`@tiptap/core/dist/index.js:1097-1115`). Restoring a version
  (`LessonContentEditor.tsx:217`, block ids kept) does the same to an open field.
- **Paste can show what isn't stored.** Only plain-text paste is flattened for a heading
  (`RichTextField.tsx:83`); pasted HTML `<br>` stays a `hardBreak` on screen while `onUpdate` stores a space;
  pasted `<p>` blocks make two paragraphs; a pasted blank line makes two paragraphs, which `docToRuns` joins with
  one `\n`, so the blank line is lost on save while two typed Enters keep it.
- **No mark shortcuts** (`richTextExtensions.ts` binds nothing to the four marks).
- **One empty frame per expand.** `immediatelyRender: false` (`RichTextField.tsx:75`) builds the editor in an
  effect after the first commit; the border lives on the editor element, so that frame has no box. A field only
  mounts inside an expanded row: `expandedId` starts `null` (`BlockList.tsx:186`) and forms render under
  `{expanded && (` (`BlockList.tsx:572`, `:660`); the only importers of `RichTextField` are `BlockForm`,
  `VoiceTaskForm`, `WritingTaskForm` and `ImageBlockForm`, all reached through those forms. So no field is ever
  server-rendered. `@tiptap/react` honours an explicit `immediatelyRender: true` in client-only Next.js since 3.23.5.
- **Every parent re-render touches every open editor.** `useEditor` compares each option on every render and calls
  `editor.setOptions` when one differs (`@tiptap/react/dist/index.js:404-445`); only `on*` callbacks are exempt.
  `RichTextField` passes new `extensions`, `content` and `editorProps` each render.
- **Errors are not tied to the field.** They render as `<p>` with no id (`RichTextField.tsx:149-153`); the
  contenteditable has no `aria-invalid` / `aria-describedby`.

## Decisions

1. **Shortcuts (owner, 2026-11-21).** Em: Ctrl/Cmd+I. EN, A, B: Ctrl/Cmd+Alt+1, +2, +3 (Google Docs uses
   Ctrl+Alt+digits for headings; Cmd+Shift+3 is a macOS screenshot, which rules out Shift+digit). Caveat: on
   Windows Ctrl+Alt is AltGr on some layouts (German AltGr+2 types ²); not the Russian or English layouts.
   Change here if the partner types on such a layout.
2. **Pasted paragraphs join with one line break (owner, 2026-11-21)**, as 0233 already does in storage; a
   heading joins them with a space. A pasted blank line stays two line breaks.
3. **After an outside change there is nothing to undo (owner, 2026-11-21).** History from before the change is
   dropped, rather than letting Ctrl+Z undo the change.
4. **`immediatelyRender: true` (owner, 2026-11-21)**, for the mount path above.
5. **The extension owns a heading's flattening.** `RichTextField`'s `transformPastedText` and the `onUpdate`
   `\n` → space replacement go, so there is one place for it (the document is one paragraph by schema, and a
   single-line field converts breaks to spaces at paste time).
6. **Keys for list items, table columns and rows live in form state only** and are never stored.

## Not in this card

- **Highlights spill onto the next word typed.** Marks are inclusive by default (reproduced: marking "went" with
  A, then typing " home", gives "went home" highlighted). `inclusive: false` is a one-line change per mark, but
  it changes how typing feels. Ask the authors whether A / B / EN should stop at the last letter.
- Toolbar placement (four buttons on every field), `*word*` typing shortcuts, joining the hard line ends of text
  pasted from a PDF, marks in practice prompts (a schema change, 0233 "Revisit if").

## Revisit when

- A field can render on first load (for example, a deep link that opens a block): Decision 4 no longer holds.
- Tiptap changes `setContent`'s history behaviour or `useEditor`'s option comparison.
- The authors answer the inclusive-marks question.
