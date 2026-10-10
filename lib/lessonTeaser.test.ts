import { describe, expect, it } from "vitest";
import { parseLessonTeaser } from "./lessonTeaser";

const prose = (id: string, text: string) => ({ id, kind: "theory", type: "prose", text: [{ text }] });
const heading = (id: string, text: string) => ({ id, kind: "theory", type: "heading", level: 2, text: [{ text }] });

describe("parseLessonTeaser", () => {
  it("returns the blocks in block_index order, whatever order the rows arrive in", () => {
    const blocks = parseLessonTeaser([
      { block_index: 3, block: prose("p2", "second") },
      { block_index: 1, block: heading("h1", "Title") },
      { block_index: 2, block: prose("p1", "first") },
    ]);
    expect(blocks.map((b) => b.id)).toEqual(["h1", "p1", "p2"]);
  });

  it("is empty for no rows (a lesson that opens with an exercise, or has none)", () => {
    expect(parseLessonTeaser([])).toEqual([]);
  });

  it("throws on a block the theory schema rejects, instead of handing it to a renderer", () => {
    expect(() => parseLessonTeaser([{ block_index: 1, block: { id: "x", kind: "practice", type: "selection" } }])).toThrow(
      /block 1 is not a valid theory block/,
    );
  });

  it("throws on a self_check block even if SQL ever returned one (its modelAnswer is the answer key)", () => {
    const selfCheck = { id: "s1", kind: "theory", type: "self_check", prompt: [{ text: "Say it" }], response: "none", modelAnswer: [{ text: "secret" }] };
    expect(() => parseLessonTeaser([{ block_index: 1, block: selfCheck }])).toThrow(/is a self_check block/);
  });
});
