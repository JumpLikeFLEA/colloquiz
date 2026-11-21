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

// AUTH-026 (docs/decisions/0234): the field shows exactly what it stores,
// whatever arrives by paste. `shows` is the invariant: the editor's document is
// the one the stored runs convert back to.
const shows = (e: Editor) => expect(e.getJSON()).toEqual(runsToDoc(runs(e)));

describe("richTextExtensions — paste keeps the stored shape (AUTH-026)", () => {
  it("a single-line field turns a pasted <br> into the space it stores", () => {
    const e = make([{ text: "" }], true);
    e.commands.focus();
    e.view.pasteHTML("one<br>two");
    expect(runs(e)).toEqual([{ text: "one two" }]);
    shows(e);
  });

  it("a single-line field joins pasted paragraphs with a space", () => {
    const e = make([{ text: "" }], true);
    e.commands.focus();
    e.view.pasteHTML("<p>one</p><p>two</p>");
    expect(e.getJSON().content).toHaveLength(1);
    expect(runs(e)).toEqual([{ text: "one two" }]);
    shows(e);
  });

  it("a single-line field joins pasted plain-text lines with a space", () => {
    const e = make([{ text: "" }], true);
    e.commands.focus();
    e.view.pasteText("one\ntwo");
    expect(runs(e)).toEqual([{ text: "one two" }]);
    shows(e);
  });

  it("a multi-line field keeps a pasted blank line, as two typed Enters do", () => {
    const e = make([{ text: "" }]);
    e.commands.focus();
    e.view.pasteText("Line one\n\nLine three");
    expect(e.getJSON().content).toHaveLength(1);
    expect(runs(e)).toEqual([{ text: "Line one\n\nLine three" }]);
    shows(e);
  });

  it("a multi-line field turns pasted paragraphs into one paragraph with a line break", () => {
    const e = make([{ text: "" }]);
    e.commands.focus();
    e.view.pasteHTML("<p>one</p><p><em>two</em></p>");
    expect(e.getJSON().content).toHaveLength(1);
    expect(runs(e)).toEqual([{ text: "one\n" }, { text: "two", marks: ["emphasis"] }]);
    shows(e);
  });
});

describe("richTextExtensions — mark shortcuts (AUTH-026)", () => {
  it("Mod-I toggles emphasis on the selection", () => {
    const e = make([{ text: "Hello world" }]);
    e.commands.setTextSelection({ from: 7, to: 12 });
    e.commands.keyboardShortcut("Mod-i");
    expect(runs(e)).toEqual([{ text: "Hello " }, { text: "world", marks: ["emphasis"] }]);
    e.commands.keyboardShortcut("Mod-i");
    expect(runs(e)).toEqual([{ text: "Hello world" }]);
  });

  it("Ctrl+I works on a Russian keyboard layout (key ш, physical I)", () => {
    const e = make([{ text: "word" }]);
    e.commands.selectAll();
    const event = new KeyboardEvent("keydown", { key: "ш", keyCode: 73, ctrlKey: true, bubbles: true });
    const handled = e.view.someProp("handleKeyDown", (f) => f(e.view, event));
    expect(handled).toBe(true);
    expect(runs(e)).toEqual([{ text: "word", marks: ["emphasis"] }]);
  });

  it.each([
    ["Mod-Alt-1", "english"],
    ["Mod-Alt-2", "mark_a"],
    ["Mod-Alt-3", "mark_b"],
  ] as const)("%s toggles %s", (shortcut, mark) => {
    const e = make([{ text: "word" }]);
    e.commands.selectAll();
    e.commands.keyboardShortcut(shortcut);
    expect(runs(e)).toEqual([{ text: "word", marks: [mark] }]);
  });
});
