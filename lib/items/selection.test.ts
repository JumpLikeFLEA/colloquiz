import { describe, it, expect } from "vitest";
import { selectionModule, SelectionResponseError } from "./selection";
import type { SelectionItem } from "./types";

/**
 * ITEM-003. The scoring rule under test (docs/decisions/0008):
 *
 *   earned = correctSelected / max(totalCorrectOptions, selectedCount)
 *
 * Fixtures are built THROUGH `parse`, never hand-constructed, so every score
 * case also asserts the payload it uses is one `parse` accepts.
 */

function parsedItem(payload: unknown, id = "item-1"): SelectionItem {
  const result = selectionModule.parse({ id, type: "selection", payload });
  if (!result.ok) {
    throw new Error(`fixture did not parse: ${JSON.stringify(result.errors)}`);
  }
  return result.item;
}

const options = (...ids: string[]) => ids.map((id) => ({ id, text: `option ${id}` }));

/** MCQ single: 4 options, one correct. */
const singleMcq = () =>
  parsedItem({
    prompt: "Which form is correct?",
    multi: false,
    options: options("a", "b", "c", "d"),
    correctOptionIds: ["b"],
    explanationRef: "exp-single",
  });

/** MCQ multi: 8 options, 4 correct — the shape the denominator decision is about. */
const multiMcq = () =>
  parsedItem({
    prompt: "Select every correct sentence.",
    multi: true,
    options: options("a", "b", "c", "d", "e", "f", "g", "h"),
    correctOptionIds: ["a", "b", "c", "d"],
    explanationRef: "exp-multi",
  });

/** True/False: the same type, `multi: false` with exactly two options. */
const trueFalse = () =>
  parsedItem({
    prompt: "She have been to London.",
    multi: false,
    options: [
      { id: "t", text: "True" },
      { id: "f", text: "False" },
    ],
    correctOptionIds: ["f"],
    explanationRef: "exp-tf",
  });

const earnedFor = (item: SelectionItem, ...selectedOptionIds: string[]) =>
  selectionModule.score(item, { selectedOptionIds }).earned;

function scoreError(item: SelectionItem, response: unknown): SelectionResponseError {
  try {
    selectionModule.score(item, response);
  } catch (error) {
    if (error instanceof SelectionResponseError) return error;
    throw error;
  }
  throw new Error("expected score() to throw a SelectionResponseError, but it returned a score");
}

describe("selection — one type, three surface forms", () => {
  it("scores single-answer MCQ: right is 1, wrong is 0", () => {
    const item = singleMcq();
    expect(earnedFor(item, "b")).toBe(1);
    expect(earnedFor(item, "c")).toBe(0);
  });

  it("scores True/False identically — multi:false with two options, no special case", () => {
    const item = trueFalse();
    expect(earnedFor(item, "f")).toBe(1);
    expect(earnedFor(item, "t")).toBe(0);
    // The renderer, not the scorer, is what differs: one affordance for all three.
    expect(selectionModule.rendererNeeds.inputs).toEqual(["choice"]);
  });

  it("scores multi-answer MCQ: fully correct is 1, fully wrong is 0", () => {
    const item = multiMcq();
    expect(earnedFor(item, "a", "b", "c", "d")).toBe(1);
    expect(earnedFor(item, "e", "f", "g", "h")).toBe(0);
  });

  it("gives partial credit on multi: 2 of 4 correct options is 0.5, not 0", () => {
    // The handoff principle this implements: "Nothing demotivates the learner."
    expect(earnedFor(multiMcq(), "a", "b")).toBe(0.5);
  });

  it("scores an unattempted item 0 — empty, null and undefined all mean 'no answer'", () => {
    const item = multiMcq();
    expect(earnedFor(item)).toBe(0);
    expect(selectionModule.score(item, null).earned).toBe(0);
    expect(selectionModule.score(item, undefined).earned).toBe(0);
  });

  it("reports possible: 1 and exactly one subResult carrying the explanation ref", () => {
    const partial = selectionModule.score(multiMcq(), { selectedOptionIds: ["a", "b"] });
    expect(partial.possible).toBe(1);
    expect(partial.subResults).toHaveLength(1);
    expect(partial.subResults[0]).toEqual({
      id: "item-1", // one subResult per item: id is the item's own id
      correct: false, // partially credited is NOT correct in the pass/fail sense
      earned: 0.5,
      possible: 1,
      explanationRef: "exp-multi",
    });
    expect(partial.earned).toBe(partial.subResults[0].earned);

    const full = selectionModule.score(multiMcq(), { selectedOptionIds: ["a", "b", "c", "d"] });
    expect(full.subResults[0].correct).toBe(true);
  });
});

describe("selection — the no-penalty rule and its one limit", () => {
  it("never subtracts: a wrong tick alongside right ones still scores above zero", () => {
    // Under the rejected penalty formula this was max(0, (2-2)/4) = 0.
    expect(earnedFor(multiMcq(), "a", "b", "e", "f")).toBe(0.5);
  });

  it("is a plain correctSelected/totalCorrect whenever the learner does not over-select", () => {
    const item = multiMcq(); // 4 correct options
    expect(earnedFor(item, "a")).toBe(0.25);
    expect(earnedFor(item, "a", "b")).toBe(0.5);
    expect(earnedFor(item, "a", "b", "c")).toBe(0.75);
    expect(earnedFor(item, "a", "b", "c", "d")).toBe(1);
  });

  it("selecting one more correct option never lowers the score", () => {
    const item = multiMcq();
    const ladder = [
      earnedFor(item),
      earnedFor(item, "a"),
      earnedFor(item, "a", "b"),
      earnedFor(item, "a", "b", "c"),
      earnedFor(item, "a", "b", "c", "d"),
    ];
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i]).toBeGreaterThanOrEqual(ladder[i - 1]);
    }
  });

  it("the max() denominator: selecting every option does not score 100%", () => {
    // The whole reason the denominator is max(...) and not just totalCorrect.
    // 4 correct of 8 options, all 8 ticked: 4/8, not 4/4.
    expect(earnedFor(multiMcq(), "a", "b", "c", "d", "e", "f", "g", "h")).toBe(0.5);
  });

  it("shotgunning never beats answering exactly", () => {
    const item = multiMcq();
    const exact = earnedFor(item, "a", "b", "c", "d");
    const everything = earnedFor(item, "a", "b", "c", "d", "e", "f", "g", "h");
    expect(everything).toBeLessThan(exact);
  });

  it("over-selecting by one costs less than the rejected penalty formula would have", () => {
    // 4 right + 1 wrong: max() gives 4/5 = 0.8; the penalty formula gave (4-1)/4 = 0.75.
    expect(earnedFor(multiMcq(), "a", "b", "c", "d", "e")).toBe(0.8);
  });
});

describe("selection — a client bug must not look like a wrong answer", () => {
  it("throws on an option id the item does not have", () => {
    const error = scoreError(multiMcq(), { selectedOptionIds: ["a", "zz"] });
    expect(error).toBeInstanceOf(SelectionResponseError);
    expect(error.code).toBe("unknown_option");
    expect(error.itemId).toBe("item-1");
    expect(error.message).toContain("zz");
  });

  it("throws on a malformed response rather than scoring it zero", () => {
    expect(scoreError(multiMcq(), { selectedOptionIds: "a" }).code).toBe("malformed");
    expect(scoreError(multiMcq(), { selected: ["a"] }).code).toBe("malformed");
    expect(scoreError(multiMcq(), ["a"]).code).toBe("malformed");
    expect(scoreError(multiMcq(), 42).code).toBe("malformed");
    expect(scoreError(multiMcq(), { selectedOptionIds: [""] }).code).toBe("malformed");
  });

  it("throws on a duplicated selection — it would silently change the denominator", () => {
    // ["a","a"] would otherwise score 1/2 instead of 1/4: a wrong grade, not just odd input.
    expect(scoreError(multiMcq(), { selectedOptionIds: ["a", "a"] }).code).toBe("duplicate_selection");
  });

  it("throws when a single-answer item receives more than one selection", () => {
    expect(scoreError(singleMcq(), { selectedOptionIds: ["a", "b"] }).code).toBe("too_many_selections");
    expect(scoreError(trueFalse(), { selectedOptionIds: ["t", "f"] }).code).toBe("too_many_selections");
  });

  it("a thrown error is distinguishable from a real zero score", () => {
    const zero = selectionModule.score(multiMcq(), { selectedOptionIds: ["e"] });
    expect(zero.earned).toBe(0); // a genuine wrong answer scores, it does not throw
    expect(scoreError(multiMcq(), { selectedOptionIds: ["nope"] }).code).toBe("unknown_option");
  });
});

describe("selection — parse rejects items that cannot be scored meaningfully", () => {
  const reject = (payload: unknown) => {
    const result = selectionModule.parse({ id: "item-x", type: "selection", payload });
    if (result.ok) throw new Error("expected parse to reject this payload");
    return result.errors;
  };

  const base = {
    prompt: "Pick one.",
    multi: false,
    options: options("a", "b", "c"),
    correctOptionIds: ["a"],
    explanationRef: "exp",
  };

  it("rejects correctOptionIds naming an option that does not exist", () => {
    const errors = reject({ ...base, correctOptionIds: ["zz"] });
    expect(errors[0].field).toBe("payload.correctOptionIds");
    expect(errors[0].message).toContain("zz");
  });

  it("rejects an item where every option is correct — it measures nothing", () => {
    const errors = reject({ ...base, multi: true, correctOptionIds: ["a", "b", "c"] });
    expect(errors.some((e) => e.message.includes("at least one option must be incorrect"))).toBe(true);
  });

  it("rejects a single-answer item with more than one correct option", () => {
    const errors = reject({ ...base, multi: false, correctOptionIds: ["a", "b"] });
    expect(errors.some((e) => e.message.includes("exactly one correct option"))).toBe(true);
  });

  it("rejects duplicate option ids and duplicate option text", () => {
    expect(reject({ ...base, options: [...options("a", "b"), { id: "a", text: "again" }] })[0].field).toBe(
      "payload.options",
    );
    expect(
      reject({ ...base, options: [{ id: "a", text: "same" }, { id: "b", text: "same" }] })[0].message,
    ).toContain("textually distinct");
  });

  it("rejects fewer than two options, and an empty correctOptionIds", () => {
    expect(reject({ ...base, options: options("a") }).length).toBeGreaterThan(0);
    expect(reject({ ...base, correctOptionIds: [] }).length).toBeGreaterThan(0);
  });

  it("applies the shared authoredString guard to prompt and option text", () => {
    // Same C0-control rule as lib/courseContent.ts — no newline smuggled into a stem.
    expect(reject({ ...base, prompt: "two\nlines" })[0].field).toBe("payload.prompt");
    expect(reject({ ...base, options: [{ id: "a", text: "bad\ttab" }, { id: "b", text: "ok" }] })[0].field).toBe(
      "payload.options[0].text",
    );
  });

  it("rejects an unknown field rather than stripping it", () => {
    expect(reject({ ...base, shuffle: false })[0].field).toContain("payload");
  });

  it("rejects a non-selection item and a missing envelope", () => {
    const wrongType = selectionModule.parse({ id: "i", type: "ordering", payload: {} });
    expect(wrongType.ok).toBe(false);
    if (!wrongType.ok) expect(wrongType.errors[0].message).toContain("expected \"selection\"");
    expect(selectionModule.parse(null).ok).toBe(false);
    expect(selectionModule.parse({ type: "selection", payload: {} }).ok).toBe(false);
  });
});

describe("selection — lesson totals stay well-formed", () => {
  it("earned is always in [0,1] and possible is always 1, across every response shape", () => {
    const item = multiMcq();
    const responses = [[], ["a"], ["a", "b"], ["e"], ["a", "e"], ["a", "b", "c", "d"], ["a", "b", "c", "d", "e", "f", "g", "h"]];
    for (const selectedOptionIds of responses) {
      const result = selectionModule.score(item, { selectedOptionIds });
      expect(Number.isFinite(result.earned)).toBe(true);
      expect(result.earned).toBeGreaterThanOrEqual(0);
      expect(result.earned).toBeLessThanOrEqual(1);
      expect(result.possible).toBe(1);
      // Σearned/Σpossible (handoff) only holds if these stay the subResult sums.
      expect(result.earned).toBe(result.subResults.reduce((n, s) => n + s.earned, 0));
      expect(result.possible).toBe(result.subResults.reduce((n, s) => n + s.possible, 0));
    }
  });
});
