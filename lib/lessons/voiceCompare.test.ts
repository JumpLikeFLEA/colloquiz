import { describe, expect, it } from "vitest";
import { parseLessonDocument, type LessonDocument } from "./parseLessonDocument";
import { voiceCompareConflictMessage, voiceCompareConflicts, type OtherPublishedLesson } from "./voiceCompare";

function voice(id: string, compare?: "before" | "after") {
  return {
    id,
    kind: "task",
    type: "voice",
    prompt: [{ text: "Describe your morning." }],
    maxSeconds: 120,
    ...(compare ? { compare } : {}),
  };
}

function prose(id: string) {
  return { id, kind: "theory", type: "prose", text: [{ text: "Hello." }] };
}

function doc(...blocks: unknown[]): LessonDocument {
  const result = parseLessonDocument(blocks);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.document;
}

const LESSON_1 = "lesson-1";
const LESSON_2 = "lesson-2";

describe("voiceCompareConflicts — across two lessons", () => {
  it("lets lesson 2 publish an 'after' while lesson 1's published version holds the 'before'", () => {
    const others: OtherPublishedLesson[] = [
      { lessonId: LESSON_1, title: "Week 1", document: [prose("p"), voice("v1", "before")] },
    ];
    expect(voiceCompareConflicts(LESSON_2, doc(voice("v2", "after")), others)).toEqual([]);
  });

  it("refuses a second 'before' in lesson 2 and names lesson 1", () => {
    const others: OtherPublishedLesson[] = [{ lessonId: LESSON_1, title: "Week 1", document: [voice("v1", "before")] }];
    const conflicts = voiceCompareConflicts(LESSON_2, doc(voice("v2", "before")), others);
    expect(conflicts).toEqual([
      { slot: "before", reason: "held_by_other_lesson", blockId: "v2", otherLessonId: LESSON_1, otherTitle: "Week 1" },
    ]);
    expect(voiceCompareConflictMessage(conflicts[0])).toContain('"Week 1"');
  });

  it("refuses both slots when lesson 1 holds both", () => {
    const others: OtherPublishedLesson[] = [
      { lessonId: LESSON_1, title: "Week 1", document: [voice("a", "before"), voice("b", "after")] },
    ];
    const conflicts = voiceCompareConflicts(LESSON_2, doc(voice("c", "before"), voice("d", "after")), others);
    expect(conflicts.map((c) => c.slot)).toEqual(["before", "after"]);
  });

  it("ignores the publishing lesson's own published version (a republish replaces it)", () => {
    const others: OtherPublishedLesson[] = [{ lessonId: LESSON_1, title: "Week 1", document: [voice("v1", "before")] }];
    expect(voiceCompareConflicts(LESSON_1, doc(voice("v1", "before")), others)).toEqual([]);
  });

  it("does not count a weekly voice task (no compare) in another lesson", () => {
    const others: OtherPublishedLesson[] = [{ lessonId: LESSON_1, title: "Week 1", document: [voice("v1")] }];
    expect(voiceCompareConflicts(LESSON_2, doc(voice("v2", "before")), others)).toEqual([]);
  });

  it("refuses two 'before' tasks inside one lesson, with no other lessons at all", () => {
    const conflicts = voiceCompareConflicts(LESSON_1, doc(voice("a", "before"), voice("b", "before")), []);
    expect(conflicts).toEqual([{ slot: "before", reason: "twice_in_lesson", blockIds: ["a", "b"] }]);
  });

  it("reads other documents raw: a malformed or older-shape published version does not throw", () => {
    const others: OtherPublishedLesson[] = [
      { lessonId: "old", title: "Old", document: [null, "junk", { kind: "theory", type: "heading" }] },
      { lessonId: "broken", title: "Broken", document: { not: "an array" } },
      { lessonId: LESSON_1, title: "Week 1", document: [voice("v1", "before")] },
    ];
    const conflicts = voiceCompareConflicts(LESSON_2, doc(voice("v2", "before")), others);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ otherLessonId: LESSON_1 });
  });
});
