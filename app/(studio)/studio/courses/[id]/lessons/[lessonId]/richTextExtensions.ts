import { Extension, Mark, type AnyExtension } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import type { InlineMark } from "@/lib/lessons";

/**
 * The Studio rich-text field's schema (AUTH-025, docs/decisions/0233): a
 * paragraph of text and hard breaks, undo, and the four stored marks, named
 * exactly as stored so lib/lessons/richTextDoc.ts converts without a lookup.
 * Nothing else is registered, so a paste keeps plain text and only these
 * marks: ProseMirror drops any HTML the schema has no rule for. Studio only:
 * no English route may import this file (the budget check in 0233).
 */

/** The classes each mark shows in the editor: the player's own look
 * (app/components/lesson-player/InlineContent.tsx), so the author sees what
 * the learner will. */
export const MARK_EDITOR_CLASS: Record<InlineMark, string> = {
  emphasis: "",
  english: "underline decoration-dotted decoration-muted-foreground underline-offset-2",
  mark_a: "bg-brand-subtle border-b-2 border-brand rounded-[2px] px-0.5",
  mark_b: "bg-accent border-b-2 border-dashed border-foreground/50 rounded-[2px] px-0.5",
};

const Emphasis = Mark.create({
  name: "emphasis",
  parseHTML() {
    return [{ tag: "em" }, { tag: "i" }, { style: "font-style=italic" }];
  },
  renderHTML() {
    return ["em", 0];
  },
});

const English = Mark.create({
  name: "english",
  parseHTML() {
    return [{ tag: "span[data-mark=english]" }, { tag: 'span[lang="en"]' }];
  },
  renderHTML() {
    return ["span", { "data-mark": "english", lang: "en", class: MARK_EDITOR_CLASS.english }, 0];
  },
});

// mark_a and mark_b are contrasting categories over one dimension and never
// share a run (0022 Decision 4): `excludes` makes ProseMirror remove the
// other when one is applied.
const MarkA = Mark.create({
  name: "mark_a",
  excludes: "mark_b",
  parseHTML() {
    return [{ tag: "span[data-mark=mark_a]" }];
  },
  renderHTML() {
    return ["span", { "data-mark": "mark_a", class: MARK_EDITOR_CLASS.mark_a }, 0];
  },
});

const MarkB = Mark.create({
  name: "mark_b",
  excludes: "mark_a",
  parseHTML() {
    return [{ tag: "span[data-mark=mark_b]" }];
  },
  renderHTML() {
    return ["span", { "data-mark": "mark_b", class: MARK_EDITOR_CLASS.mark_b }, 0];
  },
});

/** Enter inserts a line break (keeping the marks around the cursor), never a
 * second paragraph. A single-line field (a heading) refuses Enter. */
const LineBreakOnEnter = (singleLine: boolean) =>
  Extension.create({
    name: "lineBreakOnEnter",
    // Above HardBreak's own Shift/Mod-Enter and the core keymap's splitBlock.
    priority: 1000,
    addKeyboardShortcuts() {
      const enter = () => (singleLine ? true : this.editor.commands.setHardBreak());
      return { Enter: enter, "Shift-Enter": enter, "Mod-Enter": enter };
    },
  });

export function richTextExtensions({ singleLine = false }: { singleLine?: boolean } = {}): AnyExtension[] {
  return [
    Document,
    Paragraph,
    Text,
    HardBreak.configure({ keepMarks: true }),
    UndoRedo,
    Emphasis,
    English,
    MarkA,
    MarkB,
    LineBreakOnEnter(singleLine),
  ];
}
