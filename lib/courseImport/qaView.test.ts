import { describe, expect, it } from "vitest";
import { lessonFile, PLAN, selectionBlock } from "./__fixtures__/lesson";
import type { DraftedLesson } from "./lessonResponse";
import { buildQa } from "./qa";
import { importListState, qaHasFindings, readStoredQa } from "./qaView";
import { LessonFileSchema } from "../lessons/courseFile";

const drafted = (slug: string, over: Record<string, unknown> = {}, extra: Partial<DraftedLesson> = {}): DraftedLesson => ({
  lesson: LessonFileSchema.parse(lessonFile(slug, over)),
  qa: [],
  repaired: false,
  ...extra,
});

describe("readStoredQa", () => {
  it("reads back what buildQa wrote, through JSON", () => {
    const converted = selectionBlock("q2", { convertedFrom: "Circle the correct sentence" });
    const built = buildQa({
      plan: PLAN,
      lessons: [drafted("a", { document: [selectionBlock("q1"), converted] }, { qa: ["Answer key unclear in Ex. 3"], repaired: true })],
      conversion: { imagesDropped: 2, warnings: ["unsupported style"] },
    });
    const read = readStoredQa(JSON.parse(JSON.stringify(built)));
    expect(read).toEqual(built);
    // Positive control: the fixture really carries something to read back.
    expect(read?.lessons[0].conversions).toEqual([{ blockId: "q2", from: "Circle the correct sentence" }]);
    expect(read?.lessons[0].notes).toEqual(["Answer key unclear in Ex. 3"]);
    expect(read?.flags.length).toBeGreaterThan(0);
  });

  it("returns null for anything that is not a report", () => {
    expect(readStoredQa(null)).toBeNull();
    expect(readStoredQa("x")).toBeNull();
    expect(readStoredQa({})).toBeNull();
    expect(readStoredQa({ lessons: "no" })).toBeNull();
  });

  it("drops malformed entries instead of throwing", () => {
    const read = readStoredQa({
      markMapping: "  ",
      planNotes: ["ok", 3],
      flags: null,
      lessons: [
        { slug: "a", title: "A", notes: ["n", 1], conversions: [{ blockId: "b", from: "x" }, { blockId: 1 }], exercises: "many" },
        { title: "no slug" },
        7,
      ],
    });
    expect(read).toEqual({
      markMapping: null,
      planNotes: ["ok"],
      flags: [],
      lessons: [{ slug: "a", title: "A", exercises: 0, estimatedMinutes: null, notes: ["n"], conversions: [{ blockId: "b", from: "x" }], flags: [] }],
    });
  });
});

describe("qaHasFindings", () => {
  it("is false for a report of bare lessons and true when any note, flag or conversion exists", () => {
    const base = { markMapping: null, planNotes: [], flags: [], lessons: [{ slug: "a", title: "A", exercises: 1, estimatedMinutes: 10, notes: [], conversions: [], flags: [] }] };
    expect(qaHasFindings(base)).toBe(false);
    expect(qaHasFindings({ ...base, flags: ["x"] })).toBe(true);
    expect(qaHasFindings({ ...base, lessons: [{ ...base.lessons[0], notes: ["n"] }] })).toBe(true);
    expect(qaHasFindings({ ...base, lessons: [{ ...base.lessons[0], conversions: [{ blockId: "b", from: "f" }] }] })).toBe(true);
  });
});

describe("importListState", () => {
  it("maps every status to one of three pills", () => {
    expect(importListState("done")).toEqual({ label: "Done", tone: "done" });
    expect(importListState("failed")).toEqual({ label: "Failed", tone: "failed" });
    for (const s of ["pending", "planning", "drafting", "committing"]) expect(importListState(s).tone).toBe("running");
  });
});
