import { describe, expect, it } from "vitest";
import {
  groupLessonsByCourse,
  groupRecordings,
  parseLearnerId,
  toLessonActivityRow,
  toRecordingRow,
  type LessonActivityRow,
  type RecordingRow,
} from "./detail";

const A = "4651bdf0-945b-4e68-be50-1e51c6ca75af";
const B = "881395e3-2a20-429f-9f04-5b8c94ca83d9";

function lesson(over: Partial<LessonActivityRow>): LessonActivityRow {
  return {
    courseId: A,
    courseTitle: "Course A",
    lessonId: "l1",
    lessonTitle: "Lesson 1",
    lessonOrdinal: 1,
    week: null,
    lessonListed: true,
    opened: false,
    lastOpenedAt: null,
    firstCompletedAt: null,
    lastCompletedAt: null,
    voicesSent: 0,
    voicesAnswered: 0,
    lastActivityAt: null,
    ...over,
  };
}

function take(over: Partial<RecordingRow>): RecordingRow {
  return {
    submissionId: "s1",
    courseId: A,
    courseTitle: "Course A",
    enrolmentId: "e1",
    enrolmentRevokedAt: null,
    runId: "r1",
    runTitle: "October",
    runStartsAt: "2026-10-01T00:00:00Z",
    lessonId: "l1",
    lessonTitle: "Week one",
    lessonOrdinal: 1,
    week: 1,
    blockId: "v1",
    blockPrompt: null,
    compare: null,
    submittedAt: "2026-10-02T00:00:00Z",
    recordingRemoved: false,
    feedbackBody: null,
    feedbackUpdatedAt: null,
    feedbackPublishedAt: null,
    ...over,
  };
}

describe("parseLearnerId", () => {
  it("accepts a UUID and lowercases it", () => {
    expect(parseLearnerId(A.toUpperCase())).toBe(A);
  });
  it.each(["", "abc", `${A}x`, "../etc"])("rejects %j", (raw) => {
    expect(parseLearnerId(raw)).toBeNull();
  });
});

describe("row mappers", () => {
  it("maps a lesson row, defaulting missing numbers to 0", () => {
    const r = toLessonActivityRow({
      course_id: A,
      course_title: "Course A",
      lesson_id: "l1",
      lesson_title: "L",
      lesson_ordinal: 2,
      week: null,
      lesson_listed: true,
      opened: true,
      last_opened_at: null,
      first_completed_at: "2026-10-03T00:00:00Z",
      last_completed_at: "2026-10-04T00:00:00Z",
      voices_sent: 1,
      voices_answered: null,
      last_activity_at: "2026-10-04T00:00:00Z",
    });
    expect(r).toMatchObject({ lessonOrdinal: 2, opened: true, voicesSent: 1, voicesAnswered: 0, lastOpenedAt: null });
  });

  it("reads only before/after as a compare slot", () => {
    expect(toRecordingRow({ block_compare: "before" }).compare).toBe("before");
    expect(toRecordingRow({ block_compare: "after" }).compare).toBe("after");
    expect(toRecordingRow({ block_compare: null }).compare).toBeNull();
    expect(toRecordingRow({ block_compare: "middle" }).compare).toBeNull();
  });
});

describe("groupLessonsByCourse", () => {
  it("groups in order and counts only listed lessons", () => {
    const groups = groupLessonsByCourse([
      lesson({ lessonId: "a1", opened: true, firstCompletedAt: "t" }),
      lesson({ lessonId: "a2", lessonOrdinal: 2, opened: true }),
      lesson({ lessonId: "a3", lessonOrdinal: 3, lessonListed: false, opened: true, firstCompletedAt: "t" }),
      lesson({ courseId: B, courseTitle: "Course B", lessonId: "b1" }),
    ]);
    expect(groups.map((g) => g.courseId)).toEqual([A, B]);
    expect(groups[0]).toMatchObject({ listedCount: 2, openedCount: 2, completedCount: 1 });
    expect(groups[0].lessons.map((l) => l.lessonId)).toEqual(["a1", "a2", "a3"]);
    expect(groups[1]).toMatchObject({ listedCount: 1, openedCount: 0, completedCount: 0 });
  });

  it("returns nothing for no rows", () => {
    expect(groupLessonsByCourse([])).toEqual([]);
  });
});

describe("groupRecordings", () => {
  it("pairs before and after per enrolment and keeps weekly takes apart", () => {
    const groups = groupRecordings([
      take({ submissionId: "after", lessonOrdinal: 4, blockId: "va", compare: "after" }),
      take({ submissionId: "w1", lessonOrdinal: 1, blockId: "w1" }),
      take({ submissionId: "before", lessonOrdinal: 1, blockId: "vb", compare: "before" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].beforeAfter?.before?.submissionId).toBe("before");
    expect(groups[0].beforeAfter?.after?.submissionId).toBe("after");
    expect(groups[0].weekly.map((r) => r.submissionId)).toEqual(["w1"]);
  });

  it("shows a pair with one side missing when only one slot was sent", () => {
    const [g] = groupRecordings([take({ compare: "before" })]);
    expect(g.beforeAfter).toEqual({ before: expect.objectContaining({ compare: "before" }), after: null });
  });

  it("has no pair for an enrolment without compare takes", () => {
    const [g] = groupRecordings([take({})]);
    expect(g.beforeAfter).toBeNull();
    expect(g.weekly).toHaveLength(1);
  });

  it("keeps the earliest lesson's take in a doubled slot and lists the other", () => {
    const [g] = groupRecordings([
      take({ submissionId: "late", lessonOrdinal: 3, compare: "before" }),
      take({ submissionId: "early", lessonOrdinal: 1, compare: "before" }),
    ]);
    expect(g.beforeAfter?.before?.submissionId).toBe("early");
    expect(g.weekly.map((r) => r.submissionId)).toEqual(["late"]);
  });

  it("separates enrolments (two runs, two courses) and carries revocation", () => {
    const groups = groupRecordings([
      take({ submissionId: "x", enrolmentId: "e2", runId: "r2", runStartsAt: "2026-11-01T00:00:00Z", enrolmentRevokedAt: "t" }),
      take({ submissionId: "y" }),
      take({ submissionId: "z", enrolmentId: "e3", courseId: B, courseTitle: "Course B" }),
    ]);
    expect(groups.map((g) => g.enrolmentId)).toEqual(["e1", "e2", "e3"]);
    expect(groups[1].revokedAt).toBe("t");
  });
});
