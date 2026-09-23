import { describe, expect, it } from "vitest";
import { scoreItem } from "../items";
import { orderingModule } from "../items/ordering";
import type { OrderingItem } from "../items";
import { shuffleOrderingIndices } from "../items/shuffle";
import { buildOrderingResponse, initialOrder, moveOrderElement } from "./orderingResponse";

/** Drives the same move/build helpers a renderer's up/down-button handlers
 * call, through to `scoreItem`, without any React/jsdom involved — see the
 * module header for why this is where PLAY-003's "drives the renderer to
 * submission and scores the result" acceptance line is satisfied for
 * `ordering`. */

function parsedOrdering(payload: unknown, id = "ord-1"): OrderingItem {
  const result = orderingModule.parse({
    id,
    type: "ordering",
    payload: { explanations: {}, fallbackExplanation: "explanation", ...(payload as object) },
  });
  if (!result.ok) throw new Error(`fixture did not parse: ${JSON.stringify(result.errors)}`);
  return result.item;
}

describe("moveOrderElement", () => {
  it("swaps with the previous element on 'up', and is a no-op at the top", () => {
    let order = moveOrderElement(["a", "b", "c"], "b", "up");
    expect(order).toEqual(["b", "a", "c"]);
    order = moveOrderElement(order, "b", "up");
    expect(order).toEqual(["b", "a", "c"]);
  });

  it("swaps with the next element on 'down', and is a no-op at the bottom", () => {
    let order = moveOrderElement(["a", "b", "c"], "b", "down");
    expect(order).toEqual(["a", "c", "b"]);
    order = moveOrderElement(order, "b", "down");
    expect(order).toEqual(["a", "c", "b"]);
  });

  it("moving an id not present in the order is a no-op", () => {
    const order = moveOrderElement(["a", "b"], "z", "up");
    expect(order).toEqual(["a", "b"]);
  });
});

const THREE_WORD_ITEM = {
  prompt: "Put the words in order.",
  elements: [
    { id: "e1", text: "I", explanationRef: "r1" },
    { id: "e2", text: "watched", explanationRef: "r1" },
    { id: "e3", text: "a film", explanationRef: "r1" },
  ],
  explanations: { r1: "Subject, verb, object." },
};

describe("ordering: arrange -> build -> score", () => {
  it("scores the authored order as fully correct", () => {
    const item = parsedOrdering(THREE_WORD_ITEM);
    const result = scoreItem(item, buildOrderingResponse(["e1", "e2", "e3"]));
    expect(result.earned).toBe(3);
    expect(result.possible).toBe(3);
    expect(result.subResults.every((r) => r.correct)).toBe(true);
  });

  it("scores each position independently for a partially-wrong arrangement", () => {
    const item = parsedOrdering(THREE_WORD_ITEM);
    const result = scoreItem(item, buildOrderingResponse(["e2", "e1", "e3"]));
    expect(result.earned).toBe(1);
    expect(result.subResults.map((r) => r.correct)).toEqual([false, false, true]);
  });

  it("a sequence of up/down moves converges on the intended arrangement and scores it", () => {
    const item = parsedOrdering(THREE_WORD_ITEM);

    // Displayed (shuffled) order: e3, e1, e2 -- move "e3" down twice to
    // reach the correct e1, e2, e3.
    let order = ["e3", "e1", "e2"];
    order = moveOrderElement(order, "e3", "down");
    order = moveOrderElement(order, "e3", "down");
    expect(order).toEqual(["e1", "e2", "e3"]);

    const result = scoreItem(item, buildOrderingResponse(order));
    expect(result.earned).toBe(3);
  });

  it("initialOrder maps shuffled display indices to element ids, and presentation order never affects the score (0007)", () => {
    const item = parsedOrdering(THREE_WORD_ITEM);
    const elementIds = item.payload.elements.map((e) => e.id);
    const displayIndices = shuffleOrderingIndices(elementIds.length, "attempt-1", item.id);
    const order = initialOrder(elementIds, displayIndices);

    expect(order.slice().sort()).toEqual(elementIds.slice().sort());
    expect(order).not.toEqual(elementIds); // shuffleOrderingIndices guarantees never-identity for n>=2

    // Submitting the displayed order as-is, with no moves, scores purely by
    // id sequence -- never by original authored array position.
    const result = scoreItem(item, buildOrderingResponse(order));
    expect(result.possible).toBe(3);
    const expectedEarned = order.filter((id, i) => id === elementIds[i]).length;
    expect(result.earned).toBe(expectedEarned);
  });
});
