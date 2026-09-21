import { describe, expect, it } from "vitest";
import {
  checkExplanationCoverage,
  ExplanationResolutionError,
  resolveExplanations,
} from "./explanations";
import { matchingModule } from "./matching";
import { orderingModule } from "./ordering";
import { selectionModule } from "./selection";
import { selectionGridModule } from "./selectionGrid";
import { slotsModule } from "./slots";
import type { Item, ItemScoreResult, SelectionGridItem, SubResult } from "./types";

/**
 * ITEM-009. Coverage (parse-time rejection / acceptance) is exercised per
 * type below, through each type's own `parse` — the same "fixtures are built
 * THROUGH parse" convention every other lib/items/*.test.ts follows.
 * `resolveExplanations` itself is type-agnostic, so its own tests build one
 * representative item (selection_grid, since it has multiple sub-parts) and
 * one bypass-parse case to exercise the defensive branch parse is supposed
 * to make unreachable.
 */

function parsedGrid(payload: unknown, id = "grid-1"): SelectionGridItem {
  const result = selectionGridModule.parse({ id, type: "selection_grid", payload });
  if (!result.ok) throw new Error(`fixture did not parse: ${JSON.stringify(result.errors)}`);
  return result.item;
}

describe("checkExplanationCoverage", () => {
  it("reports a used ref with no specific entry and no fallback as missing", () => {
    const { missingRefs } = checkExplanationCoverage(["a", "b"], { a: "explains a" }, undefined);
    expect(missingRefs).toEqual(["b"]);
  });

  it("reports nothing missing once a fallback is set, regardless of which refs have specific entries", () => {
    const { missingRefs } = checkExplanationCoverage(["a", "b"], {}, "fallback text");
    expect(missingRefs).toEqual([]);
  });

  it("reports an explanations key no ref uses as unused", () => {
    const { unusedKeys } = checkExplanationCoverage(["a"], { a: "explains a", stale: "orphaned" }, undefined);
    expect(unusedKeys).toEqual(["stale"]);
  });

  it("reports both empty when every ref has a specific entry and none are unused", () => {
    const { missingRefs, unusedKeys } = checkExplanationCoverage(["a", "b"], { a: "x", b: "y" }, undefined);
    expect(missingRefs).toEqual([]);
    expect(unusedKeys).toEqual([]);
  });
});

describe("every type rejects at parse when a used explanationRef has no coverage", () => {
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
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.field === "payload.explanations")).toBe(true);
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
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.field === "payload.explanations")).toBe(true);
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
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.field === "payload.explanations")).toBe(true);
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
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.field === "payload.explanations")).toBe(true);
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
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.field === "payload.explanations")).toBe(true);
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

  it("throws ExplanationResolutionError for a wrong subResult with no explanation anywhere — unreachable via parse()", () => {
    // Hand-constructed, bypassing parse() on purpose: this is the state
    // checkExplanationCoverage exists to make impossible for real content.
    const item: Item = {
      id: "bad-item",
      type: "selection_grid",
      payload: {
        prompt: "x",
        rows: [{ id: "r1", statement: "s", correct: true, explanationRef: "orphan-ref" }],
        explanations: {},
      },
    } as unknown as Item;
    const subResults: SubResult[] = [
      { id: "r1", correct: false, earned: 0, possible: 1, explanationRef: "orphan-ref" },
    ];
    const result: ItemScoreResult = { earned: 0, possible: 1, subResults };

    expect(() => resolveExplanations(item, result)).toThrow(ExplanationResolutionError);
  });
});
