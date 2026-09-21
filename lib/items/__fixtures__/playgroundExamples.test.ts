import { describe, expect, it } from "vitest";
import { resolveExplanations } from "../explanations";
import { parseItem, scoreItem } from "../index";
import type { Item } from "../types";
import { PLAYGROUND_EXAMPLES } from "./playgroundExamples";

/**
 * ITEM-010. These are the same fixtures the dev-only item playground
 * renders — this test is the non-visual half of "falsifying the contract":
 * every example parses, a fully-correct response scores full marks with no
 * resolved explanations, and a wrong response scores less than full marks
 * and resolves at least one explanation. The playground itself (a screenshot
 * per type) covers the interactive half this test cannot.
 */

const CORRECT_RESPONSES: Record<string, unknown> = {
  "playground-selection": { selectedOptionIds: ["b"] },
  "playground-selection-grid": [
    { rowId: "row-1", answer: true },
    { rowId: "row-2", answer: false },
    { rowId: "row-3", answer: true },
  ],
  "playground-ordering": { order: ["w1", "w2", "w3", "w4"] },
  "playground-matching": [
    { left: "l1", right: "r2" },
    { left: "l2", right: "r3" },
    { left: "l3", right: "r1" },
  ],
  "playground-slots": [
    { gapId: "gap-1", answer: "go" },
    { gapId: "gap-2", answer: "on" },
  ],
};

const WRONG_RESPONSES: Record<string, unknown> = {
  "playground-selection": { selectedOptionIds: ["a"] },
  "playground-selection-grid": [
    { rowId: "row-1", answer: false },
    { rowId: "row-2", answer: false },
    { rowId: "row-3", answer: true },
  ],
  "playground-ordering": { order: ["w2", "w1", "w3", "w4"] },
  "playground-matching": [
    { left: "l1", right: "r3" },
    { left: "l2", right: "r2" },
    { left: "l3", right: "r1" },
  ],
  "playground-slots": [
    { gapId: "gap-1", answer: "went" },
    { gapId: "gap-2", answer: "on" },
  ],
};

describe("PLAYGROUND_EXAMPLES", () => {
  it("has exactly one example per registered item type", () => {
    const types = PLAYGROUND_EXAMPLES.map((example) => (example.raw as { type: string }).type);
    expect(new Set(types).size).toBe(types.length);
    expect(types.sort()).toEqual(
      ["matching", "ordering", "selection", "selection_grid", "slots"].sort(),
    );
  });

  it.each(PLAYGROUND_EXAMPLES.map((example) => [example.label, example.raw] as const))(
    "%s parses",
    (_label, raw) => {
      const result = parseItem(raw);
      expect(result.ok).toBe(true);
    },
  );

  it.each(PLAYGROUND_EXAMPLES.map((example) => [example.label, example.raw] as const))(
    "%s: a fully correct response earns full marks with nothing to explain",
    (_label, raw) => {
      const parsed = parseItem(raw);
      if (!parsed.ok) throw new Error(`fixture did not parse: ${JSON.stringify(parsed.errors)}`);
      const item = parsed.item as Item;

      const result = scoreItem(item, CORRECT_RESPONSES[item.id]);
      expect(result.earned).toBe(result.possible);
      expect(resolveExplanations(item, result)).toEqual([]);
    },
  );

  it.each(PLAYGROUND_EXAMPLES.map((example) => [example.label, example.raw] as const))(
    "%s: a wrong response earns less than full marks and resolves an explanation",
    (_label, raw) => {
      const parsed = parseItem(raw);
      if (!parsed.ok) throw new Error(`fixture did not parse: ${JSON.stringify(parsed.errors)}`);
      const item = parsed.item as Item;

      const result = scoreItem(item, WRONG_RESPONSES[item.id]);
      expect(result.earned).toBeLessThan(result.possible);
      const resolved = resolveExplanations(item, result);
      expect(resolved.length).toBeGreaterThan(0);
      for (const { explanation } of resolved) {
        expect(explanation.length).toBeGreaterThan(0);
      }
    },
  );
});
