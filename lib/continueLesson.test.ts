import { describe, expect, it } from "vitest";
import { needsLastOpened, pickContinueLesson } from "./continueLesson";
import type { AttemptsByLessonSlug, LessonAttemptSummary, PublicCourseLesson } from "./coursePageProgress";

function lesson(slug: string, ordinal: number, state: PublicCourseLesson["state"] = "open"): PublicCourseLesson {
  return {
    slug,
    title: `Title ${slug}`,
    description: null,
    itemCount: 4,
    estimatedMinutes: 10,
    accessLevel: "anyone",
    state,
    opensAt: null,
    week: null,
    ordinal,
  };
}

const done: LessonAttemptSummary = { bestPercent: 80, complete: true, exercisesAnswered: 4, exercisesTotal: 4 };
const theoryDone: LessonAttemptSummary = { bestPercent: null, complete: true, exercisesAnswered: 0, exercisesTotal: 0 };
const partial: LessonAttemptSummary = { bestPercent: null, complete: false, exercisesAnswered: 2, exercisesTotal: 4 };

const four = [lesson("a", 1), lesson("b", 2), lesson("c", 3), lesson("d", 4)];

describe("pickContinueLesson", () => {
  it("is null before anything is attempted, so the first-lesson CTA stays", () => {
    expect(pickContinueLesson(four, {}, null)).toBeNull();
  });

  it("picks the first open lesson that is not complete", () => {
    const attempts: AttemptsByLessonSlug = { a: done, b: done };
    expect(pickContinueLesson(four, attempts, "b")?.slug).toBe("c");
  });

  it("goes back to a skipped lesson", () => {
    expect(pickContinueLesson(four, { a: done, c: done }, "c")?.slug).toBe("b");
  });

  it("treats a partly answered lesson as where the learner left off", () => {
    expect(pickContinueLesson(four, { a: done, b: partial }, "b")?.slug).toBe("b");
  });

  it("engages on a partly answered lesson alone", () => {
    expect(pickContinueLesson(four, { a: partial }, null)?.slug).toBe("a");
  });

  it("does not stop on a completed theory-only lesson", () => {
    expect(pickContinueLesson(four, { a: done, b: theoryDone }, "b")?.slug).toBe("c");
  });

  it("falls back to the last opened lesson when all are complete", () => {
    const all = { a: done, b: done, c: done, d: done };
    expect(pickContinueLesson(four, all, "b")?.slug).toBe("b");
  });

  it("falls back to the last lesson when all are complete and the last opened is unknown or not a candidate", () => {
    const all = { a: done, b: done, c: done, d: done };
    expect(pickContinueLesson(four, all, null)?.slug).toBe("d");
    expect(pickContinueLesson(four, all, "gone")?.slug).toBe("d");
  });

  it("never targets a scheduled, sign-in or paid lesson", () => {
    const lessons = [
      lesson("a", 1),
      lesson("w2", 2, "scheduled"),
      lesson("s", 3, "needs_sign_in"),
      lesson("p", 4, "needs_entitlement"),
    ];
    expect(pickContinueLesson(lessons, { a: done }, "a")?.slug).toBe("a");
    expect(pickContinueLesson(lessons, { a: done }, "w2")?.slug).toBe("a");
  });

  it("is null when nothing is open to the caller", () => {
    expect(pickContinueLesson([lesson("w1", 1, "scheduled")], { w1: done }, null)).toBeNull();
  });
});

describe("needsLastOpened", () => {
  it("is true only when every open lesson is complete", () => {
    expect(needsLastOpened(four, { a: done, b: done, c: done, d: done })).toBe(true);
    expect(needsLastOpened(four, { a: done, b: done, c: done })).toBe(false);
    expect(needsLastOpened([lesson("w", 1, "scheduled")], {})).toBe(false);
  });
});
