import { describe, expect, it } from "vitest";
import type { LessonBlock } from "../lessons";
import {
  INTRO_GROUP_ID,
  addChapter,
  chapterBlockCount,
  deleteChapter,
  groupChapters,
  insertIntoChapter,
  moveBlock,
  moveChapter,
} from "./chapters";

// AUTH-017 acceptance: "order round-trips, edge moves are no-ops, the intro
// group never moves, delete removes exactly the chapter's blocks, level-2
// headings stay inside their chapter."

function h1(id: string): LessonBlock {
  return { id, kind: "theory", type: "heading", level: 1, text: [{ text: id }] };
}
function h2(id: string): LessonBlock {
  return { id, kind: "theory", type: "heading", level: 2, text: [{ text: id }] };
}
function p(id: string): LessonBlock {
  return { id, kind: "theory", type: "prose", text: [{ text: id }] };
}
const ids = (blocks: readonly LessonBlock[]) => blocks.map((b) => b.id);

// intro: i1 i2 · chapter A: a1 a-sub a2 · chapter B: b1 · chapter C: (empty)
const lesson: LessonBlock[] = [p("i1"), p("i2"), h1("A"), p("a1"), h2("a-sub"), p("a2"), h1("B"), p("b1"), h1("C")];

describe("groupChapters", () => {
  it("splits on level-1 headings only, intro first", () => {
    const groups = groupChapters(lesson);
    expect(groups.map((g) => [g.id, ids(g.blocks)])).toEqual([
      [INTRO_GROUP_ID, ["i1", "i2"]],
      ["A", ["a1", "a-sub", "a2"]],
      ["B", ["b1"]],
      ["C", []],
    ]);
    expect(groups.map((g) => [g.start, g.end])).toEqual([
      [0, 2],
      [2, 6],
      [6, 8],
      [8, 9],
    ]);
  });

  it("round-trips: concatenating every group reproduces the flat order", () => {
    for (const doc of [lesson, [], [h1("X")], [p("a"), p("b")], [h1("X"), h1("Y"), p("y")]]) {
      const flat = groupChapters(doc).flatMap((g) => (g.heading ? [g.heading, ...g.blocks] : g.blocks));
      expect(ids(flat)).toEqual(ids(doc));
    }
  });

  it("an empty lesson and a lesson opening on a chapter both have an empty intro", () => {
    expect(groupChapters([])).toEqual([{ id: INTRO_GROUP_ID, heading: null, start: 0, end: 0, blocks: [] }]);
    expect(groupChapters([h1("A"), p("a")])[0].blocks).toEqual([]);
  });
});

describe("moveChapter", () => {
  it("swaps a chapter with its neighbour, carrying its level-2 heading", () => {
    expect(ids(moveChapter(lesson, "B", -1))).toEqual(["i1", "i2", "B", "b1", "A", "a1", "a-sub", "a2", "C"]);
    expect(ids(moveChapter(lesson, "A", 1))).toEqual(["i1", "i2", "B", "b1", "A", "a1", "a-sub", "a2", "C"]);
    expect(ids(moveChapter(lesson, "B", 1))).toEqual(["i1", "i2", "A", "a1", "a-sub", "a2", "C", "B", "b1"]);
  });

  it("round-trips: up then down restores the order", () => {
    expect(moveChapter(moveChapter(lesson, "B", -1), "B", 1)).toEqual(lesson);
  });

  it("edge moves are no-ops: the first chapter never goes above the intro, the last never further down", () => {
    expect(moveChapter(lesson, "A", -1)).toEqual(lesson);
    expect(moveChapter(lesson, "C", 1)).toEqual(lesson);
  });

  it("the intro group never moves", () => {
    expect(moveChapter(lesson, INTRO_GROUP_ID, 1)).toEqual(lesson);
    expect(moveChapter(lesson, INTRO_GROUP_ID, -1)).toEqual(lesson);
  });

  it("an unknown id is a no-op", () => {
    expect(moveChapter(lesson, "nope", 1)).toEqual(lesson);
    expect(moveChapter(lesson, "a1", -1)).toEqual(lesson);
  });
});

describe("deleteChapter", () => {
  it("removes exactly the heading and the blocks under it", () => {
    expect(ids(deleteChapter(lesson, "A"))).toEqual(["i1", "i2", "B", "b1", "C"]);
    expect(ids(deleteChapter(lesson, "C"))).toEqual(["i1", "i2", "A", "a1", "a-sub", "a2", "B", "b1"]);
  });

  it("never removes the intro, and an unknown id is a no-op", () => {
    expect(deleteChapter(lesson, INTRO_GROUP_ID)).toEqual(lesson);
    expect(deleteChapter(lesson, "a-sub")).toEqual(lesson);
  });

  it("the confirm's count is the blocks under the heading, level-2 headings included", () => {
    expect(chapterBlockCount(lesson, "A")).toBe(3);
    expect(chapterBlockCount(lesson, "C")).toBe(0);
    expect(chapterBlockCount(lesson, INTRO_GROUP_ID)).toBe(0);
  });
});

describe("insertIntoChapter", () => {
  it("inserts at the end of the named group", () => {
    expect(ids(insertIntoChapter(lesson, "A", p("new")))).toEqual(
      ["i1", "i2", "A", "a1", "a-sub", "a2", "new", "B", "b1", "C"],
    );
    expect(ids(insertIntoChapter(lesson, INTRO_GROUP_ID, p("new")))).toEqual(
      ["i1", "i2", "new", "A", "a1", "a-sub", "a2", "B", "b1", "C"],
    );
    expect(ids(insertIntoChapter(lesson, "C", p("new")))).toEqual([...ids(lesson), "new"]);
  });

  it("an unknown group is a no-op", () => {
    expect(insertIntoChapter(lesson, "nope", p("new"))).toEqual(lesson);
  });
});

describe("addChapter", () => {
  it("appends a level-1 heading carrying the title", () => {
    const result = addChapter(lesson, "  Past simple  ", "D");
    expect(result?.heading).toEqual({ id: "D", kind: "theory", type: "heading", level: 1, text: [{ text: "Past simple" }] });
    expect(groupChapters(result!.blocks).map((g) => g.id)).toEqual([INTRO_GROUP_ID, "A", "B", "C", "D"]);
  });

  it("refuses a blank title", () => {
    expect(addChapter(lesson, "   ")).toBeNull();
  });
});

describe("moveBlock", () => {
  it("moves within a chapter", () => {
    expect(ids(moveBlock(lesson, "a1", "a2"))).toEqual(["i1", "i2", "A", "a-sub", "a2", "a1", "B", "b1", "C"]);
  });

  it("moves across chapters", () => {
    expect(groupChapters(moveBlock(lesson, "a1", "b1"))[2].blocks.map((b) => b.id)).toEqual(["b1", "a1"]);
    expect(groupChapters(moveBlock(lesson, "b1", "i1"))[0].blocks.map((b) => b.id)).toEqual(["b1", "i1", "i2"]);
  });

  it("dropped on a chapter heading: from above it opens the chapter, from below it closes the previous group", () => {
    const down = groupChapters(moveBlock(lesson, "a2", "B"));
    expect(ids(down[2].blocks)).toEqual(["a2", "b1"]);
    const up = groupChapters(moveBlock(lesson, "b1", "B"));
    expect(ids(up[1].blocks)).toEqual(["a1", "a-sub", "a2", "b1"]);
  });

  it("a level-2 heading is an ordinary block and moves", () => {
    expect(ids(moveBlock(lesson, "a-sub", "b1"))).toEqual(["i1", "i2", "A", "a1", "a2", "B", "b1", "a-sub", "C"]);
  });

  it("a level-1 heading is never dragged on its own", () => {
    expect(moveBlock(lesson, "B", "i1")).toEqual(lesson);
  });

  it("a drop on itself or an unknown id is a no-op", () => {
    expect(moveBlock(lesson, "a1", "a1")).toEqual(lesson);
    expect(moveBlock(lesson, "a1", "nope")).toEqual(lesson);
  });
});
