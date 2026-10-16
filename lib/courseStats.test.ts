import { describe, expect, it } from "vitest";
import { formatAverage, groupCourseStats } from "./courseStats";

function row(over: Record<string, unknown>): Record<string, unknown> {
  return {
    lesson_id: "l1",
    lesson_title: "Lesson 1",
    lesson_ordinal: 1,
    week: null,
    opened_learners: 7,
    completed_learners: 5,
    block_id: "b1",
    block_position: 2,
    block_type: "selection",
    block_prompt: "Pick one.",
    block_learners: 5,
    block_avg: "0.6",
    ...over,
  };
}

describe("groupCourseStats", () => {
  it("returns nothing for no rows", () => {
    expect(groupCourseStats([])).toEqual([]);
  });

  it("groups blocks under their lesson and numbers them in row order", () => {
    const out = groupCourseStats([
      row({ block_id: "b1", block_position: 2 }),
      row({ block_id: "b2", block_position: 5, block_type: "slots", block_avg: 0.25 }),
      row({ lesson_id: "l2", lesson_title: "Lesson 2", lesson_ordinal: 2, opened_learners: 3, completed_learners: 1, week: 2, block_id: "c1" }),
    ]);
    expect(out.map((l) => [l.lessonId, l.opened, l.completed, l.week])).toEqual([
      ["l1", 7, 5, null],
      ["l2", 3, 1, 2],
    ]);
    expect(out[0].exercises.map((e) => [e.blockId, e.number, e.type, e.average])).toEqual([
      ["b1", 1, "selection", 0.6],
      ["b2", 2, "slots", 0.25],
    ]);
  });

  it("keeps a NULL average as null, not 0", () => {
    const [l] = groupCourseStats([row({ block_learners: 4, block_avg: null })]);
    expect(l.exercises[0]).toMatchObject({ learners: 4, average: null });
  });

  it("gives a lesson with no practice block an empty exercise list", () => {
    const [l] = groupCourseStats([
      row({ block_id: null, block_type: null, block_prompt: null, block_learners: null, block_avg: null }),
    ]);
    expect(l.exercises).toEqual([]);
    expect(l.opened).toBe(7);
  });

  it("reads a prompt as a string or as inline content", () => {
    const out = groupCourseStats([
      row({ block_prompt: "Plain" }),
      row({ block_id: "b2", block_prompt: [{ text: "Rich text", marks: ["emphasis"] }] }),
      row({ block_id: "b3", block_prompt: { nope: 1 } }),
    ]);
    expect(out[0].exercises.map((e) => e.promptText)).toEqual(["Plain", "Rich text", ""]);
  });
});

describe("formatAverage", () => {
  it("rounds to a whole percent", () => {
    expect(formatAverage(0.6)).toBe("60%");
    expect(formatAverage(2 / 3)).toBe("67%");
    expect(formatAverage(0)).toBe("0%");
    expect(formatAverage(1)).toBe("100%");
  });
});
