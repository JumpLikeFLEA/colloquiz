import { act, cleanup, render, screen } from "@testing-library/react";
import { useLayoutEffect, useRef, useState } from "react";
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

describe("RichTextField — rendering (AUTH-026)", () => {
  it("a parent re-render with the same value leaves the editor alone", async () => {
    const value: InlineContent = [{ text: "Same" }];
    const { rerender } = render(<RichTextField label="Text" value={value} onChange={() => {}} />);
    const editor = editorOf(await screen.findByRole("textbox", { name: "Text" }));
    const setOptions = vi.spyOn(editor, "setOptions");
    // A new onChange closure on every render, as BlockForm passes one.
    rerender(<RichTextField label="Text" value={value} onChange={() => {}} />);
    rerender(<RichTextField label="Text" value={value} onChange={() => {}} />);
    expect(setOptions).not.toHaveBeenCalled();
  });

  it("the field and its text are in the DOM in the first commit (no empty frame before paint)", () => {
    let firstCommit: { textbox: boolean; text: string } | null = null;
    function Probe() {
      const ref = useRef<HTMLDivElement>(null);
      const [value] = useState<InlineContent>([{ text: "Hello" }]);
      // A parent's layout effect runs after its children are in the DOM and
      // before the browser paints.
      useLayoutEffect(() => {
        const box = ref.current?.querySelector('[contenteditable="true"]');
        firstCommit ??= { textbox: box !== null && box !== undefined, text: box?.textContent ?? "" };
      }, []);
      return (
        <div ref={ref}>
          <RichTextField label="Text" value={value} onChange={() => {}} />
        </div>
      );
    }
    render(<Probe />);
    expect(firstCommit).toEqual({ textbox: true, text: "Hello" });
  });
});

describe("RichTextField — errors (AUTH-026)", () => {
  it("marks the field invalid and describes it with the error text", async () => {
    render(<RichTextField label="Text" value={[{ text: "" }]} onChange={() => {}} fieldErrors={["Text is required."]} />);
    const field = await screen.findByRole("textbox", { name: "Text" });
    expect(field.getAttribute("aria-invalid")).toBe("true");
    const ids = (field.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual(["Text is required."]);
  });

  it("a field with no errors is not marked invalid (positive control)", async () => {
    render(<RichTextField label="Text" value={[{ text: "Fine" }]} onChange={() => {}} />);
    const field = await screen.findByRole("textbox", { name: "Text" });
    expect(field.getAttribute("aria-invalid")).toBeNull();
    expect(field.getAttribute("aria-describedby")).toBeNull();
  });
});
