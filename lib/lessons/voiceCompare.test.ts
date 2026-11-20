import { describe, expect, it } from "vitest";
import { parseLessonDocument, type LessonDocument } from "./parseLessonDocument";
import {
  beforeListenFor,
  voiceCompareConflictMessage,
  voiceCompareConflicts,
  type OtherPublishedLesson,
} from "./voiceCompare";

function voice(id: string, compare?: "before" | "interim" | "after") {
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

describe("beforeListenFor (AUTH-020)", () => {
  const withList = (id: string, compare: "before" | "after", listenFor: unknown) => ({ ...voice(id, compare), listenFor });

  it("reads the list of the first 'before' task, across documents", () => {
    const lesson1 = [prose("p1"), withList("b", "before", ["I used to", "by the time"])];
    const lesson2 = [withList("a", "after", ["something else"])];
    expect(beforeListenFor([lesson2, lesson1])).toEqual(["I used to", "by the time"]);
  });

  it("is undefined when the 'before' task lists nothing, there is none, or only an 'after' has a list", () => {
    expect(beforeListenFor([[voice("b", "before")]])).toBeUndefined();
    expect(beforeListenFor([[withList("b", "before", [])]])).toBeUndefined();
    expect(beforeListenFor([[prose("p1")], [withList("a", "after", ["x"])]])).toBeUndefined();
    expect(beforeListenFor([])).toBeUndefined();
  });

  it("does not throw on a document or a list written under another shape", () => {
    expect(beforeListenFor([null, "text", { not: "an array" }, [null, 3, withList("b", "before", "nope")]])).toBeUndefined();
    expect(beforeListenFor([[withList("b", "before", ["ok", 3, "  "])]])).toEqual(["ok"]);
  });
});

describe("voiceCompareConflicts: the interim slot (VOICE-017)", () => {
  const lessonAt = (lessonId: string, ordinal: number, ...blocks: unknown[]): OtherPublishedLesson => ({
    lessonId,
    title: `T-${lessonId}`,
    ordinal,
    document: blocks,
  });

  it("allows before then interim in the same lesson", () => {
    expect(voiceCompareConflicts(LESSON_1, doc(voice("b", "before"), voice("i", "interim")), [], 1)).toEqual([]);
  });

  it("refuses interim then before in the same lesson", () => {
    const conflicts = voiceCompareConflicts(LESSON_1, doc(voice("i", "interim"), voice("b", "before")), [], 1);
    expect(conflicts).toEqual([
      { slot: "interim", reason: "interim_before_before", blockId: "i", otherHolds: null, otherLessonId: null, otherTitle: null },
    ]);
    expect(voiceCompareConflictMessage(conflicts[0])).toContain("in this lesson");
  });

  it("refuses an interim in a lesson before the lesson that holds the before task", () => {
    const others = [lessonAt(LESSON_2, 2, voice("b", "before"))];
    const conflicts = voiceCompareConflicts(LESSON_1, doc(voice("i", "interim")), others, 1);
    expect(conflicts).toEqual([
      { slot: "interim", reason: "interim_before_before", blockId: "i", otherHolds: "before", otherLessonId: LESSON_2, otherTitle: "T-lesson-2" },
    ]);
    expect(voiceCompareConflictMessage(conflicts[0])).toContain('"T-lesson-2"');
  });

  it("allows an interim in a lesson after the lesson that holds the before task", () => {
    const others = [lessonAt(LESSON_1, 1, voice("b", "before"))];
    expect(voiceCompareConflicts(LESSON_2, doc(voice("i", "interim")), others, 2)).toEqual([]);
  });

  it("does not order two lessons with the same ordinal", () => {
    const others = [lessonAt(LESSON_1, 3, voice("b", "before"))];
    expect(voiceCompareConflicts(LESSON_2, doc(voice("i", "interim")), others, 3)).toEqual([]);
  });

  it("allows an interim with no before task in the course (it then runs without a baseline)", () => {
    expect(voiceCompareConflicts(LESSON_1, doc(voice("i", "interim")), [lessonAt(LESSON_2, 2, prose("p"))], 1)).toEqual([]);
  });

  it("refuses publishing a before below a lesson that already holds the interim", () => {
    const others = [lessonAt(LESSON_1, 1, voice("i", "interim"))];
    const conflicts = voiceCompareConflicts(LESSON_2, doc(voice("b", "before")), others, 2);
    expect(conflicts).toMatchObject([{ reason: "interim_before_before", blockId: "b", otherHolds: "interim", otherLessonId: LESSON_1 }]);
  });

  it("skips the cross-lesson order check when an ordinal is not known", () => {
    const others: OtherPublishedLesson[] = [{ lessonId: LESSON_2, title: "x", document: [voice("b", "before")] }];
    expect(voiceCompareConflicts(LESSON_1, doc(voice("i", "interim")), others)).toEqual([]);
  });

  it("refuses two interims, in one lesson and across lessons", () => {
    expect(voiceCompareConflicts(LESSON_1, doc(voice("a", "interim"), voice("b", "interim")), [], 1)).toEqual([
      { slot: "interim", reason: "twice_in_lesson", blockIds: ["a", "b"] },
    ]);
    const others = [lessonAt(LESSON_1, 1, voice("a", "interim"))];
    expect(voiceCompareConflicts(LESSON_2, doc(voice("b", "interim")), others, 2)).toEqual([
      { slot: "interim", reason: "held_by_other_lesson", blockId: "b", otherLessonId: LESSON_1, otherTitle: "T-lesson-1" },
    ]);
  });
});
