import { describe, expect, it } from "vitest";
import { lessonFile, PLAN, selectionBlock } from "./__fixtures__/lesson";
import type { DraftedLesson } from "./lessonResponse";
import { buildQa } from "./qa";
import { LessonFileSchema } from "../lessons/courseFile";

const drafted = (slug: string, over: Record<string, unknown> = {}, extra: Partial<DraftedLesson> = {}): DraftedLesson => ({
  lesson: LessonFileSchema.parse(lessonFile(slug, over)),
  qa: [],
  repaired: false,
  ...extra,
});

describe("buildQa", () => {
  it("carries the plan's mark mapping and notes, and one entry per lesson", () => {
    const qa = buildQa({ plan: PLAN, lessons: [drafted("a"), drafted("b")], conversion: null });
    expect(qa.markMapping).toBe(PLAN.markMapping);
    expect(qa.planNotes).toEqual(PLAN.notes);
    expect(qa.lessons.map((l) => l.slug)).toEqual(["a", "b"]);
    expect(qa.lessons[0]).toMatchObject({ exercises: 1, estimatedMinutes: 10, flags: [] });
  });

  it("flags every converted block, by id and original instruction", () => {
    const converted = selectionBlock("q2", { convertedFrom: "Circle the correct sentence" });
    const d = drafted("a", { document: [selectionBlock("q1"), converted] });
    const qa = buildQa({ plan: PLAN, lessons: [d], conversion: null });
    expect(qa.lessons[0].conversions).toEqual([{ blockId: "q2", from: "Circle the correct sentence" }]);
    expect(qa.lessons[0].exercises).toBe(2);
  });

  it("flags a lesson over 15 minutes, and not one at exactly 15", () => {
    const qa = buildQa({
      plan: PLAN,
      lessons: [drafted("long", { estimatedMinutes: 25 }), drafted("edge", { estimatedMinutes: 15 })],
      conversion: null,
    });
    expect(qa.lessons[0].flags.join(" ")).toMatch(/About 25 minutes/);
    expect(qa.lessons[1].flags).toEqual([]);
  });

  it("flags a theory-only lesson and a lesson that needed its repair turn", () => {
    const theory = drafted("t", { document: [{ id: "p1", kind: "theory", type: "prose", text: [{ text: "Just reading." }] }] });
    const repaired = drafted("r", {}, { repaired: true });
    const qa = buildQa({ plan: PLAN, lessons: [theory, repaired], conversion: null });
    expect(qa.lessons[0].flags).toContain("No exercises: the lesson is theory only.");
    expect(qa.lessons[1].flags.join(" ")).toMatch(/corrected once/);
  });

  it("flags a course outside 3 to 8 lessons, and none inside", () => {
    const two = buildQa({ plan: PLAN, lessons: [drafted("a"), drafted("b")], conversion: null });
    expect(two.flags.join(" ")).toMatch(/2 lessons; the usual size is 3 to 8/);
    const one = buildQa({ plan: PLAN, lessons: [drafted("a")], conversion: null });
    expect(one.flags.join(" ")).toMatch(/1 lesson;/);
    const three = buildQa({ plan: PLAN, lessons: [drafted("a"), drafted("b"), drafted("c")], conversion: null });
    expect(three.flags).toEqual([]);
    const nine = buildQa({ plan: PLAN, lessons: Array.from({ length: 9 }, (_, i) => drafted(`l-${i}`)), conversion: null });
    expect(nine.flags.join(" ")).toMatch(/9 lessons/);
  });

  it("says what a DOCX conversion left out", () => {
    const qa = buildQa({ plan: PLAN, lessons: [drafted("a"), drafted("b"), drafted("c")], conversion: { imagesDropped: 2, warnings: ["Unrecognised style"] } });
    expect(qa.flags[0]).toMatch(/2 images were left out/);
    expect(qa.flags[1]).toBe("DOCX conversion: Unrecognised style");
    const one = buildQa({ plan: PLAN, lessons: [drafted("a"), drafted("b"), drafted("c")], conversion: { imagesDropped: 1, warnings: [] } });
    expect(one.flags[0]).toMatch(/1 image was left out/);
    const none = buildQa({ plan: PLAN, lessons: [drafted("a"), drafted("b"), drafted("c")], conversion: { imagesDropped: 0, warnings: [] } });
    expect(none.flags).toEqual([]);
  });

  it("keeps the model's own notes beside the code's", () => {
    const qa = buildQa({ plan: PLAN, lessons: [drafted("a", {}, { qa: ["q1: explanation drafted, not sourced"] })], conversion: null });
    expect(qa.lessons[0].notes).toEqual(["q1: explanation drafted, not sourced"]);
  });
});
