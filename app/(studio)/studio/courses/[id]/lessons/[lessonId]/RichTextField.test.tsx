import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import type { InlineContent } from "@/lib/lessons";
import { RichTextField } from "./RichTextField";

// AUTH-026 (docs/decisions/0234): the Studio rich-text field as a React
// component. Its schema is richTextExtensions.test.ts; this file covers what
// the component adds: syncing a value from outside, re-renders, first paint,
// and how errors reach assistive technology.

afterEach(() => cleanup());

// Tiptap puts its Editor on the view's DOM node (as in VoiceTaskForm.test.tsx).
const editorOf = (el: HTMLElement) => (el as HTMLElement & { editor: Editor }).editor;
const text = (value: InlineContent) => value.map((run) => run.text).join("");

describe("RichTextField — a value changed from outside (AUTH-026)", () => {
  it("is not undoable: Ctrl+Z does not bring the old value back", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<RichTextField label="Text" value={[{ text: "Old value" }]} onChange={onChange} />);
    const field = await screen.findByRole("textbox", { name: "Text" });
    rerender(<RichTextField label="Text" value={[{ text: "New value" }]} onChange={onChange} />);
    const editor = editorOf(field);
    expect(editor.getText()).toBe("New value");
    act(() => {
      editor.commands.undo();
    });
    expect(editor.getText()).toBe("New value");
    expect(onChange.mock.calls.map(([value]) => text(value))).not.toContain("Old value");
  });

  it("still undoes the author's own typing after it", async () => {
    let latest: InlineContent = [];
    const { rerender } = render(<RichTextField label="Text" value={[{ text: "Old" }]} onChange={(v) => (latest = v)} />);
    const field = await screen.findByRole("textbox", { name: "Text" });
    rerender(<RichTextField label="Text" value={[{ text: "New" }]} onChange={(v) => (latest = v)} />);
    const editor = editorOf(field);
    act(() => {
      editor.commands.focus("end");
      editor.commands.insertContent("er");
    });
    expect(text(latest)).toBe("Newer");
    act(() => {
      editor.commands.undo();
    });
    expect(text(latest)).toBe("New");
    expect(editor.getText()).toBe("New");
  });
});

describe("RichTextField — shortcut hints (AUTH-026)", () => {
  it("the Em button names its shortcut and carries aria-keyshortcuts (jsdom is not macOS)", async () => {
    render(<RichTextField label="Text" value={[{ text: "x" }]} onChange={() => {}} />);
    await screen.findByRole("textbox", { name: "Text" });
    const button = screen.getByRole("button", { name: "Emphasis" });
    expect(button.getAttribute("title")).toContain("Ctrl+I");
    expect(button.getAttribute("aria-keyshortcuts")).toBe("Control+I");
  });
});
