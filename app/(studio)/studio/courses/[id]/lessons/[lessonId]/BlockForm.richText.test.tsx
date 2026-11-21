import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import type { InlineContent, TheoryBlock } from "@/lib/lessons";
import { BlockForm } from "./BlockForm";

// AUTH-026 (docs/decisions/0234): removing a list item or a table column must
// not leave another item's rich-text field holding the removed one's history.
// The form sits in a tiny state holder, as in BlockList.

afterEach(() => cleanup());

const editorOf = (el: HTMLElement) => (el as HTMLElement & { editor: Editor }).editor;
const t = (s: string): InlineContent => [{ text: s }];
const texts = (cells: InlineContent[]) => cells.map((c) => c.map((r) => r.text).join(""));

type ListBlock = Extract<TheoryBlock, { type: "list" }>;
type TableBlock = Extract<TheoryBlock, { type: "table" }>;

let latest: TheoryBlock;

function Harness({ initial }: { initial: TheoryBlock }) {
  const [block, setBlock] = useState(initial);
  return (
    <BlockForm
      block={block}
      onChange={(next) => {
        latest = next;
        setBlock(next);
      }}
    />
  );
}

describe("BlockForm — removing a list item (AUTH-026)", () => {
  const list: ListBlock = { id: "l1", kind: "theory", type: "list", ordered: false, items: [t("one"), t("two"), t("three")] };

  it("Ctrl+Z in the item that moved up does not bring the removed item back", async () => {
    latest = list;
    render(<Harness initial={list} />);
    // The author edits item 2, then removes it.
    const second = editorOf(await screen.findByRole("textbox", { name: "Item 2" }));
    act(() => {
      second.commands.focus("end");
      second.commands.insertContent("!");
    });
    expect(texts((latest as ListBlock).items)).toEqual(["one", "two!", "three"]);
    const third = editorOf(screen.getByRole("textbox", { name: "Item 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove item 2" }));
    expect(texts((latest as ListBlock).items)).toEqual(["one", "three"]);

    // The removed item's editor went with it; item 3's own editor moved up.
    const moved = editorOf(screen.getByRole("textbox", { name: "Item 2" }));
    expect(moved).toBe(third);
    expect(moved.getText()).toBe("three");
    act(() => {
      moved.commands.undo();
      moved.commands.undo();
    });
    expect(texts((latest as ListBlock).items)).toEqual(["one", "three"]);
    expect(moved.getText()).toBe("three");
  });
});

describe("BlockForm — removing a table column (AUTH-026)", () => {
  const table: TableBlock = {
    id: "t1",
    kind: "theory",
    type: "table",
    header: [t("A"), t("B")],
    rows: [[t("a1"), t("b1")]],
  };

  it("Ctrl+Z in a cell that moved left does not bring the removed column back", async () => {
    latest = table;
    render(<Harness initial={table} />);
    await screen.findByRole("textbox", { name: "Header 1" });
    const header2 = editorOf(screen.getByRole("textbox", { name: "Header 2" }));
    const cell2 = editorOf(screen.getByRole("textbox", { name: "Row 1, column 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove column 1" }));
    const t1 = latest as TableBlock;
    expect(texts(t1.header)).toEqual(["B"]);
    expect(texts(t1.rows[0])).toEqual(["b1"]);
    // Column 2's own editors moved left; column 1's went with it.
    expect(editorOf(screen.getByRole("textbox", { name: "Header 1" }))).toBe(header2);
    expect(editorOf(screen.getByRole("textbox", { name: "Row 1, column 1" }))).toBe(cell2);

    for (const name of ["Header 1", "Row 1, column 1"]) {
      const cell = editorOf(screen.getByRole("textbox", { name }));
      act(() => {
        cell.commands.undo();
      });
    }
    const t2 = latest as TableBlock;
    expect(texts(t2.header)).toEqual(["B"]);
    expect(texts(t2.rows[0])).toEqual(["b1"]);
  });
});
