import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { docToRuns, runsToDoc, type RichTextDoc } from "@/lib/lessons/richTextDoc";
import type { InlineContent } from "@/lib/lessons";
import { richTextExtensions } from "./richTextExtensions";

// AUTH-025, docs/decisions/0233: the Studio field's schema, driven through a
// real Tiptap editor in jsdom.

// jsdom has no ClipboardEvent; ProseMirror's pasteHTML only constructs one.
if (typeof globalThis.ClipboardEvent === "undefined") {
  (globalThis as { ClipboardEvent?: unknown }).ClipboardEvent = class extends Event {
    clipboardData = null;
  };
}

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function make(runs: InlineContent, singleLine = false) {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: richTextExtensions({ singleLine }),
    content: runsToDoc(runs),
  });
  return editor;
}

const runs = (e: Editor) => docToRuns(e.getJSON() as RichTextDoc);

describe("richTextExtensions", () => {
  it("loads stored runs with a line break and marks, and reads them back unchanged", () => {
    const value: InlineContent = [{ text: "One " }, { text: "word\nTwo", marks: ["emphasis", "mark_a"] }];
    expect(runs(make(value))).toEqual(value);
  });

  it("Enter inserts a line break, not a second paragraph", () => {
    const e = make([{ text: "First" }]);
    e.commands.focus("end");
    e.commands.keyboardShortcut("Enter");
    e.commands.insertContent("Second");
    expect(e.getJSON().content).toHaveLength(1);
    expect(runs(e)).toEqual([{ text: "First\nSecond" }]);
  });

  it("a single-line field ignores Enter and Shift-Enter", () => {
    const e = make([{ text: "Title" }], true);
    e.commands.focus("end");
    e.commands.keyboardShortcut("Enter");
    e.commands.keyboardShortcut("Shift-Enter");
    expect(runs(e)).toEqual([{ text: "Title" }]);
  });

  it("applies a mark to the selection and reports it active", () => {
    const e = make([{ text: "Hello world" }]);
    e.commands.setTextSelection({ from: 7, to: 12 });
    e.commands.toggleMark("english");
    expect(e.isActive("english")).toBe(true);
    expect(runs(e)).toEqual([{ text: "Hello " }, { text: "world", marks: ["english"] }]);
  });

  it("mark_a and mark_b exclude each other", () => {
    const e = make([{ text: "word" }]);
    e.commands.selectAll();
    e.commands.toggleMark("mark_a");
    e.commands.toggleMark("mark_b");
    expect(runs(e)).toEqual([{ text: "word", marks: ["mark_b"] }]);
    e.commands.toggleMark("mark_a");
    expect(runs(e)).toEqual([{ text: "word", marks: ["mark_a"] }]);
  });

  it("a pasted HTML keeps text and the four marks, nothing else", () => {
    const e = make([{ text: "" }]);
    e.commands.focus();
    e.view.pasteHTML(
      '<h1>Big</h1><p>Plain <b>bold</b> <em>em</em> <span lang="en">en</span> <a href="x">link</a></p><img src="y">',
    );
    const out = runs(e);
    expect(out.map((r) => r.text).join("")).toBe("Big\nPlain bold em en link");
    expect(out.filter((r) => r.marks).map((r) => [r.text, r.marks])).toEqual([
      ["em", ["emphasis"]],
      ["en", ["english"]],
    ]);
  });

  it("undo restores the previous text", () => {
    const e = make([{ text: "a" }]);
    e.commands.focus("end");
    e.commands.insertContent("b");
    expect(runs(e)).toEqual([{ text: "ab" }]);
    e.commands.undo();
    expect(runs(e)).toEqual([{ text: "a" }]);
  });

  it("an emptied field reads [{ text: \"\" }]", () => {
    const e = make([{ text: "x" }]);
    e.commands.clearContent();
    expect(runs(e)).toEqual([{ text: "" }]);
  });
});
