import { describe, expect, it } from "vitest";
import { parseLessonDocument } from "./parseLessonDocument";

function validSelectionBlock(id: string) {
  return {
    id,
    kind: "practice",
    type: "selection",
    payload: {
      prompt: "Pick the correct translation of 'cat'",
      multi: false,
      options: [
        { id: "a", text: "Cat" },
        { id: "b", text: "Dog" },
      ],
      correctOptionIds: ["a"],
      explanationRef: "r1",
      explanations: { r1: "\"Cat\" means \"cat\"." },
    },
  };
}

function validProseBlock(id: string) {
  return { id, kind: "theory", type: "prose", text: [{ text: "Cats are animals." }] };
}

describe("parseLessonDocument — the valid mixed lesson", () => {
  it("accepts theory blocks interleaved with practice blocks", () => {
    const result = parseLessonDocument([validProseBlock("p1"), validSelectionBlock("q1"), validProseBlock("p2")]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document).toHaveLength(3);
      expect(result.document[1]).toMatchObject({ id: "q1", kind: "practice" });
    }
  });
});

describe("parseLessonDocument — rejections", () => {
  it("rejects a non-array document", () => {
    const result = parseLessonDocument({ not: "an array" });
    expect(result.ok).toBe(false);
  });

  it("rejects a block with no recognizable kind", () => {
    const result = parseLessonDocument([{ id: "x1", type: "prose", text: [{ text: "hi" }] }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].field).toBe("x1");
  });

  it("rejects an invalid theory block and names the block id and field", () => {
    const result = parseLessonDocument([{ id: "bad-heading", kind: "theory", type: "heading", text: [] }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.field.startsWith("bad-heading"))).toBe(true);
    }
  });

  it("rejects an invalid practice block via parseItem and names the block id and field", () => {
    const badItem = {
      id: "bad-q1",
      kind: "practice",
      type: "selection",
      payload: {
        prompt: "Pick one",
        multi: false,
        options: [{ id: "a", text: "Only one option" }], // needs >= 2
        correctOptionIds: ["a"],
        explanationRef: "r1",
        explanations: { r1: "explanation" },
      },
    };
    const result = parseLessonDocument([badItem]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field.startsWith("bad-q1")).toBe(true);
      expect(result.errors[0].field).toContain("payload.options");
    }
  });

  it("rejects an explanation-coverage gap on a practice block — every 0008-0017 invariant applies", () => {
    const badItem = {
      id: "q-no-explanation",
      kind: "practice",
      type: "selection",
      payload: {
        prompt: "Pick one",
        multi: false,
        options: [
          { id: "a", text: "A" },
          { id: "b", text: "B" },
        ],
        correctOptionIds: ["a"],
        explanationRef: "r1",
        explanations: {}, // r1 resolves to nothing, and no fallback is set
      },
    };
    const result = parseLessonDocument([badItem]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].field.startsWith("q-no-explanation")).toBe(true);
    }
  });

  it("rejects a duplicate block id", () => {
    const result = parseLessonDocument([validProseBlock("dup"), validSelectionBlock("dup")]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes("duplicate block id"))).toBe(true);
    }
  });
});

describe("parseLessonDocument — a lesson with zero practice blocks", () => {
  // Decided in docs/decisions/0020-cnt003-lesson-blocks.md: VALID. A
  // theory-only lesson is accepted, not rejected — see that file for why.
  it("is accepted as a valid, theory-only lesson", () => {
    const result = parseLessonDocument([validProseBlock("p1"), validProseBlock("p2")]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.every((b) => b.kind === "theory")).toBe(true);
    }
  });

  it("an empty document (zero blocks of any kind) is also accepted", () => {
    const result = parseLessonDocument([]);
    expect(result.ok).toBe(true);
  });
});
