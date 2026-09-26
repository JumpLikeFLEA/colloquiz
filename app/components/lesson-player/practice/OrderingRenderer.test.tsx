import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ItemScoreResult, OrderingItem } from "@/lib/items";
import { orderingModule } from "@/lib/items/ordering";
import { OrderingRenderer } from "./OrderingRenderer";

/**
 * docs/decisions/0054 (PLAY-009) — RTL test for the grip-handle-only
 * renderer. Covers what lib/lessonPlayer/orderingResponse.test.ts's pure
 * helpers can't: that dnd-kit's KeyboardSensor (wired via
 * useLessonPlayerSensors + sortableKeyboardCoordinates) actually reorders a
 * rendered row with no pointer/mouse event at all, now that the ▲/▼ buttons
 * — the previous keyboard-reachable control — are gone and the handle is the
 * only one left.
 *
 * `sortableKeyboardCoordinates` picks a target row by comparing
 * `getBoundingClientRect()` results (see node_modules/@dnd-kit/sortable),
 * which jsdom reports as all-zero by default — every row would tie and no
 * move would ever resolve. `mockRowRects` gives each row div a distinct
 * `top` based on its live position among its siblings, which is enough for
 * dnd-kit's own closest-corners collision check to pick the adjacent row,
 * without asserting anything about dnd-kit's internals directly.
 */

function parsedOrdering(): OrderingItem {
  const result = orderingModule.parse({
    id: "ord-1",
    type: "ordering",
    payload: {
      prompt: "Put the words in order.",
      elements: [
        { id: "e1", text: "alpha", explanationRef: "r1" },
        { id: "e2", text: "bravo", explanationRef: "r1" },
        { id: "e3", text: "charlie", explanationRef: "r1" },
      ],
      explanations: { r1: "alpha, bravo, charlie." },
      fallbackExplanation: "see above",
    },
  });
  if (!result.ok) throw new Error(`fixture did not parse: ${JSON.stringify(result.errors)}`);
  return result.item;
}

/** Gives every row div (the `useSortable` node) a `top` equal to 44px times
 * its live index among siblings, so dnd-kit's rect-based keyboard collision
 * detection has real, distinct positions to compare instead of jsdom's
 * default all-zero rect. */
function mockRowRects() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const siblings = this.parentElement ? Array.from(this.parentElement.children) : [];
    const index = siblings.indexOf(this);
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

/** dnd-kit's KeyboardSensor attaches its ongoing document-level keydown
 * listener in a `setTimeout(..., 0)` after activation (see
 * node_modules/@dnd-kit/core's KeyboardSensor.attach) -- a real macrotask
 * tick has to pass before an ArrowDown fired after pickup is heard. */
async function flushMacrotask() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  mockRowRects();
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe("OrderingRenderer", () => {
  it("shows a live position number per row and no move buttons", () => {
    render(<OrderingRenderer item={parsedOrdering()} attemptId="attempt-1" onScore={() => {}} />);

    expect(screen.getByText("1.")).toBeDefined();
    expect(screen.getByText("2.")).toBeDefined();
    expect(screen.getByText("3.")).toBeDefined();
    expect(screen.queryByLabelText(/^Move "/)).toBeNull();
  });

  it("shows a hold-and-drag hint before submission", () => {
    render(<OrderingRenderer item={parsedOrdering()} attemptId="attempt-1" onScore={() => {}} />);
    expect(screen.getByText("Hold and drag the handle to reorder.")).toBeDefined();
  });

  it("keyboard: Space to pick up, ArrowDown to move, Space to drop reorders the row and renumbers it", async () => {
    render(<OrderingRenderer item={parsedOrdering()} attemptId="attempt-1" onScore={() => {}} />);

    const handles = screen.getAllByLabelText(/^Drag to reorder /);
    const firstHandle = handles[0];
    const firstLabel = firstHandle.getAttribute("aria-label");

    firstHandle.focus();
    fireEvent.keyDown(firstHandle, { code: "Space" });
    await flushMacrotask();
    fireEvent.keyDown(firstHandle, { code: "ArrowDown" });
    fireEvent.keyDown(firstHandle, { code: "Space" });

    const handlesAfter = screen.getAllByLabelText(/^Drag to reorder /);
    expect(handlesAfter[0].getAttribute("aria-label")).not.toBe(firstLabel);
    expect(handlesAfter[1].getAttribute("aria-label")).toBe(firstLabel);
  });

  it("submit reaches scoreItem with the elements' current order", () => {
    const onScore = vi.fn<(result: ItemScoreResult) => void>();
    render(<OrderingRenderer item={parsedOrdering()} attemptId="attempt-1" onScore={onScore} />);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onScore).toHaveBeenCalledTimes(1);
    const result = onScore.mock.calls[0][0];
    expect(result.possible).toBe(3);
    expect(result.subResults).toHaveLength(3);
  });
});
