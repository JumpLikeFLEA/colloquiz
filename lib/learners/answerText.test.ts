import { describe, expect, it } from "vitest";
import { answerText } from "./answerText";

// TCH-003: every block below is parsed by the real registry inside answerText,
// so a fixture the parser rejects shows up as "unreadable", never as a pass.

const base = { explanations: {}, fallbackExplanation: "why" };

const selection = {
  id: "b1", kind: "practice", type: "selection",
  payload: {
    ...base, prompt: "Pick", multi: true,
    options: [{ id: "a", text: "Apple" }, { id: "b", text: "Banana" }, { id: "c", text: "Cherry" }],
    correctOptionIds: ["a"], explanationRef: "x",
  },
};
const grid = {
  id: "b2", kind: "practice", type: "selection_grid",
  payload: {
    ...base, prompt: "T/F",
    rows: [
      { id: "r1", statement: "Sky is blue", correct: true, explanationRef: "x" },
      { id: "r2", statement: "Fire is cold", correct: false, explanationRef: "x" },
    ],
  },
};
const ordering = {
  id: "b3", kind: "practice", type: "ordering",
  payload: {
    ...base, prompt: "Order",
    elements: [
      { id: "e1", text: "First", explanationRef: "x" },
      { id: "e2", text: "Second", explanationRef: "x" },
    ],
  },
};
const matching = {
  id: "b4", kind: "practice", type: "matching",
  payload: {
    ...base, prompt: "Match",
    left: [
      { id: "l1", content: { kind: "text", text: "cat" } },
      { id: "l2", content: { kind: "image", src: "https://x/y.png", alt: "dog" } },
    ],
    right: [{ id: "r1", content: { kind: "text", text: "chat" } }, { id: "r2", content: { kind: "text", text: "chien" } }],
    pairs: [
      { id: "p1", left: "l1", right: "r1", explanationRef: "x" },
      { id: "p2", left: "l2", right: "r2", explanationRef: "x" },
    ],
  },
};
const slots = {
  id: "b5", kind: "practice", type: "slots",
  payload: {
    ...base, prompt: "Fill", input: "typed",
    gaps: [
      { id: "g1", acceptedAnswers: ["is"], explanationRef: "x" },
      { id: "g2", acceptedAnswers: ["are"], explanationRef: "x" },
    ],
  },
};

describe("answerText", () => {
  it("selection lists the chosen option texts", () => {
    expect(answerText(selection, { selectedOptionIds: ["a", "c"] })).toEqual({
      status: "ok", prompt: "Pick", lines: ["Apple", "Cherry"],
    });
    expect(answerText(selection, { selectedOptionIds: [] })).toMatchObject({ lines: ["Nothing selected"] });
  });

  it("selection_grid shows each row, unanswered ones as no answer", () => {
    expect(answerText(grid, [{ rowId: "r2", answer: false }])).toMatchObject({
      lines: ["Sky is blue: no answer", "Fire is cold: False"],
    });
  });

  it("ordering numbers the learner's sequence", () => {
    expect(answerText(ordering, { order: ["e2", "e1"] })).toMatchObject({ lines: ["1. Second", "2. First"] });
  });

  it("matching shows left → right and an image by its alt text", () => {
    expect(answerText(matching, [{ left: "l2", right: "r1" }])).toMatchObject({
      lines: ["cat → no answer", "[image: dog] → chat"],
    });
  });

  it("slots numbers gaps by authored position; blank counts as no answer", () => {
    expect(answerText(slots, [{ gapId: "g2", answer: "are" }, { gapId: "g1", answer: "  " }])).toMatchObject({
      lines: ["Gap 1: no answer", "Gap 2: are"],
    });
  });

  it("an option removed since the attempt is named, not dropped", () => {
    expect(answerText(selection, { selectedOptionIds: ["zzz"] })).toMatchObject({
      lines: ["(an option that is no longer in the lesson)"],
    });
  });

  it("no stored response says so (null and undefined)", () => {
    expect(answerText(selection, null)).toEqual({ status: "no_response" });
    expect(answerText(selection, undefined)).toEqual({ status: "no_response" });
  });

  it("a malformed response, a missing block or an unparseable block is unreadable", () => {
    expect(answerText(selection, { selectedOptionIds: "a" })).toEqual({ status: "unreadable" });
    expect(answerText(grid, [{ rowId: 1 }])).toEqual({ status: "unreadable" });
    expect(answerText(null, { order: [] })).toEqual({ status: "unreadable" });
    expect(answerText({ id: "x", kind: "practice", type: "selection", payload: {} }, { selectedOptionIds: [] }))
      .toEqual({ status: "unreadable" });
  });
});
