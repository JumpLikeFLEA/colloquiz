import { Extension, Mark, type AnyExtension } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { Fragment, Slice, type Mark as PMMark, type Node as PMNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
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

/** The keyboard shortcuts for the four marks (AUTH-026, docs/decisions/0234
 * Decision 1). prosemirror-keymap falls back to the physical key when a
 * modifier is held and the typed character is not ASCII, so Ctrl+I also works
 * on a Russian layout (the test is the evidence). */
export const MARK_SHORTCUT: Record<InlineMark, string> = {
  emphasis: "Mod-i",
  english: "Mod-Alt-1",
  mark_a: "Mod-Alt-2",
  mark_b: "Mod-Alt-3",
};

const Emphasis = Mark.create({
  name: "emphasis",
  addKeyboardShortcuts() {
    return { [MARK_SHORTCUT.emphasis]: () => this.editor.commands.toggleMark(this.name) };
  },
  parseHTML() {
    return [{ tag: "em" }, { tag: "i" }, { style: "font-style=italic" }];
  },
  renderHTML() {
    return ["em", 0];
  },
});

const English = Mark.create({
  name: "english",
  addKeyboardShortcuts() {
    return { [MARK_SHORTCUT.english]: () => this.editor.commands.toggleMark(this.name) };
  },
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
  addKeyboardShortcuts() {
    return { [MARK_SHORTCUT.mark_a]: () => this.editor.commands.toggleMark(this.name) };
  },
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
  addKeyboardShortcuts() {
    return { [MARK_SHORTCUT.mark_b]: () => this.editor.commands.toggleMark(this.name) };
  },
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

/** The field is one paragraph (the schema says so), so a paste must arrive as
 * one paragraph too, or the editor shows something the stored runs can't
 * hold (AUTH-026, docs/decisions/0234 Decisions 2 and 5). Pasted blocks and
 * plain-text lines join with a line break, a blank line stays two; a
 * single-line field (a heading) joins with a space and turns a pasted <br>
 * into one, as `docToRuns` would have stored it. */
const PasteShape = (singleLine: boolean) =>
  Extension.create({
    name: "pasteShape",
    addProseMirrorPlugins() {
      const schema = this.editor.schema;
      const joint = (marks?: readonly PMMark[]) =>
        singleLine ? schema.text(" ", marks) : schema.nodes.hardBreak.create();
      const oneParagraph = (inline: PMNode[]) =>
        new Slice(Fragment.from(schema.nodes.paragraph.create(null, inline)), 1, 1);
      return [
        new Plugin({
          props: {
            clipboardTextParser(text) {
              const inline: PMNode[] = [];
              text.split(/\r\n|\r|\n/).forEach((line, i) => {
                if (i > 0) inline.push(joint());
                if (line) inline.push(schema.text(line));
              });
              return oneParagraph(inline);
            },
            transformPasted(slice) {
              const blocks: PMNode[][] = [];
              let loose: PMNode[] | null = null;
              slice.content.forEach((node) => {
                if (node.isTextblock) {
                  loose = null;
                  const children: PMNode[] = [];
                  node.content.forEach((child) => children.push(child));
                  blocks.push(children);
                } else if (node.isInline) {
                  if (!loose) {
                    loose = [];
                    blocks.push(loose);
                  }
                  loose.push(node);
                }
              });
              if (blocks.length === 0) return slice;
              const inline: PMNode[] = [];
              blocks.forEach((children, i) => {
                if (i > 0) inline.push(joint());
                for (const child of children) {
                  inline.push(singleLine && child.type.name === "hardBreak" ? schema.text(" ", child.marks) : child);
                }
              });
              return oneParagraph(inline);
            },
          },
        }),
      ];
    },
  });

export function richTextExtensions({ singleLine = false }: { singleLine?: boolean } = {}): AnyExtension[] {
  return [
    Document.extend({ content: "paragraph" }),
    Paragraph,
    Text,
    HardBreak.configure({ keepMarks: true }),
    UndoRedo,
    Emphasis,
    English,
    MarkA,
    MarkB,
    LineBreakOnEnter(singleLine),
    PasteShape(singleLine),
  ];
}
