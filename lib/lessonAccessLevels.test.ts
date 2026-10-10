import { describe, expect, it } from "vitest";
import { LESSON_ACCESS_LEVELS, LESSON_ACCESS_LEVEL_LABELS, lessonsOpenToAnyone } from "./lessonAccessLevels";

describe("LESSON_ACCESS_LEVELS", () => {
  it("lists exactly 055's CHECK values, each with an English label", () => {
    expect([...LESSON_ACCESS_LEVELS]).toEqual(["anyone", "signed_in", "entitled"]);
    for (const level of LESSON_ACCESS_LEVELS) expect(LESSON_ACCESS_LEVEL_LABELS[level]).toMatch(/^[A-Za-z -]+$/);
  });
});

describe("lessonsOpenToAnyone", () => {
  const lessons = [
    { id: "a", accessLevel: "anyone" as const, archivedAt: null },
    { id: "b", accessLevel: "signed_in" as const, archivedAt: null },
    { id: "c", accessLevel: "anyone" as const, archivedAt: "2026-10-01T00:00:00Z" },
    { id: "d", accessLevel: "entitled" as const, archivedAt: null },
    { id: "e", accessLevel: "anyone" as const, archivedAt: null },
  ];

  it("keeps non-archived anyone lessons, in list order", () => {
    expect(lessonsOpenToAnyone(lessons).map((l) => l.id)).toEqual(["a", "e"]);
  });

  it("leaves out an archived anyone lesson (055 counts only non-archived ones)", () => {
    expect(lessonsOpenToAnyone(lessons).some((l) => l.id === "c")).toBe(false);
  });

  it("is empty when no lesson is open to anyone", () => {
    expect(lessonsOpenToAnyone(lessons.filter((l) => l.accessLevel !== "anyone"))).toEqual([]);
  });
});
