import { describe, expect, it } from "vitest";
import { buildResultsGrid, toResultRow, type ResultRow } from "./results";

const block = (id: string, prompt: string) => ({
  id,
  kind: "practice",
  type: "selection",
  payload: {
    prompt,
    explanations: {},
    fallbackExplanation: "why",
    multi: false,
    options: [
      { id: "a", text: "Alpha" },
      { id: "b", text: "Beta" },
    ],
    correctOptionIds: ["a"],
    explanationRef: "x",
  },
});

const row = (over: Partial<ResultRow>): ResultRow => ({
  studentId: "s1",
  lessonId: "l1",
  lessonTitle: "One",
  lessonOrdinal: 1,
  blockId: "e1",
  blockPos: 2,
  block: block("e1", "First?"),
  earned: null,
  possible: null,
  response: null,
  attemptedAt: null,
  ...over,
});

describe("buildResultsGrid", () => {
  it("is empty for no rows", () => {
    const g = buildResultsGrid([]);
    expect(g.lessons).toEqual([]);
    expect(g.studentIds).toEqual([]);
  });

  it("orders lessons by ordinal and exercises by document position, numbering from 1", () => {
    const g = buildResultsGrid([
      row({ lessonId: "l2", lessonTitle: "Two", lessonOrdinal: 2, blockId: "x", blockPos: 1, block: block("x", "X?") }),
      row({ blockId: "e2", blockPos: 5, block: block("e2", "Second?") }),
      row({ blockId: "e1", blockPos: 2 }),
    ]);
    expect(g.lessons.map((l) => l.title)).toEqual(["One", "Two"]);
    expect(g.lessons[0].exercises.map((e) => [e.blockId, e.number, e.prompt])).toEqual([
      ["e1", 1, "First?"],
      ["e2", 2, "Second?"],
    ]);
  });

  it("makes one column per exercise however many students there are", () => {
    const g = buildResultsGrid([row({ studentId: "s1" }), row({ studentId: "s2" })]);
    expect(g.lessons[0].exercises).toHaveLength(1);
    expect(g.studentIds).toEqual(["s1", "s2"]);
  });

  it("shows earned/possible and the answer for an attempted cell, nothing for a missing one", () => {
    const g = buildResultsGrid([
      row({ studentId: "s1", earned: 1, possible: 2, response: { selectedOptionIds: ["b"] }, attemptedAt: "2026-11-02T10:00:00Z" }),
      row({ studentId: "s2" }),
    ]);
    const done = g.cells.get("s1")!.get("l1:e1")!;
    expect(done.score).toBe("1/2");
    expect(done.answer).toEqual({ status: "ok", prompt: "First?", lines: ["Beta"] });
    const none = g.cells.get("s2")!.get("l1:e1")!;
    expect(none.score).toBeNull();
    expect(none.answer).toBeNull();
  });

  it("keeps an attempt with no stored response distinct from no attempt", () => {
    const g = buildResultsGrid([row({ earned: 1, possible: 1, response: null })]);
    const cell = g.cells.get("s1")!.get("l1:e1")!;
    expect(cell.score).toBe("1/1");
    expect(cell.answer).toEqual({ status: "no_response" });
  });
});

describe("toResultRow", () => {
  it("maps numerics that arrive as strings and keeps nulls", () => {
    const r = toResultRow({
      student_id: "s",
      lesson_id: "l",
      lesson_title: "T",
      lesson_ordinal: "2",
      block_id: "b",
      block_pos: 3,
      block: null,
      earned: "1.5",
      possible: "2",
      response: null,
      attempted_at: null,
    });
    expect(r.lessonOrdinal).toBe(2);
    expect(r.earned).toBe(1.5);
    expect(r.response).toBeNull();
    const none = toResultRow({ student_id: "s", lesson_id: "l", lesson_title: "T", lesson_ordinal: 1, block_id: "b", block_pos: 1 });
    expect(none.earned).toBeNull();
    expect(none.possible).toBeNull();
  });
});
