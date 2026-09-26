import { describe, expect, it } from "vitest";
import { bestScoreForLesson, courseProgress, firstFreeLesson, type PublicCourseLesson } from "./coursePageProgress";

function lesson(overrides: Partial<PublicCourseLesson> & { slug: string; ordinal: number }): PublicCourseLesson {
  return {
    title: overrides.slug,
    description: null,
    itemCount: 5,
    estimatedMinutes: 10,
    inFreeSample: false,
    ...overrides,
  };
}

describe("firstFreeLesson", () => {
  it("picks the lowest-ordinal free-sample lesson, not the lowest ordinal overall", () => {
    const lessons = [
      lesson({ slug: "a", ordinal: 1, inFreeSample: false }),
      lesson({ slug: "b", ordinal: 2, inFreeSample: true }),
      lesson({ slug: "c", ordinal: 3, inFreeSample: true }),
    ];
    expect(firstFreeLesson(lessons)?.slug).toBe("b");
  });

  it("is null when no lesson is in the free sample", () => {
    const lessons = [lesson({ slug: "a", ordinal: 1, inFreeSample: false })];
    expect(firstFreeLesson(lessons)).toBeNull();
  });

  it("does not mutate the input order", () => {
    const lessons = [
      lesson({ slug: "b", ordinal: 2, inFreeSample: true }),
      lesson({ slug: "a", ordinal: 1, inFreeSample: true }),
    ];
    firstFreeLesson(lessons);
    expect(lessons[0].slug).toBe("b");
  });
});

describe("bestScoreForLesson", () => {
  it("is null when the lesson has no recorded attempt", () => {
    expect(bestScoreForLesson("a", {})).toBeNull();
  });

  it("returns the stored best percent", () => {
    expect(bestScoreForLesson("a", { a: { bestPercent: 80 } })).toBe(80);
  });
});

describe("courseProgress", () => {
  it("is 0 attempted with no average when the attempts map is empty", () => {
    const lessons = [lesson({ slug: "a", ordinal: 1 }), lesson({ slug: "b", ordinal: 2 })];
    expect(courseProgress(lessons, {})).toEqual({ attempted: 0, total: 2, averagePercent: null });
  });

  it("averages only the attempted lessons, never blending in the unattempted ones", () => {
    const lessons = [lesson({ slug: "a", ordinal: 1 }), lesson({ slug: "b", ordinal: 2 }), lesson({ slug: "c", ordinal: 3 })];
    const attempts = { a: { bestPercent: 60 }, b: { bestPercent: 100 } };
    expect(courseProgress(lessons, attempts)).toEqual({ attempted: 2, total: 3, averagePercent: 80 });
  });
});
