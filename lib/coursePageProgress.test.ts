import { describe, expect, it } from "vitest";
import {
  attachLessonStates,
  bestScoreForLesson,
  courseProgress,
  courseTotals,
  firstOpenLesson,
  firstOpenLessonLink,
  lessonNav,
  publishedLessonsOnly,
  type LessonStateRow,
  type PublicCourseLesson,
} from "./coursePageProgress";

function lesson(overrides: Partial<PublicCourseLesson> & { slug: string; ordinal: number }): PublicCourseLesson {
  return {
    title: overrides.slug,
    description: null,
    itemCount: 5,
    estimatedMinutes: 10,
    accessLevel: "entitled",
    state: "needs_entitlement",
    ...overrides,
  };
}

describe("attachLessonStates", () => {
  const states: LessonStateRow[] = [
    { lesson_id: "l1", access_level: "anyone", state: "open" },
    { lesson_id: "l2", access_level: "signed_in", state: "needs_sign_in" },
    { lesson_id: "l3", access_level: "entitled", state: "needs_entitlement" },
  ];

  it("copies each lesson's SQL level and state onto it, in row order", () => {
    const joined = attachLessonStates([{ id: "l3" }, { id: "l1" }, { id: "l2" }], states);
    expect(joined).toEqual([
      { id: "l3", accessLevel: "entitled", state: "needs_entitlement" },
      { id: "l1", accessLevel: "anyone", state: "open" },
      { id: "l2", accessLevel: "signed_in", state: "needs_sign_in" },
    ]);
  });

  it("throws rather than guess a state when a listed lesson has no state row", () => {
    expect(() => attachLessonStates([{ id: "l1" }, { id: "missing" }], states)).toThrow(/missing/);
  });

  it("is empty for no rows, and ignores state rows the list doesn't show", () => {
    expect(attachLessonStates([], states)).toEqual([]);
    expect(attachLessonStates([{ id: "l2" }], states)).toEqual([{ id: "l2", accessLevel: "signed_in", state: "needs_sign_in" }]);
  });
});

describe("firstOpenLesson", () => {
  it("picks the lowest-ordinal open lesson, not the lowest ordinal overall", () => {
    const lessons = [
      lesson({ slug: "a", ordinal: 1, state: "needs_sign_in" }),
      lesson({ slug: "b", ordinal: 2, state: "open" }),
      lesson({ slug: "c", ordinal: 3, state: "open" }),
    ];
    expect(firstOpenLesson(lessons)?.slug).toBe("b");
  });

  it("reads the state, not the level: an entitled lesson open to its buyer qualifies", () => {
    const lessons = [lesson({ slug: "a", ordinal: 1, accessLevel: "entitled", state: "open" })];
    expect(firstOpenLesson(lessons)?.slug).toBe("a");
  });

  it("is null when nothing is open to the caller", () => {
    const lessons = [lesson({ slug: "a", ordinal: 1 }), lesson({ slug: "b", ordinal: 2, state: "needs_sign_in" })];
    expect(firstOpenLesson(lessons)).toBeNull();
  });

  it("does not mutate the input order", () => {
    const lessons = [lesson({ slug: "b", ordinal: 2, state: "open" }), lesson({ slug: "a", ordinal: 1, state: "open" })];
    firstOpenLesson(lessons);
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
  const free = { accessLevel: "anyone", state: "open" } as const;

  it("sums minutes and flags a course whose every lesson is open to anyone", () => {
    const lessons = [
      lesson({ slug: "a", ordinal: 1, estimatedMinutes: 12, ...free }),
      lesson({ slug: "b", ordinal: 2, estimatedMinutes: 15, ...free }),
    ];
    expect(courseTotals(lessons)).toEqual({ lessonCount: 2, exerciseCount: 10, totalMinutes: 27, allFree: true, allOpen: true });
  });

  it("is not allFree when any lesson's level isn't anyone, even a free sign-in one", () => {
    const lessons = [lesson({ slug: "a", ordinal: 1, ...free }), lesson({ slug: "b", ordinal: 2, accessLevel: "signed_in", state: "open" })];
    expect(courseTotals(lessons)).toMatchObject({ allFree: false, allOpen: true });
  });

  it("is allOpen but not allFree for a buyer of a paid course", () => {
    const lessons = [lesson({ slug: "a", ordinal: 1, ...free }), lesson({ slug: "b", ordinal: 2, state: "open" })];
    expect(courseTotals(lessons)).toMatchObject({ allFree: false, allOpen: true });
  });

  it("is neither when a lesson is closed to the caller", () => {
    const lessons = [lesson({ slug: "a", ordinal: 1, ...free }), lesson({ slug: "b", ordinal: 2 })];
    expect(courseTotals(lessons)).toMatchObject({ allFree: false, allOpen: false });
  });

  it("gives null minutes rather than a partial sum when any lesson lacks an estimate", () => {
    const lessons = [lesson({ slug: "a", ordinal: 1, estimatedMinutes: 12 }), lesson({ slug: "b", ordinal: 2, estimatedMinutes: null })];
    expect(courseTotals(lessons).totalMinutes).toBeNull();
  });

  it("claims nothing for a course with no lessons", () => {
    expect(courseTotals([])).toEqual({ lessonCount: 0, exerciseCount: 0, totalMinutes: null, allFree: false, allOpen: false });
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

describe("firstOpenLessonLink", () => {
  const row = (id: string, slug: string, extra: { published_version_id?: string | null; archived_at?: string | null } = {}) => ({
    id,
    slug,
    title: `Title ${slug}`,
    published_version_id: "v",
    archived_at: null,
    ...extra,
  });

  it("is the first row, in the order given, whose SQL state is open", () => {
    const rows = [row("l1", "a"), row("l2", "b"), row("l3", "c")];
    const states: LessonStateRow[] = [
      { lesson_id: "l1", access_level: "signed_in", state: "needs_sign_in" },
      { lesson_id: "l2", access_level: "anyone", state: "open" },
      { lesson_id: "l3", access_level: "anyone", state: "open" },
    ];
    expect(firstOpenLessonLink(rows, states)).toEqual({ slug: "b", title: "Title b" });
  });

  it("skips draft and archived rows even when SQL calls them open (an editor's own read)", () => {
    const rows = [row("l1", "a", { published_version_id: null }), row("l2", "b", { archived_at: "2026-10-01" }), row("l3", "c")];
    const states: LessonStateRow[] = [
      { lesson_id: "l1", access_level: "anyone", state: "open" },
      { lesson_id: "l2", access_level: "anyone", state: "open" },
      { lesson_id: "l3", access_level: "anyone", state: "open" },
    ];
    expect(firstOpenLessonLink(rows, states)?.slug).toBe("c");
  });

  it("is null when nothing is open to the caller", () => {
    const states: LessonStateRow[] = [{ lesson_id: "l1", access_level: "entitled", state: "needs_entitlement" }];
    expect(firstOpenLessonLink([row("l1", "a")], states)).toBeNull();
  });

  it("throws when a listed row has no state row (attachLessonStates' invariant)", () => {
    expect(() => firstOpenLessonLink([row("l1", "a")], [])).toThrow(/no row for listed lesson l1/);
  });
});
