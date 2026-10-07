import { describe, expect, it } from "vitest";
import {
  bestScoreForLesson,
  courseProgress,
  courseTotals,
  firstFreeLesson,
  lessonNav,
  publishedLessonsOnly,
  type PublicCourseLesson,
} from "./coursePageProgress";

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

describe("publishedLessonsOnly", () => {
  const row = (slug: string, published_version_id: string | null, archived_at: string | null) => ({ slug, published_version_id, archived_at });

  it("keeps only published, non-archived rows, in input order", () => {
    const rows = [row("pub", "v1", null), row("draft", null, null), row("archived", "v2", "2026-09-01T00:00:00Z"), row("pub2", "v3", null)];
    expect(publishedLessonsOnly(rows).map((r) => r.slug)).toEqual(["pub", "pub2"]);
  });

  it("drops an archived lesson even if it was never published", () => {
    expect(publishedLessonsOnly([row("x", null, "2026-09-01T00:00:00Z")])).toEqual([]);
  });
});

describe("courseTotals", () => {
  it("sums minutes and flags a course whose every lesson is free", () => {
    const lessons = [
      lesson({ slug: "a", ordinal: 1, estimatedMinutes: 12, inFreeSample: true }),
      lesson({ slug: "b", ordinal: 2, estimatedMinutes: 15, inFreeSample: true }),
    ];
    expect(courseTotals(lessons)).toEqual({ lessonCount: 2, exerciseCount: 10, totalMinutes: 27, allFree: true });
  });

  it("is not allFree when any lesson is paid", () => {
    const lessons = [lesson({ slug: "a", ordinal: 1, inFreeSample: true }), lesson({ slug: "b", ordinal: 2, inFreeSample: false })];
    expect(courseTotals(lessons).allFree).toBe(false);
  });

  it("gives null minutes rather than a partial sum when any lesson lacks an estimate", () => {
    const lessons = [lesson({ slug: "a", ordinal: 1, estimatedMinutes: 12 }), lesson({ slug: "b", ordinal: 2, estimatedMinutes: null })];
    expect(courseTotals(lessons).totalMinutes).toBeNull();
  });

  it("claims nothing for a course with no lessons", () => {
    expect(courseTotals([])).toEqual({ lessonCount: 0, exerciseCount: 0, totalMinutes: null, allFree: false });
  });
});

describe("lessonNav", () => {
  // Ordinals deliberately gapped and non-contiguous: position must come from
  // the list index, never the ordinal.
  const lessons = [lesson({ slug: "a", ordinal: 10 }), lesson({ slug: "b", ordinal: 30 }), lesson({ slug: "c", ordinal: 31 })];

  it("returns the 1-based list position, the total and the following lesson", () => {
    const nav = lessonNav(lessons, "b");
    expect(nav?.position).toBe(2);
    expect(nav?.total).toBe(3);
    expect(nav?.next?.slug).toBe("c");
  });

  it("has no next lesson for the last one", () => {
    expect(lessonNav(lessons, "c")).toEqual({ position: 3, total: 3, next: null });
  });

  it("is null for a slug that isn't in the list", () => {
    expect(lessonNav(lessons, "missing")).toBeNull();
  });
});
