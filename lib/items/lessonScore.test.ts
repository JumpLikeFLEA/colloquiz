import { describe, expect, it } from "vitest";
import { aggregateLessonScore, type LessonItemInput } from "./lessonScore";
import { orderingModule } from "./ordering";
import { selectionModule } from "./selection";
import type { ItemScoreResult, OrderingItem, SelectionItem } from "./types";

/**
 * ITEM-008. Every expected total/percent below is computed BY HAND in the
 * test source, as a literal — never by calling `aggregateLessonScore` (the
 * function under test) to produce its own expectation.
 */

function parsedSelection(payload: unknown, id: string): SelectionItem {
  const result = selectionModule.parse({ id, type: "selection", payload });
  if (!result.ok) throw new Error(`fixture did not parse: ${JSON.stringify(result.errors)}`);
  return result.item;
}

function parsedOrdering(payload: unknown, id: string): OrderingItem {
  const result = orderingModule.parse({ id, type: "ordering", payload });
  if (!result.ok) throw new Error(`fixture did not parse: ${JSON.stringify(result.errors)}`);
  return result.item;
}

/** Single-answer MCQ, correct option "a". possible: 1. */
const mcq = (id: string) =>
  parsedSelection(
    {
      prompt: "Pick one.",
      multi: false,
      options: [
        { id: "a", text: "right" },
        { id: "b", text: "wrong" },
      ],
      correctOptionIds: ["a"],
      explanationRef: "exp-mcq",
    },
    id,
  );

/** 5-element ordering, correct order a,b,c,d,e. possible: 5 (1 per position). */
const fiveWordOrder = (id: string) =>
  parsedOrdering(
    {
      prompt: "Put the words in order.",
      elements: [
        { id: "a", text: "word a" },
        { id: "b", text: "word b" },
        { id: "c", text: "word c" },
        { id: "d", text: "word d" },
        { id: "e", text: "word e" },
      ],
      explanationRef: "exp-order",
    },
    id,
  );

/** A synthetic ItemScoreResult, for cases that only need to exercise the
 * aggregator's arithmetic and don't need a real item behind them. */
function fakeResult(earned: number, possible: number): ItemScoreResult {
  return { earned, possible, subResults: [] };
}

describe("aggregateLessonScore", () => {
  it("mixed lesson: sums earned/possible across item types and rounds the percent (hand-computed)", () => {
    // item A (selection, possible 1): correct -> earned 1
    const a = selectionModule.score(mcq("a"), { selectedOptionIds: ["a"] });
    // item B (ordering, possible 5): a,c,b,d,e vs a,b,c,d,e -> positions 0,3,4 correct -> earned 3
    const b = orderingModule.score(fiveWordOrder("b"), { order: ["a", "c", "b", "d", "e"] });
    // item C (selection, possible 1): unattempted -> earned 0
    const c = selectionModule.score(mcq("c"), { selectedOptionIds: [] });

    expect(a.earned).toBe(1);
    expect(a.possible).toBe(1);
    expect(b.earned).toBe(3);
    expect(b.possible).toBe(5);
    expect(c.earned).toBe(0);
    expect(c.possible).toBe(1);

    const inputs: LessonItemInput[] = [
      { itemId: "a", result: a },
      { itemId: "b", result: b },
      { itemId: "c", result: c },
    ];

    // Σearned = 1 + 3 + 0 = 4, Σpossible = 1 + 5 + 1 = 7, 4/7 = 57.142857...% -> 57
    const lesson = aggregateLessonScore(inputs);
    expect(lesson.status).toBe("scored");
    expect(lesson.earned).toBe(4);
    expect(lesson.possible).toBe(7);
    expect(lesson.percent).toBe(57);
    expect(lesson.items).toEqual([
      { itemId: "a", earned: 1, possible: 1, subResults: a.subResults },
      { itemId: "b", earned: 3, possible: 5, subResults: b.subResults },
      { itemId: "c", earned: 0, possible: 1, subResults: c.subResults },
    ]);
  });

  it("all-correct lesson scores 100%", () => {
    const a = selectionModule.score(mcq("a"), { selectedOptionIds: ["a"] });
    const b = orderingModule.score(fiveWordOrder("b"), { order: ["a", "b", "c", "d", "e"] });

    // Σearned = 1 + 5 = 6, Σpossible = 1 + 5 = 6, 6/6 = 100%
    const lesson = aggregateLessonScore([
      { itemId: "a", result: a },
      { itemId: "b", result: b },
    ]);
    expect(lesson.status).toBe("scored");
    expect(lesson.earned).toBe(6);
    expect(lesson.possible).toBe(6);
    expect(lesson.percent).toBe(100);
  });

  it("all-wrong lesson scores 0%", () => {
    const a = selectionModule.score(mcq("a"), { selectedOptionIds: ["b"] });
    const b = orderingModule.score(fiveWordOrder("b"), { order: ["b", "c", "d", "e", "a"] });

    // Σearned = 0 + 0 = 0, Σpossible = 1 + 5 = 6, 0/6 = 0%
    const lesson = aggregateLessonScore([
      { itemId: "a", result: a },
      { itemId: "b", result: b },
    ]);
    expect(lesson.status).toBe("scored");
    expect(lesson.earned).toBe(0);
    expect(lesson.possible).toBe(6);
    expect(lesson.percent).toBe(0);
  });

  it("a lesson with one unattempted item still scores (that item contributes 0 earned, its full possible)", () => {
    const a = selectionModule.score(mcq("a"), { selectedOptionIds: ["a"] });
    const unattempted = selectionModule.score(mcq("b"), { selectedOptionIds: [] });

    // Σearned = 1 + 0 = 1, Σpossible = 1 + 1 = 2, 1/2 = 50%
    const lesson = aggregateLessonScore([
      { itemId: "a", result: a },
      { itemId: "b", result: unattempted },
    ]);
    expect(lesson.status).toBe("scored");
    expect(lesson.earned).toBe(1);
    expect(lesson.possible).toBe(2);
    expect(lesson.percent).toBe(50);
  });

  it("a lesson with zero items is explicitly unscored, not a 0/0 division", () => {
    const lesson = aggregateLessonScore([]);
    expect(lesson.status).toBe("unscored");
    expect(lesson.earned).toBe(0);
    expect(lesson.possible).toBe(0);
    expect(lesson.percent).toBeNull();
    expect(lesson.items).toEqual([]);
  });

  it("a lesson where every item scored possible: 0 is unscored, not NaN or Infinity", () => {
    const lesson = aggregateLessonScore([
      { itemId: "a", result: fakeResult(0, 0) },
      { itemId: "b", result: fakeResult(0, 0) },
    ]);
    expect(lesson.status).toBe("unscored");
    expect(lesson.earned).toBe(0);
    expect(lesson.possible).toBe(0);
    expect(lesson.percent).toBeNull();
  });

  it("rounds a half-percent up: 159/200 = 79.5% displays as 80", () => {
    const lesson = aggregateLessonScore([{ itemId: "a", result: fakeResult(159, 200) }]);
    expect(lesson.status).toBe("scored");
    expect(lesson.percent).toBe(80);
  });

  it("preserves item order and subResults verbatim for the explanations UI", () => {
    const b = orderingModule.score(fiveWordOrder("b"), { order: ["a", "c", "b", "d", "e"] });
    expect(b.subResults).toHaveLength(5);

    const lesson = aggregateLessonScore([{ itemId: "b", result: b }]);
    expect(lesson.items[0].subResults).toBe(b.subResults);
  });
});
