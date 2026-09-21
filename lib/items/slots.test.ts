import { describe, it, expect } from "vitest";
import { ItemResponseError } from "./errors";
import { slotsModule } from "./slots";
import type { SlotsItem } from "./types";

/**
 * ITEM-007. Scoring rule under test (docs/decisions/0014): per-gap credit —
 * `earned` = gaps whose (normalised) answer is in the gap's (normalised)
 * accepted-answer list, `possible` = gap count. Normalisation is this card's
 * substance: case, whitespace (leading/trailing/internal), curly-vs-straight
 * apostrophe, and trailing punctuation — each gets its own test below.
 *
 * Fixtures are built THROUGH `parse`, never hand-constructed, so every score
 * case also asserts the payload it uses is one `parse` accepts.
 */

/** Merges in a default `fallbackExplanation` (ITEM-009) so fixtures that
 * predate explanation coverage don't each need updating individually — a
 * caller testing explanation resolution itself overrides `explanations`/
 * `fallbackExplanation` explicitly. */
function parsedItem(payload: unknown, id = "item-1"): SlotsItem {
  const result = slotsModule.parse({
    id,
    type: "slots",
    payload: { explanations: {}, fallbackExplanation: "explanation", ...(payload as object) },
  });
  if (!result.ok) {
    throw new Error(`fixture did not parse: ${JSON.stringify(result.errors)}`);
  }
  return result.item;
}

const gap = (id: string, ...acceptedAnswers: string[]) => ({
  id,
  acceptedAnswers,
  explanationRef: `exp-${id}`,
});

/** 3 gaps: g1 accepts "cat", g2 accepts "run"/"ran" (two entries), g3 accepts "don't". */
const threeGaps = (input: "typed" | "drag" = "typed") =>
  parsedItem({
    prompt: "I have a ___. I ___ yesterday. I ___ care.",
    input,
    gaps: [gap("g1", "cat"), gap("g2", "run", "ran"), gap("g3", "don't")],
  });

const answer = (...entries: Array<[string, string]>) => entries.map(([gapId, ans]) => ({ gapId, answer: ans }));

describe("slots — N gaps, each with a list of accepted answers", () => {
  it("scores all gaps right", () => {
    const item = threeGaps();
    const result = slotsModule.score(item, answer(["g1", "cat"], ["g2", "run"], ["g3", "don't"]));
    expect(result.earned).toBe(3);
    expect(result.possible).toBe(3);
  });

  it("scores none right", () => {
    const item = threeGaps();
    const result = slotsModule.score(item, answer(["g1", "dog"], ["g2", "jump"], ["g3", "won't"]));
    expect(result.earned).toBe(0);
    expect(result.possible).toBe(3);
  });

  it("scores some right (partial credit)", () => {
    const item = threeGaps();
    const result = slotsModule.score(item, answer(["g1", "cat"], ["g2", "jump"], ["g3", "don't"]));
    expect(result.earned).toBe(2);
    expect(result.possible).toBe(3);
  });

  it("an empty gap (blank submitted) scores incorrect, not excluded", () => {
    const item = threeGaps();
    const result = slotsModule.score(item, answer(["g1", "cat"], ["g2", ""], ["g3", "don't"]));
    expect(result.earned).toBe(2);
    expect(result.possible).toBe(3);
    expect(result.subResults.find((r) => r.id === "g2")).toMatchObject({ correct: false, earned: 0, possible: 1 });
  });

  it("a gap missing from the response entirely scores incorrect, not excluded", () => {
    const item = threeGaps();
    const result = slotsModule.score(item, answer(["g1", "cat"], ["g3", "don't"]));
    expect(result.earned).toBe(2);
    expect(result.possible).toBe(3);
    expect(result.subResults).toHaveLength(3);
  });

  it("whitespace-padded input is accepted (leading/trailing and collapsed internal)", () => {
    const item = parsedItem({
      prompt: "The city is ___.",
      input: "typed",
      gaps: [gap("g1", "New York")],
    });
    expect(slotsModule.score(item, answer(["g1", "  New York  "])).earned).toBe(1);
    expect(slotsModule.score(item, answer(["g1", "New   York"])).earned).toBe(1);
  });

  it("wrong case is accepted", () => {
    const item = threeGaps();
    expect(slotsModule.score(item, answer(["g1", "CAT"], ["g2", "RUN"], ["g3", "DON'T"])).earned).toBe(3);
  });

  it("a curly apostrophe matches a straight-apostrophe accepted answer, and vice versa", () => {
    const item = threeGaps();
    expect(slotsModule.score(item, answer(["g3", "don’t"])).subResults.find((r) => r.id === "g3")?.correct).toBe(
      true,
    );

    const curlyAuthored = parsedItem({
      prompt: "I ___ care.",
      input: "typed",
      gaps: [gap("g1", "don’t")],
    });
    expect(slotsModule.score(curlyAuthored, answer(["g1", "don't"])).earned).toBe(1);
  });

  it("trailing punctuation on the submitted answer is stripped before comparison", () => {
    const item = threeGaps();
    expect(slotsModule.score(item, answer(["g1", "cat."], ["g2", "run!"], ["g3", "don't?"])).earned).toBe(3);
  });

  it("an answer matching the second entry in the accepted list is correct", () => {
    const item = threeGaps();
    expect(slotsModule.score(item, answer(["g2", "ran"])).subResults.find((r) => r.id === "g2")?.correct).toBe(true);
  });

  it("carries one subResult per gap", () => {
    const item = threeGaps();
    const result = slotsModule.score(item, answer(["g1", "cat"], ["g2", "wrong"], ["g3", "don't"]));
    expect(result.subResults).toEqual([
      { id: "g1", correct: true, earned: 1, possible: 1, explanationRef: "exp-g1" },
      { id: "g2", correct: false, earned: 0, possible: 1, explanationRef: "exp-g2" },
      { id: "g3", correct: true, earned: 1, possible: 1, explanationRef: "exp-g3" },
    ]);
  });

  it("an unattempted item (null, undefined) scores 0 of the gap count", () => {
    const item = threeGaps();
    expect(slotsModule.score(item, null)).toMatchObject({ earned: 0, possible: 3 });
    expect(slotsModule.score(item, undefined)).toMatchObject({ earned: 0, possible: 3 });
  });

  it("the same response scores identically regardless of the item's input affordance", () => {
    const typedItem = threeGaps("typed");
    const dragItem = threeGaps("drag");
    const response = answer(["g1", "cat"], ["g2", "jump"], ["g3", "don't"]);
    expect(slotsModule.score(typedItem, response)).toEqual(slotsModule.score(dragItem, response));
  });

  it("a near-miss is wrong — fuzzy matching is out of scope (0014)", () => {
    const item = threeGaps();
    expect(slotsModule.score(item, answer(["g1", "cats"])).subResults[0].correct).toBe(false);
  });
});

describe("slots — a client bug must not look like a wrong answer", () => {
  function scoreError(item: SlotsItem, response: unknown): ItemResponseError {
    try {
      slotsModule.score(item, response);
    } catch (error) {
      if (error instanceof ItemResponseError) return error;
      throw error;
    }
    throw new Error("expected score() to throw an ItemResponseError, but it returned a score");
  }

  it("throws on a response with a duplicated gap id", () => {
    const error = scoreError(threeGaps(), answer(["g1", "cat"], ["g1", "dog"]));
    expect(error.code).toBe("duplicate_id");
    expect(error.itemId).toBe("item-1");
    expect(error.itemType).toBe("slots");
    expect(error.message).toContain("g1");
  });

  it("throws on a response naming a gap id not on the item", () => {
    const error = scoreError(threeGaps(), answer(["zz", "cat"]));
    expect(error.code).toBe("unknown_id");
    expect(error.message).toContain("zz");
  });

  it("throws on a malformed response rather than scoring it zero", () => {
    expect(scoreError(threeGaps(), { gapId: "g1", answer: "cat" }).code).toBe("malformed");
    expect(scoreError(threeGaps(), ["g1"]).code).toBe("malformed");
    expect(scoreError(threeGaps(), 42).code).toBe("malformed");
    expect(scoreError(threeGaps(), [{ gapId: "g1", answer: 5 }]).code).toBe("malformed");
  });

  it("a thrown error is distinguishable from a real zero score", () => {
    const zero = slotsModule.score(threeGaps(), answer(["g1", "dog"], ["g2", "jump"], ["g3", "won't"]));
    expect(zero.earned).toBe(0);
    expect(scoreError(threeGaps(), answer(["g1", "cat"], ["nope", "x"])).code).toBe("unknown_id");
  });
});

describe("slots — parse rejects items that cannot be scored meaningfully", () => {
  const reject = (payload: unknown) => {
    const result = slotsModule.parse({ id: "item-x", type: "slots", payload });
    if (result.ok) throw new Error("expected parse to reject this payload");
    return result.errors;
  };

  const base = {
    prompt: "Fill in the blanks.",
    input: "typed",
    gaps: [gap("g1", "cat"), gap("g2", "dog")],
    explanations: {},
    fallbackExplanation: "explanation",
  };

  it("rejects zero gaps — an item with nothing to score measures nothing", () => {
    const errors = reject({ ...base, gaps: [] });
    expect(errors.some((e) => e.field === "payload.gaps")).toBe(true);
  });

  it("rejects a gap with zero accepted answers", () => {
    const errors = reject({ ...base, gaps: [{ id: "g1", acceptedAnswers: [], explanationRef: "exp" }] });
    expect(errors.some((e) => e.field === "payload.gaps[0].acceptedAnswers")).toBe(true);
  });

  it("rejects duplicate gap ids", () => {
    const errors = reject({ ...base, gaps: [gap("g1", "cat"), gap("g1", "dog")] });
    expect(errors.some((e) => e.message.includes("must be distinct"))).toBe(true);
  });

  it("rejects an invalid input affordance", () => {
    const errors = reject({ ...base, input: "voice" });
    expect(errors.some((e) => e.field === "payload.input")).toBe(true);
  });

  it("applies the shared authoredString guard to accepted answers", () => {
    const errors = reject({ ...base, gaps: [{ id: "g1", acceptedAnswers: ["bad\ttab"], explanationRef: "exp" }] });
    expect(errors[0].field).toBe("payload.gaps[0].acceptedAnswers[0]");
  });

  it("rejects an unknown field rather than stripping it", () => {
    expect(reject({ ...base, shuffle: false })[0].field).toContain("payload");
  });

  it("rejects a non-slots item and a missing envelope", () => {
    const wrongType = slotsModule.parse({ id: "i", type: "selection", payload: {} });
    expect(wrongType.ok).toBe(false);
    if (!wrongType.ok) expect(wrongType.errors[0].message).toContain('expected "slots"');
    expect(slotsModule.parse(null).ok).toBe(false);
    expect(slotsModule.parse({ type: "slots", payload: {} }).ok).toBe(false);
  });
});

describe("slots — lesson totals stay well-formed", () => {
  it("earned/possible are always finite and possible matches the gap count, across every response shape", () => {
    const item = threeGaps();
    const responses = [
      null,
      undefined,
      answer(["g1", "cat"], ["g2", "run"], ["g3", "don't"]),
      answer(["g1", "dog"], ["g2", "jump"], ["g3", "won't"]),
      answer(["g1", "cat"]),
    ];
    for (const response of responses) {
      const result = slotsModule.score(item, response);
      expect(Number.isFinite(result.earned)).toBe(true);
      expect(result.possible).toBe(3);
      expect(result.earned).toBe(result.subResults.reduce((n, s) => n + s.earned, 0));
      expect(result.possible).toBe(result.subResults.reduce((n, s) => n + s.possible, 0));
    }
  });
});
