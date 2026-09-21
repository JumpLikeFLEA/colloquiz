import { describe, it, expect } from "vitest";
import { ItemResponseError } from "./errors";
import { orderingModule } from "./ordering";
import type { OrderingItem } from "./types";

/**
 * ITEM-005. Scoring rule under test (docs/decisions/0011): per-position
 * credit — `earned` = positions matching the authored order, `possible` =
 * element count. `elements` is authored IN THE CORRECT ORDER; a response is
 * an id sequence, never a position sequence (see lib/items/shuffle.test.ts,
 * "no scoring depends on presentation order").
 *
 * Fixtures are built THROUGH `parse`, never hand-constructed, so every score
 * case also asserts the payload it uses is one `parse` accepts.
 */

function parsedItem(payload: unknown, id = "item-1"): OrderingItem {
  const result = orderingModule.parse({ id, type: "ordering", payload });
  if (!result.ok) {
    throw new Error(`fixture did not parse: ${JSON.stringify(result.errors)}`);
  }
  return result.item;
}

const element = (id: string) => ({ id, text: `word ${id}` });

/** 5 elements, correct order is a, b, c, d, e. */
const fiveWordOrder = () =>
  parsedItem({
    prompt: "Put the words in order.",
    elements: [element("a"), element("b"), element("c"), element("d"), element("e")],
    explanationRef: "exp-order",
  });

const order = (...ids: string[]) => ({ order: ids });

describe("ordering — permutation of N elements", () => {
  it("scores an exact match: every position correct, earned equals possible", () => {
    const item = fiveWordOrder();
    const result = orderingModule.score(item, order("a", "b", "c", "d", "e"));
    expect(result.earned).toBe(5);
    expect(result.possible).toBe(5);
  });

  it("scores a fully reversed order: every position wrong except possibly the middle", () => {
    const item = fiveWordOrder();
    // a,b,c,d,e -> e,d,c,b,a: only the middle (c) lands back on its own position.
    const result = orderingModule.score(item, order("e", "d", "c", "b", "a"));
    expect(result.earned).toBe(1);
    expect(result.possible).toBe(5);
  });

  it("scores one adjacent swap: N-2 positions correct, partial credit for the rest", () => {
    const item = fiveWordOrder();
    // Swap b and c: a,c,b,d,e — positions 0,3,4 correct; 1,2 wrong.
    const result = orderingModule.score(item, order("a", "c", "b", "d", "e"));
    expect(result.earned).toBe(3);
    expect(result.possible).toBe(5);
  });

  it("carries one subResult per position, each with the element id that belongs there", () => {
    const item = fiveWordOrder();
    const result = orderingModule.score(item, order("a", "c", "b", "d", "e"));
    expect(result.subResults).toHaveLength(5);
    expect(result.subResults[0]).toEqual({ id: "a", correct: true, earned: 1, possible: 1, explanationRef: "exp-order" });
    expect(result.subResults[1]).toEqual({ id: "b", correct: false, earned: 0, possible: 1, explanationRef: "exp-order" });
    expect(result.subResults[2]).toEqual({ id: "c", correct: false, earned: 0, possible: 1, explanationRef: "exp-order" });
  });

  it("an unattempted item (null, undefined) scores 0 of the element count", () => {
    const item = fiveWordOrder();
    expect(orderingModule.score(item, null)).toMatchObject({ earned: 0, possible: 5 });
    expect(orderingModule.score(item, undefined)).toMatchObject({ earned: 0, possible: 5 });
  });

  it("scoring never depends on presentation order, only on the submitted id sequence", () => {
    // Regardless of what order the caller happens to pass, the SCORE for the
    // same submitted id sequence is identical — this module has no notion of
    // "presentation order" to consult in the first place.
    const item = fiveWordOrder();
    const first = orderingModule.score(item, order("a", "b", "c", "d", "e"));
    const second = orderingModule.score(parsedItem(item.payload, "item-1"), order("a", "b", "c", "d", "e"));
    expect(second.earned).toBe(first.earned);
  });
});

describe("ordering — a client bug must not look like a wrong answer", () => {
  function scoreError(item: OrderingItem, response: unknown): ItemResponseError {
    try {
      orderingModule.score(item, response);
    } catch (error) {
      if (error instanceof ItemResponseError) return error;
      throw error;
    }
    throw new Error("expected score() to throw an ItemResponseError, but it returned a score");
  }

  it("throws on a response with a duplicated element — a permutation cannot repeat a slot", () => {
    const error = scoreError(fiveWordOrder(), order("a", "a", "c", "d", "e"));
    expect(error.code).toBe("duplicate_id");
    expect(error.itemId).toBe("item-1");
    expect(error.itemType).toBe("ordering");
    expect(error.message).toContain("a");
  });

  it("throws on a response missing an element — an incomplete permutation, not a partial score", () => {
    const error = scoreError(fiveWordOrder(), order("a", "b", "c", "d"));
    expect(error.code).toBe("missing_element");
    expect(error.message).toContain("e");
  });

  it("throws on a response with an element not in the item", () => {
    const error = scoreError(fiveWordOrder(), order("a", "b", "c", "d", "zz"));
    expect(error.code).toBe("unknown_id");
    expect(error.message).toContain("zz");
  });

  it("throws on a malformed response rather than scoring it zero", () => {
    expect(scoreError(fiveWordOrder(), { order: "a" }).code).toBe("malformed");
    expect(scoreError(fiveWordOrder(), ["a", "b", "c", "d", "e"]).code).toBe("malformed");
    expect(scoreError(fiveWordOrder(), 42).code).toBe("malformed");
    expect(scoreError(fiveWordOrder(), { order: ["a", ""] }).code).toBe("malformed");
  });

  it("a thrown error is distinguishable from a real zero score", () => {
    const zero = orderingModule.score(fiveWordOrder(), order("e", "d", "c", "b", "a"));
    expect(zero.earned).toBe(1); // fully reversed still scores (the middle lands correctly), it does not throw
    expect(scoreError(fiveWordOrder(), order("a", "b", "c", "d", "nope")).code).toBe("unknown_id");
  });
});

describe("ordering — parse rejects items that cannot be scored meaningfully", () => {
  const reject = (payload: unknown) => {
    const result = orderingModule.parse({ id: "item-x", type: "ordering", payload });
    if (result.ok) throw new Error("expected parse to reject this payload");
    return result.errors;
  };

  const base = { prompt: "Order these.", elements: [element("a"), element("b"), element("c")], explanationRef: "exp" };

  it("rejects fewer than two elements — a single order has nothing to measure", () => {
    const errors = reject({ ...base, elements: [element("a")] });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe("payload.elements");
  });

  it("rejects duplicate element ids", () => {
    const errors = reject({ ...base, elements: [element("a"), element("a"), element("c")] });
    expect(errors.some((e) => e.message.includes("must be distinct"))).toBe(true);
  });

  it("applies the shared authoredString guard to the prompt and each element's text", () => {
    expect(reject({ ...base, prompt: "two\nlines" })[0].field).toBe("payload.prompt");
    expect(
      reject({ ...base, elements: [element("a"), { id: "b", text: "bad\ttab" }, element("c")] })[0].field,
    ).toBe("payload.elements[1].text");
  });

  it("rejects a missing explanationRef", () => {
    const errors = reject({ ...base, explanationRef: "" });
    expect(errors.some((e) => e.field.includes("explanationRef"))).toBe(true);
  });

  it("rejects an unknown field rather than stripping it", () => {
    expect(reject({ ...base, shuffle: false })[0].field).toContain("payload");
  });

  it("rejects a non-ordering item and a missing envelope", () => {
    const wrongType = orderingModule.parse({ id: "i", type: "selection", payload: {} });
    expect(wrongType.ok).toBe(false);
    if (!wrongType.ok) expect(wrongType.errors[0].message).toContain('expected "ordering"');
    expect(orderingModule.parse(null).ok).toBe(false);
    expect(orderingModule.parse({ type: "ordering", payload: {} }).ok).toBe(false);
  });
});

describe("ordering — lesson totals stay well-formed", () => {
  it("earned/possible are always finite and possible matches the element count, across every response shape", () => {
    const item = fiveWordOrder();
    const responses = [
      null,
      undefined,
      order("a", "b", "c", "d", "e"),
      order("e", "d", "c", "b", "a"),
      order("a", "c", "b", "d", "e"),
    ];
    for (const response of responses) {
      const result = orderingModule.score(item, response);
      expect(Number.isFinite(result.earned)).toBe(true);
      expect(result.possible).toBe(5);
      expect(result.earned).toBe(result.subResults.reduce((n, s) => n + s.earned, 0));
      expect(result.possible).toBe(result.subResults.reduce((n, s) => n + s.possible, 0));
    }
  });
});
