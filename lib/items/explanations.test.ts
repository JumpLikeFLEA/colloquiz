import { describe, expect, it } from "vitest";
import { checkExplanationCoverage, resolveExplanations } from "./explanations";
import { matchingModule } from "./matching";
import { orderingModule } from "./ordering";
import { selectionModule } from "./selection";
import { selectionGridModule } from "./selectionGrid";
import { slotsModule } from "./slots";
import type { SelectionGridItem } from "./types";

/**
 * ITEM-009. Coverage (parse-time rejection / acceptance) is exercised per
 * type below, through each type's own `parse` — the same "fixtures are built
 * THROUGH parse" convention every other lib/items/*.test.ts follows.
 * `resolveExplanations` itself is type-agnostic, so its own tests build one
 * representative item (selection_grid, since it has multiple sub-parts).
 * Explanations are optional (docs/decisions/0230, revising 0017 Decision 3):
 * a ref with no entry and no fallback parses and resolves to nothing.
 */

function parsedGrid(payload: unknown, id = "grid-1"): SelectionGridItem {
  const result = selectionGridModule.parse({ id, type: "selection_grid", payload });
  if (!result.ok) throw new Error(`fixture did not parse: ${JSON.stringify(result.errors)}`);
  return result.item;
}

describe("checkExplanationCoverage", () => {
  it("reports an explanations key no ref uses as unused", () => {
    const { unusedKeys } = checkExplanationCoverage(["a"], { a: "explains a", stale: "orphaned" });
    expect(unusedKeys).toEqual(["stale"]);
  });

  it("reports nothing when a used ref has no entry: explanations are optional (0230)", () => {
    const { unusedKeys } = checkExplanationCoverage(["a", "b"], { a: "explains a" });
    expect(unusedKeys).toEqual([]);
  });
});

describe("every type accepts at parse a used explanationRef with no explanation (0230)", () => {
  it("selection", () => {
    const result = selectionModule.parse({
      id: "i",
      type: "selection",
      payload: {
        prompt: "Pick one.",
        multi: false,
        options: [
          { id: "a", text: "A" },
          { id: "b", text: "B" },
        ],
        correctOptionIds: ["a"],
        explanationRef: "exp",
        explanations: {},
      },
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
  });

  it("selection_grid", () => {
    const result = selectionGridModule.parse({
      id: "i",
      type: "selection_grid",
      payload: {
        prompt: "True or false?",
        rows: [{ id: "r1", statement: "s", correct: true, explanationRef: "exp-r1" }],
        explanations: {},
      },
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
  });

  it("ordering", () => {
    const result = orderingModule.parse({
      id: "i",
      type: "ordering",
      payload: {
        prompt: "Order these.",
        elements: [
          { id: "a", text: "A", explanationRef: "exp-a" },
          { id: "b", text: "B", explanationRef: "exp-b" },
        ],
        explanations: {},
      },
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
  });

  it("matching", () => {
    const result = matchingModule.parse({
      id: "i",
      type: "matching",
      payload: {
        prompt: "Match these.",
        left: [{ id: "l1", content: { kind: "text", text: "l1" } }],
        right: [{ id: "r1", content: { kind: "text", text: "r1" } }],
        pairs: [{ id: "p1", left: "l1", right: "r1", explanationRef: "exp-p1" }],
        explanations: {},
      },
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
  });

  it("slots", () => {
    const result = slotsModule.parse({
      id: "i",
      type: "slots",
      payload: {
        prompt: "Fill in.",
        input: "typed",
        gaps: [{ id: "g1", acceptedAnswers: ["cat"], explanationRef: "exp-g1" }],
        explanations: {},
      },
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
  });
});

describe("an item-level fallbackExplanation covers every row without individual entries", () => {
  it("a ten-row grid needs no per-row explanations when fallbackExplanation is set", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: `r${i + 1}`,
      statement: `statement ${i + 1}`,
      correct: i % 2 === 0,
      explanationRef: `exp-r${i + 1}`,
    }));
    const item = parsedGrid({
      prompt: "True or false?",
      rows,
      explanations: {},
      fallbackExplanation: "See the grammar note above.",
    });
    expect(item.payload.rows).toHaveLength(10);
  });
});

describe("resolveExplanations", () => {
  const tenRowGrid = () =>
    parsedGrid({
      prompt: "True or false?",
      rows: [
        { id: "r1", statement: "s1", correct: true, explanationRef: "exp-r1" },
        { id: "r2", statement: "s2", correct: false, explanationRef: "exp-r2" },
        { id: "r3", statement: "s3", correct: false, explanationRef: "exp-fallback-only" },
      ],
      explanations: { "exp-r1": "Explains r1.", "exp-r2": "Explains r2." },
      fallbackExplanation: "General fallback explanation.",
    });

  it("resolves every wrong subResult, in presentation order", () => {
    const item = tenRowGrid();
    const result = selectionGridModule.score(item, [
      { rowId: "r1", answer: true },
      { rowId: "r2", answer: !item.payload.rows[1].correct }, // wrong on purpose
      { rowId: "r3", answer: !item.payload.rows[2].correct }, // wrong on purpose
    ]);
    const resolved = resolveExplanations(item, result);
    expect(resolved.map((r) => r.subResultId)).toEqual(["r2", "r3"]);
  });

  it("a correct response resolves to none", () => {
    const item = tenRowGrid();
    const result = selectionGridModule.score(item, [
      { rowId: "r1", answer: item.payload.rows[0].correct },
    ]);
    // r2 and r3 are unanswered -> scored wrong (grid convention), r1 correct.
    const resolved = resolveExplanations(item, result);
    expect(resolved.find((r) => r.subResultId === "r1")).toBeUndefined();
  });

  it("uses the specific explanation when one exists for the ref", () => {
    const item = tenRowGrid();
    const result = selectionGridModule.score(item, []);
    const resolved = resolveExplanations(item, result);
    expect(resolved.find((r) => r.subResultId === "r2")?.explanation).toBe("Explains r2.");
  });

  it("falls back to fallbackExplanation when no specific entry covers the ref", () => {
    const item = tenRowGrid();
    const result = selectionGridModule.score(item, []);
    const resolved = resolveExplanations(item, result);
    expect(resolved.find((r) => r.subResultId === "r3")?.explanation).toBe("General fallback explanation.");
  });

  it("leaves out a wrong subResult with no explanation anywhere, and keeps the ones that have one (0230)", () => {
    const item = parsedGrid({
      prompt: "True or false?",
      rows: [
        { id: "r1", statement: "s1", correct: true, explanationRef: "exp-r1" },
        { id: "r2", statement: "s2", correct: true, explanationRef: "exp-r2" },
      ],
      explanations: { "exp-r2": "Explains r2." },
    });
    const result = selectionGridModule.score(item, [
      { rowId: "r1", answer: false },
      { rowId: "r2", answer: false },
    ]);
    expect(result.subResults.filter((r) => !r.correct).map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(resolveExplanations(item, result)).toEqual([{ subResultId: "r2", explanation: "Explains r2." }]);
  });
});
