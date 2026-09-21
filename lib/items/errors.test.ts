import { describe, expect, it } from "vitest";
import { ItemResponseError } from "./errors";
import { orderingModule } from "./ordering";
import { selectionModule } from "./selection";
import { selectionGridModule } from "./selectionGrid";
import type { Item } from "./types";

/**
 * ITEM-012 acceptance: "a test proves one `instanceof ItemResponseError`
 * check distinguishes every existing response error from a legitimate zero
 * score" — across all three modules that throw it, not per-module.
 */

function parsed<T extends Item>(module: { parse(input: unknown): { ok: boolean; item?: T } }, input: unknown): T {
  const result = module.parse(input) as { ok: boolean; item?: T };
  if (!result.ok || !result.item) throw new Error("fixture did not parse");
  return result.item;
}

const selectionItem = () =>
  parsed(selectionModule, {
    id: "sel-1",
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
      fallbackExplanation: "explanation",
    },
  });

const selectionGridItem = () =>
  parsed(selectionGridModule, {
    id: "grid-1",
    type: "selection_grid",
    payload: {
      prompt: "True or false?",
      rows: [{ id: "r1", statement: "s", correct: true, explanationRef: "exp" }],
      explanations: {},
      fallbackExplanation: "explanation",
    },
  });

const orderingItem = () =>
  parsed(orderingModule, {
    id: "ord-1",
    type: "ordering",
    payload: {
      prompt: "Order these.",
      elements: [
        { id: "a", text: "A", explanationRef: "exp-a" },
        { id: "b", text: "B", explanationRef: "exp-b" },
      ],
      explanations: {},
      fallbackExplanation: "explanation",
    },
  });

describe("ItemResponseError — one instanceof check across every module that throws it", () => {
  it("catches a malformed response from selection, selection_grid and ordering alike", () => {
    const attempts: Array<() => unknown> = [
      () => selectionModule.score(selectionItem(), 42),
      () => selectionGridModule.score(selectionGridItem(), 42),
      () => orderingModule.score(orderingItem(), 42),
    ];

    for (const attempt of attempts) {
      let caught: unknown;
      try {
        attempt();
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ItemResponseError);
    }
  });

  it("never mistakes a legitimate zero score for a response error, across all three modules", () => {
    // Correct id, wrong answer: a real, scoreable zero — not a thrown error.
    const zeroScores: Array<() => { earned: number }> = [
      () => selectionModule.score(selectionItem(), { selectedOptionIds: ["b"] }),
      () => selectionGridModule.score(selectionGridItem(), [{ rowId: "r1", answer: false }]),
      () => orderingModule.score(orderingItem(), { order: ["b", "a"] }),
    ];

    for (const scoreZero of zeroScores) {
      let caught: unknown;
      let result: { earned: number } | undefined;
      try {
        result = scoreZero();
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeUndefined();
      expect(result?.earned).toBe(0);
    }
  });

  it("carries the throwing module's own itemType on the shared class", () => {
    const errors: ItemResponseError[] = [];
    for (const attempt of [
      () => selectionModule.score(selectionItem(), 42),
      () => selectionGridModule.score(selectionGridItem(), 42),
      () => orderingModule.score(orderingItem(), 42),
    ]) {
      try {
        attempt();
      } catch (error) {
        if (error instanceof ItemResponseError) errors.push(error);
      }
    }
    expect(errors.map((e) => e.itemType)).toEqual(["selection", "selection_grid", "ordering"]);
  });
});
