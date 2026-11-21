"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { INLINE_MARKS, type InlineContent, type InlineMark } from "@/lib/lessons";
import { docToRuns, normalizeRuns, runsToDoc, type RichTextDoc } from "@/lib/lessons/richTextDoc";
import { richTextExtensions } from "./richTextExtensions";

/**
 * One rich-text field for one stored `InlineContent` value (AUTH-025,
 * docs/decisions/0233), replacing the run-by-run InlineEditor (0033
 * Decision 3). The author types prose, Enter starts a new line, and Em / EN /
 * A / B apply to the selection (or to what is typed next) and show whether the
 * cursor sits in them. What is stored does not change: runs of text and marks,
 * a line break a `\n` inside a run (0224 Option A), an empty field
 * `[{ text: "" }]` so validation behaves as before.
 *
 * Studio only. Tiptap stays out of every English route (the budget check in
 * 0233): nothing under app/(english) or app/components/lesson-player imports
 * this file.
 */

const MARK_LABEL: Record<InlineMark, string> = {
  emphasis: "Em",
  english: "EN",
  mark_a: "A",
  mark_b: "B",
};

const MARK_TITLE: Record<InlineMark, string> = {
  emphasis: "Emphasis",
  english: "English span",
  mark_a: "Highlight A",
  mark_b: "Highlight B",
};

const FIELD_CLASS =
  "min-h-8 w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground outline-none whitespace-pre-wrap break-words focus:border-brand";

function sameRuns(a: InlineContent, b: InlineContent): boolean {
  return JSON.stringify(normalizeRuns(a)) === JSON.stringify(normalizeRuns(b));
}

export function RichTextField({
  value,
  onChange,
  fieldErrors,
  placeholder,
  label,
  singleLine = false,
}: {
  value: InlineContent;
  onChange: (next: InlineContent) => void;
  fieldErrors?: string[];
  placeholder?: string;
  /** The field's accessible name (the visible label beside it is not a
   * `<label for>`: a contenteditable is not labelable). */
  label?: string;
  /** A heading: Enter does nothing and a pasted line break becomes a space. */
  singleLine?: boolean;
}) {
  // The last value this field reported, so a parent re-render with that same
  // value doesn't reset the editor (and its cursor) to the stored document.
  const lastEmitted = useRef<InlineContent>(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: richTextExtensions({ singleLine }),
    content: runsToDoc(value),
    // Next renders client components on the server too; Tiptap must not
    // build its view there (it would mismatch on hydration).
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: FIELD_CLASS,
        role: "textbox",
        "aria-multiline": singleLine ? "false" : "true",
        ...(label ? { "aria-label": label } : {}),
      },
    },
    onUpdate: ({ editor: current }) => {
      // A single-line field's paste is flattened by the schema's paste plugin
      // (richTextExtensions, docs/decisions/0234 Decision 5), not here.
      const next = docToRuns(current.getJSON() as RichTextDoc);
      lastEmitted.current = next;
      onChangeRef.current(next);
    },
  });

  // A value changed from outside (another control, a reset): show it.
  useEffect(() => {
    if (!editor || sameRuns(value, lastEmitted.current)) return;
    lastEmitted.current = value;
    editor.commands.setContent(runsToDoc(value), { emitUpdate: false });
  }, [editor, value]);

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      empty: current ? current.isEmpty : true,
      active: Object.fromEntries(INLINE_MARKS.map((mark) => [mark, current ? current.isActive(mark) : false])) as Record<
        InlineMark,
        boolean
      >,
    }),
  });

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-1.5">
        <div className="relative min-w-0 flex-1">
          <EditorContent editor={editor} />
          {state?.empty && placeholder && (
            <span
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1.5 text-sm text-muted-foreground"
            >
              {placeholder}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 pt-1">
          {INLINE_MARKS.map((mark) => {
            const active = state?.active[mark] ?? false;
            return (
              <button
                key={mark}
                type="button"
                // Keep the selection in the field while the button is pressed.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => editor?.chain().focus().toggleMark(mark).run()}
                disabled={!editor}
                title={MARK_TITLE[mark]}
                aria-label={MARK_TITLE[mark]}
                aria-pressed={active}
                className={`cursor-pointer rounded px-1.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  active ? "bg-brand text-white" : "border border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                {MARK_LABEL[mark]}
              </button>
            );
          })}
        </div>
      </div>
      {fieldErrors?.map((message, i) => (
        <p key={i} className="text-xs text-destructive-text">
          {message}
        </p>
      ))}
    </div>
  );
}
