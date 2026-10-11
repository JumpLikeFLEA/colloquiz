import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseLessonDocument, type LessonBlock } from "@/lib/lessons";
import { LessonContentEditor } from "./LessonContentEditor";

// AUTH-017 acceptance: "An RTL test drags a block across chapters, moves a
// chapter and deletes one", and "An imported lesson that already uses
// level-1 headings renders as chapters."
//
// The save route is stood in for as in LessonContentEditor.exercises.test.tsx:
// a fetch stub that runs parseLessonDocument and returns 422 on failure. Each
// test acts on the outline and then reads the saved document, so what is
// checked is the flat array the editor would store, not only what it shows.
//
// Drag uses dnd-kit's KeyboardSensor on the row's grip, the path
// OrderingRenderer.test.tsx established (0054). sortableKeyboardCoordinates
// picks the next row by comparing getBoundingClientRect, which jsdom reports
// as all zero; mockRowRects gives every sortable row (data-sortable-row) a
// distinct top from its position among all such rows in the document. That
// is a global index, not a sibling index, because the rows live in separate
// chapter cards. Without the overlay rule below, the DragOverlay node would
// measure at top 0 and ArrowDown would resolve from the top of the list.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

type Saved = { document: unknown[] };
let saves: Saved[] = [];

function mockRowRects() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const rows = Array.from(document.querySelectorAll("[data-sortable-row]"));
    // Anything that is not a row (the DragOverlay among them) measures at
    // the dragged row: its grip keeps focus throughout a keyboard drag.
    const self = rows.includes(this) ? this : document.activeElement?.closest("[data-sortable-row]");
    const index = self ? rows.indexOf(self) : -1;
    const top = index >= 0 ? index * 44 : 0;
    return {
      top,
      bottom: top + 44,
      left: 0,
      right: 300,
      width: 300,
      height: 44,
      x: 0,
      y: top,
      toJSON() {
        return {};
      },
    } as DOMRect;
  });
}

/** KeyboardSensor attaches its keydown listener in a setTimeout(0) after
 * activation; a macrotask has to pass before the next key is heard. */
async function flushMacrotask() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  saves = [];
  mockRowRects();
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/versions")) return Response.json({ versions: [] });
      const body = JSON.parse(String(init?.body)) as Saved;
      saves.push(body);
      const parsed = parseLessonDocument(body.document);
      if (!parsed.ok) return Response.json({ error: "Invalid lesson content", errors: parsed.errors }, { status: 422 });
      return Response.json({ ok: true, versionId: "00000000-0000-4000-8000-000000000001" });
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  vi.unstubAllGlobals();
});

function h(id: string, level: 1 | 2): LessonBlock {
  return { id, kind: "theory", type: "heading", level, text: [{ text: `Heading ${id}` }] };
}
function p(id: string): LessonBlock {
  return { id, kind: "theory", type: "prose", text: [{ text: `Prose ${id}` }] };
}

// An imported lesson: no intro, two chapters, a subheading inside the first.
const imported: LessonBlock[] = [h("A", 1), p("a1"), h("a-sub", 2), p("a2"), h("B", 1), p("b1")];

function renderEditor(document: LessonBlock[] = imported) {
  render(
    <LessonContentEditor
      courseId="course-1"
      draft={{
        lessonId: "lesson-1",
        lessonTitle: "Lesson",
        courseId: "course-1",
        document,
        baseVersionId: null,
        publishedVersionId: null,
      }}
      initialVersions={[]}
    />,
  );
}

const chapter = (id: string) => screen.getByRole("region", { name: `Chapter: Heading ${id}` });

async function savedIds(): Promise<string[]> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
  });
  await waitFor(() => expect(saves.length).toBeGreaterThan(0));
  const doc = saves[saves.length - 1].document;
  const parsed = parseLessonDocument(doc);
  expect(parsed.ok ? [] : parsed.errors).toEqual([]);
  return (doc as LessonBlock[]).map((b) => b.id);
}

describe("LessonContentEditor — chapter outline (AUTH-017)", () => {
  it("renders an imported lesson's level-1 headings as chapters, subheadings inside", () => {
    renderEditor();
    expect(screen.queryByText("Before the first chapter")).toBeNull();
    const a = chapter("A");
    expect(within(a).getByText("Prose a1")).toBeTruthy();
    expect(within(a).getByText("Heading a-sub")).toBeTruthy();
    expect(within(a).getByText("Chapter · 3 blocks")).toBeTruthy();
    expect(within(chapter("B")).getByText("Prose b1")).toBeTruthy();
    // A chapter heading row is not a drag source; its blocks are.
    expect(within(a).getAllByRole("button", { name: "Drag to reorder" })).toHaveLength(3);
  });

  it("rendering an imported lesson as chapters changes nothing: Save stays disabled", () => {
    renderEditor();
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("drags a block across chapters", async () => {
    renderEditor();
    const grips = within(chapter("A")).getAllByRole("button", { name: "Drag to reorder" });
    const a2Grip = grips[2];
    a2Grip.focus();
    fireEvent.keyDown(a2Grip, { code: "Space" });
    await act(flushMacrotask);
    // One row down from a2 is chapter B's header: a2 becomes B's first block.
    fireEvent.keyDown(a2Grip, { code: "ArrowDown" });
    fireEvent.keyDown(a2Grip, { code: "Space" });
    await waitFor(() => expect(within(chapter("B")).getByText("Prose a2")).toBeTruthy());
    expect(within(chapter("A")).queryByText("Prose a2")).toBeNull();
    expect(await savedIds()).toEqual(["A", "a1", "a-sub", "B", "a2", "b1"]);
  });

  it("moves a chapter, carrying its blocks", async () => {
    renderEditor();
    expect((within(chapter("A")).getByRole("button", { name: "Move chapter up" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(chapter("B")).getByRole("button", { name: "Move chapter down" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(chapter("B")).getByRole("button", { name: "Move chapter up" }));
    expect(await savedIds()).toEqual(["B", "b1", "A", "a1", "a-sub", "a2"]);
  });

  it("deletes a chapter after a confirm that gives its block count", async () => {
    renderEditor();
    fireEvent.click(within(chapter("A")).getByRole("button", { name: "Delete chapter" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/the 3 blocks in it are removed/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete chapter" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Chapter: Heading A" })).toBeNull());
    expect(await savedIds()).toEqual(["B", "b1"]);
  });

  it("cancelling the delete confirm changes nothing", async () => {
    renderEditor();
    fireEvent.click(within(chapter("B")).getByRole("button", { name: "Delete chapter" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(chapter("B")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("collapses a chapter and adds a block at its end", async () => {
    renderEditor();
    fireEvent.click(within(chapter("A")).getByRole("button", { name: "Collapse chapter" }));
    expect(within(chapter("A")).queryByText("Prose a1")).toBeNull();
    fireEvent.click(within(chapter("A")).getByRole("button", { name: "Expand chapter" }));
    fireEvent.keyDown(within(chapter("A")).getByRole("button", { name: "Add block" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitem", { name: "Subheading" }));
    fireEvent.change(screen.getAllByRole("textbox").find((el) => (el as HTMLInputElement).value === "")!, {
      target: { value: "New subheading" },
    });
    const ids = await savedIds();
    expect(ids.slice(0, 4)).toEqual(["A", "a1", "a-sub", "a2"]);
    expect(ids.slice(5)).toEqual(["B", "b1"]);
    expect(saves[0].document[4]).toMatchObject({ type: "heading", level: 2, text: [{ text: "New subheading" }] });
  });

  it("adds a chapter only once it has a title", async () => {
    renderEditor([p("intro")]);
    expect(screen.queryByText("Before the first chapter")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add chapter" }));
    const submit = screen.getByRole("button", { name: "Add chapter" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Chapter title" }), { target: { value: "Past simple" } });
    fireEvent.click(submit);
    expect(screen.getByRole("region", { name: "Chapter: Past simple" })).toBeTruthy();
    expect(screen.getByText("Before the first chapter")).toBeTruthy();
    await savedIds();
    expect(saves[0].document[1]).toMatchObject({ type: "heading", level: 1, text: [{ text: "Past simple" }] });
  });
});
