import { describe, it, expect } from "vitest";
import { ItemResponseError } from "./errors";
import { matchingModule } from "./matching";
import type { MatchingItem } from "./types";

/**
 * ITEM-006. Scoring rule under test (docs/decisions/0013): per-pair credit —
 * `earned` = pairs whose response matches the authored right id, `possible`
 * = number of pairs (left elements with a correct partner; unpaired left
 * elements and unpaired right elements never count). `subResults[].id` is
 * the pair's own `id`, not either element's — see the decision doc.
 *
 * Fixtures are built THROUGH `parse`, never hand-constructed, so every score
 * case also asserts the payload it uses is one `parse` accepts.
 */

function parsedItem(payload: unknown, id = "item-1"): MatchingItem {
  const result = matchingModule.parse({ id, type: "matching", payload });
  if (!result.ok) {
    throw new Error(`fixture did not parse: ${JSON.stringify(result.errors)}`);
  }
  return result.item;
}

const textElement = (id: string) => ({ id, content: { kind: "text" as const, text: `word ${id}` } });
const imageElement = (id: string) => ({
  id,
  content: { kind: "image" as const, src: `https://example.com/${id}.png`, alt: `picture of ${id}` },
});

/** 3 pairs: l1-r1, l2-r2, l3-r3. No distractors. */
const threePairs = () =>
  parsedItem({
    prompt: "Match the words to their definitions.",
    left: [textElement("l1"), textElement("l2"), textElement("l3")],
    right: [textElement("r1"), textElement("r2"), textElement("r3")],
    pairs: [
      { id: "p1", left: "l1", right: "r1", explanationRef: "exp-1" },
      { id: "p2", left: "l2", right: "r2", explanationRef: "exp-2" },
      { id: "p3", left: "l3", right: "r3", explanationRef: "exp-3" },
    ],
  });

const answer = (...entries: Array<[string, string]>) => entries.map(([left, right]) => ({ left, right }));

describe("matching — pairs between a left and right side", () => {
  it("scores every pair correct: earned equals possible", () => {
    const item = threePairs();
    const result = matchingModule.score(item, answer(["l1", "r1"], ["l2", "r2"], ["l3", "r3"]));
    expect(result.earned).toBe(3);
    expect(result.possible).toBe(3);
  });

  it("scores none correct", () => {
    const item = threePairs();
    const result = matchingModule.score(item, answer(["l1", "r2"], ["l2", "r3"], ["l3", "r1"]));
    expect(result.earned).toBe(0);
    expect(result.possible).toBe(3);
  });

  it("scores half (partial credit)", () => {
    const item = threePairs();
    const result = matchingModule.score(item, answer(["l1", "r1"], ["l2", "r2"], ["l3", "r1"]));
    expect(result.earned).toBe(2);
    expect(result.possible).toBe(3);
  });

  it("a left item left unpaired scores that pair incorrect, not excluded", () => {
    const item = threePairs();
    const result = matchingModule.score(item, answer(["l1", "r1"], ["l2", "r2"]));
    expect(result.earned).toBe(2);
    expect(result.possible).toBe(3);
    expect(result.subResults).toHaveLength(3);
    expect(result.subResults.find((r) => r.id === "p3")).toMatchObject({ correct: false, earned: 0, possible: 1 });
  });

  it("two left items mapped to the same right item are scored independently (many-to-one is legal)", () => {
    const item = parsedItem({
      prompt: "Match the synonyms to the definition.",
      left: [textElement("l1"), textElement("l2")],
      right: [textElement("r1")],
      pairs: [
        { id: "p1", left: "l1", right: "r1", explanationRef: "exp-1" },
        { id: "p2", left: "l2", right: "r1", explanationRef: "exp-2" },
      ],
    });
    const result = matchingModule.score(item, answer(["l1", "r1"], ["l2", "r1"]));
    expect(result.earned).toBe(2);
    expect(result.possible).toBe(2);
  });

  it("carries one subResult per pair, identified by the pair's own id", () => {
    const item = threePairs();
    const result = matchingModule.score(item, answer(["l1", "r1"], ["l2", "r3"], ["l3", "r3"]));
    expect(result.subResults).toEqual([
      { id: "p1", correct: true, earned: 1, possible: 1, explanationRef: "exp-1" },
      { id: "p2", correct: false, earned: 0, possible: 1, explanationRef: "exp-2" },
      { id: "p3", correct: true, earned: 1, possible: 1, explanationRef: "exp-3" },
    ]);
  });

  it("an unattempted item (null, undefined) scores 0 of the pair count", () => {
    const item = threePairs();
    expect(matchingModule.score(item, null)).toMatchObject({ earned: 0, possible: 3 });
    expect(matchingModule.score(item, undefined)).toMatchObject({ earned: 0, possible: 3 });
  });

  it("a left distractor (no pair) and a right distractor never count toward possible", () => {
    const item = parsedItem({
      prompt: "Match the words. Some options are unused.",
      left: [textElement("l1"), textElement("l2")],
      right: [textElement("r1"), textElement("r2")],
      pairs: [{ id: "p1", left: "l1", right: "r1", explanationRef: "exp-1" }],
    });
    const result = matchingModule.score(item, answer(["l1", "r1"]));
    expect(result.possible).toBe(1);
    expect(result.subResults).toHaveLength(1);
  });

  it("image matching adds no field the scoring module reads — content is opaque to score", () => {
    const item = parsedItem({
      prompt: "Match the word to the picture.",
      left: [textElement("l1")],
      right: [imageElement("r1")],
      pairs: [{ id: "p1", left: "l1", right: "r1", explanationRef: "exp-1" }],
    });
    const result = matchingModule.score(item, answer(["l1", "r1"]));
    expect(result.earned).toBe(1);
    expect(result.possible).toBe(1);
  });
});

describe("matching — a client bug must not look like a wrong answer", () => {
  function scoreError(item: MatchingItem, response: unknown): ItemResponseError {
    try {
      matchingModule.score(item, response);
    } catch (error) {
      if (error instanceof ItemResponseError) return error;
      throw error;
    }
    throw new Error("expected score() to throw an ItemResponseError, but it returned a score");
  }

  it("throws on a response with a duplicated left id", () => {
    const error = scoreError(threePairs(), answer(["l1", "r1"], ["l1", "r2"]));
    expect(error.code).toBe("duplicate_id");
    expect(error.itemId).toBe("item-1");
    expect(error.itemType).toBe("matching");
    expect(error.message).toContain("l1");
  });

  it("throws on a response naming a left id not on the item", () => {
    const error = scoreError(threePairs(), answer(["zz", "r1"]));
    expect(error.code).toBe("unknown_id");
    expect(error.message).toContain("zz");
  });

  it("throws on a response naming a right id not on the item", () => {
    const error = scoreError(threePairs(), answer(["l1", "zz"]));
    expect(error.code).toBe("unknown_id");
    expect(error.message).toContain("zz");
  });

  it("throws on a malformed response rather than scoring it zero", () => {
    expect(scoreError(threePairs(), { left: "l1", right: "r1" }).code).toBe("malformed");
    expect(scoreError(threePairs(), ["l1", "r1"]).code).toBe("malformed");
    expect(scoreError(threePairs(), 42).code).toBe("malformed");
    expect(scoreError(threePairs(), [{ left: "l1", right: "" }]).code).toBe("malformed");
  });

  it("a thrown error is distinguishable from a real zero score", () => {
    const zero = matchingModule.score(threePairs(), answer(["l1", "r2"], ["l2", "r3"], ["l3", "r1"]));
    expect(zero.earned).toBe(0);
    expect(scoreError(threePairs(), answer(["l1", "r1"], ["nope", "r2"])).code).toBe("unknown_id");
  });
});

describe("matching — parse rejects items that cannot be scored meaningfully", () => {
  const reject = (payload: unknown) => {
    const result = matchingModule.parse({ id: "item-x", type: "matching", payload });
    if (result.ok) throw new Error("expected parse to reject this payload");
    return result.errors;
  };

  const base = {
    prompt: "Match these.",
    left: [textElement("l1"), textElement("l2")],
    right: [textElement("r1"), textElement("r2")],
    pairs: [{ id: "p1", left: "l1", right: "r1", explanationRef: "exp" }],
  };

  it("rejects zero pairs — an item with nothing to score measures nothing", () => {
    const errors = reject({ ...base, pairs: [] });
    expect(errors.some((e) => e.field === "payload.pairs")).toBe(true);
  });

  it("rejects duplicate left element ids", () => {
    const errors = reject({ ...base, left: [textElement("l1"), textElement("l1")] });
    expect(errors.some((e) => e.message.includes("must be distinct"))).toBe(true);
  });

  it("rejects duplicate right element ids", () => {
    const errors = reject({ ...base, right: [textElement("r1"), textElement("r1")] });
    expect(errors.some((e) => e.message.includes("must be distinct"))).toBe(true);
  });

  it("rejects two pairs naming the same left element", () => {
    const errors = reject({
      ...base,
      pairs: [
        { id: "p1", left: "l1", right: "r1", explanationRef: "exp" },
        { id: "p2", left: "l1", right: "r2", explanationRef: "exp" },
      ],
    });
    expect(errors.some((e) => e.message.includes("at most one pair"))).toBe(true);
  });

  it("rejects a pair referencing an unknown left id", () => {
    const errors = reject({ ...base, pairs: [{ id: "p1", left: "zz", right: "r1", explanationRef: "exp" }] });
    expect(errors.some((e) => e.field === "payload.pairs[0].left")).toBe(true);
  });

  it("rejects a pair referencing an unknown right id", () => {
    const errors = reject({ ...base, pairs: [{ id: "p1", left: "l1", right: "zz", explanationRef: "exp" }] });
    expect(errors.some((e) => e.field === "payload.pairs[0].right")).toBe(true);
  });

  it("applies the shared authoredString guard to text content", () => {
    const errors = reject({ ...base, left: [{ id: "l1", content: { kind: "text", text: "bad\ttab" } }, textElement("l2")] });
    expect(errors[0].field).toBe("payload.left[0].content.text");
  });

  it("rejects an unknown field rather than stripping it", () => {
    expect(reject({ ...base, shuffle: false })[0].field).toContain("payload");
  });

  it("rejects a non-matching item and a missing envelope", () => {
    const wrongType = matchingModule.parse({ id: "i", type: "selection", payload: {} });
    expect(wrongType.ok).toBe(false);
    if (!wrongType.ok) expect(wrongType.errors[0].message).toContain('expected "matching"');
    expect(matchingModule.parse(null).ok).toBe(false);
    expect(matchingModule.parse({ type: "matching", payload: {} }).ok).toBe(false);
  });
});

describe("matching — lesson totals stay well-formed", () => {
  it("earned/possible are always finite and possible matches the pair count, across every response shape", () => {
    const item = threePairs();
    const responses = [
      null,
      undefined,
      answer(["l1", "r1"], ["l2", "r2"], ["l3", "r3"]),
      answer(["l1", "r2"], ["l2", "r3"], ["l3", "r1"]),
      answer(["l1", "r1"]),
    ];
    for (const response of responses) {
      const result = matchingModule.score(item, response);
      expect(Number.isFinite(result.earned)).toBe(true);
      expect(result.possible).toBe(3);
      expect(result.earned).toBe(result.subResults.reduce((n, s) => n + s.earned, 0));
      expect(result.possible).toBe(result.subResults.reduce((n, s) => n + s.possible, 0));
    }
  });
});
