import { describe, expect, it } from "vitest";
import type { LessonBlock } from "../lessons";
import { dropTitleHeading } from "./titleHeading";

const heading = (id: string, text: string, level: 1 | 2 = 1): LessonBlock => ({
  id,
  kind: "theory",
  type: "heading",
  level,
  text: [{ text }],
});
const prose: LessonBlock = { id: "p", kind: "theory", type: "prose", text: [{ text: "hi" }] } as LessonBlock;

describe("dropTitleHeading", () => {
  it("drops a first level-1 heading equal to the title, trimmed and case-insensitive", () => {
    const doc = [heading("h", "  true or FALSE? "), prose];
    expect(dropTitleHeading(doc, "True or false?")).toEqual([prose]);
  });

  it("keeps a first heading that differs", () => {
    const doc = [heading("h", "Part one"), prose];
    expect(dropTitleHeading(doc, "True or false?")).toBe(doc);
  });

  it("keeps a level-2 heading with the same text", () => {
    const doc = [heading("h", "True or false?", 2), prose];
    expect(dropTitleHeading(doc, "True or false?")).toBe(doc);
  });

  it("only looks at the first block", () => {
    const doc = [prose, heading("h", "True or false?")];
    expect(dropTitleHeading(doc, "True or false?")).toBe(doc);
  });

  it("does nothing without a title or on an empty document", () => {
    const doc = [heading("h", "")];
    expect(dropTitleHeading(doc, undefined)).toBe(doc);
    expect(dropTitleHeading(doc, "  ")).toBe(doc);
    expect(dropTitleHeading([], "x")).toEqual([]);
  });
});
