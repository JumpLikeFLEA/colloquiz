import { describe, expect, it } from "vitest";
import { aggregateLessonScore, scoreItem, type LessonItemInput } from "../items";
import { countPracticeBlocks, parseLessonDocument } from "./parseLessonDocument";

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

function validSelfCheckBlock(id: string) {
  return {
    id,
    kind: "theory",
    type: "self_check",
    prompt: [{ text: "Rewrite this sentence using present perfect." }],
    response: "short",
    modelAnswer: [{ text: "I have already eaten." }],
  };
}

function validTableBlock(id: string) {
  return {
    id,
    kind: "theory",
    type: "table",
    header: [[{ text: "Verb" }], [{ text: "Past participle" }]],
    rows: [
      [[{ text: "go" }], [{ text: "gone" }]],
      [[{ text: "eat" }], [{ text: "eaten" }]],
    ],
  };
}

describe("parseLessonDocument — self_check contributes nothing to scoring or the item count", () => {
  it("countPracticeBlocks excludes self_check and every other theory block", () => {
    const result = parseLessonDocument([validProseBlock("p1"), validSelfCheckBlock("sc1"), validSelectionBlock("q1")]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(countPracticeBlocks(result.document)).toBe(1);
  });

  it("a document of only self_check + theory blocks counts zero practice blocks", () => {
    const result = parseLessonDocument([validSelfCheckBlock("sc1"), validProseBlock("p1")]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(countPracticeBlocks(result.document)).toBe(0);
  });

  it("feeding only the practice blocks to aggregateLessonScore excludes self_check's contribution entirely", () => {
    const result = parseLessonDocument([validSelfCheckBlock("sc1"), validSelectionBlock("q1")]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const inputs: LessonItemInput[] = result.document
      .filter((block): block is Extract<typeof block, { kind: "practice" }> => block.kind === "practice")
      .map((block) => ({ itemId: block.id, result: scoreItem(block.item, { selectedOptionIds: ["a"] }) }));

    // Only q1 (possible: 1) enters the aggregate; sc1 contributes nothing —
    // if it did, Σpossible would be > 1.
    expect(inputs).toHaveLength(1);
    const lesson = aggregateLessonScore(inputs);
    expect(lesson.possible).toBe(1);
  });
});

describe("parseLessonDocument — self_check never reaches parseItem", () => {
  it("a self_check block with fields that would fail parseItem still parses as theory", () => {
    // No "payload" at all — would be an instant parseItem rejection — yet
    // self_check parses fine because it never goes through that path.
    const result = parseLessonDocument([validSelfCheckBlock("sc1")]);
    expect(result.ok).toBe(true);
  });
});

describe("parseLessonDocument — table row/column mismatch", () => {
  it("rejects a table row with a different column count than the header, naming the block id and row", () => {
    const badTable = { ...validTableBlock("tbl1"), rows: [[[{ text: "go" }]], [[{ text: "eat" }], [{ text: "eaten" }]]] };
    const result = parseLessonDocument([badTable]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.field === "tbl1: rows[0]")).toBe(true);
    }
  });
});

describe("parseLessonDocument — a lesson using every new block and mark", () => {
  it("accepts self_check, table, and mark_a/mark_b inline marks together with existing blocks", () => {
    const result = parseLessonDocument([
      validProseBlock("p1"),
      { id: "hl1", kind: "theory", type: "prose", text: [{ text: "have eaten", marks: ["mark_a"] }, { text: " vs " }, { text: "ate", marks: ["mark_b"] }] },
      validTableBlock("tbl1"),
      validSelfCheckBlock("sc1"),
      validSelectionBlock("q1"),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document).toHaveLength(5);
      expect(countPracticeBlocks(result.document)).toBe(1);
    }
  });

  it("an existing CNT-003 fixture still parses unchanged", () => {
    const result = parseLessonDocument([validProseBlock("p1"), validSelectionBlock("q1"), validProseBlock("p2")]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document).toHaveLength(3);
  });
});

describe("parseLessonDocument — convertedFrom (CNT-005, 0022 Decision 6)", () => {
  it("carries convertedFrom through on a practice block that sets it", () => {
    const result = parseLessonDocument([
      { ...validSelectionBlock("q1"), convertedFrom: "Circle the wrong one and write the correction." },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document[0]).toMatchObject({
        id: "q1",
        kind: "practice",
        convertedFrom: "Circle the wrong one and write the correction.",
      });
    }
  });

  it("is absent (no key at all) on a practice block that does not set it", () => {
    const result = parseLessonDocument([validSelectionBlock("q1")]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document[0]).not.toHaveProperty("convertedFrom");
    }
  });

  it("rejects an empty-string convertedFrom, naming the block and field", () => {
    const result = parseLessonDocument([{ ...validSelectionBlock("q1"), convertedFrom: "" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.field === "q1: convertedFrom")).toBe(true);
    }
  });

  it("rejects a non-string convertedFrom, naming the block and field", () => {
    const result = parseLessonDocument([{ ...validSelectionBlock("q1"), convertedFrom: 42 }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.field === "q1: convertedFrom")).toBe(true);
    }
  });

  it(
    "models import-lesson.ts: the field survives a JSON round trip, standing in for the " +
      "JSONB write it lands in (import-lesson.ts stores parseLessonDocument's returned " +
      "document unchanged as lesson_versions.document — see validateDocuments() and the " +
      "insert call that writes `document: documents.get(lesson.slug)`)",
    () => {
      const result = parseLessonDocument([
        { ...validSelectionBlock("q1"), convertedFrom: "Underline the errors." },
        validProseBlock("p1"),
      ]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const roundTripped = JSON.parse(JSON.stringify(result.document));
      expect(roundTripped[0].convertedFrom).toBe("Underline the errors.");
      expect(roundTripped[1]).not.toHaveProperty("convertedFrom");
    },
  );

  it("theory blocks reject an unrecognized convertedFrom key (strict schema, unchanged by this card)", () => {
    const result = parseLessonDocument([{ ...validProseBlock("p1"), convertedFrom: "n/a" }]);
    expect(result.ok).toBe(false);
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
