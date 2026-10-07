import { describe, expect, it } from "vitest";
import { summariseLessons } from "./catalogueSummary";

const published = (minutes: number | null) => ({
  estimated_minutes: minutes,
  published_version_id: "v1",
  archived_at: null,
});

describe("summariseLessons", () => {
  it("counts lessons and sums their minutes", () => {
    expect(summariseLessons([published(8), published(12), published(10)])).toEqual({
      lessonCount: 3,
      totalMinutes: 30,
    });
  });

  it("returns null minutes when any counted lesson has no estimate (a partial sum would understate the course)", () => {
    expect(summariseLessons([published(8), published(null)])).toEqual({
      lessonCount: 2,
      totalMinutes: null,
    });
  });

  it("returns zero lessons and null minutes for a course with no lessons", () => {
    expect(summariseLessons([])).toEqual({ lessonCount: 0, totalMinutes: null });
  });

  it("excludes never-published lessons (the editor read policy returns drafts to a signed-in editor)", () => {
    const draft = { estimated_minutes: 99, published_version_id: null, archived_at: null };
    expect(summariseLessons([published(10), draft])).toEqual({ lessonCount: 1, totalMinutes: 10 });
  });

  it("excludes archived lessons", () => {
    const archived = { estimated_minutes: 99, published_version_id: "v2", archived_at: "2026-09-01T00:00:00Z" };
    expect(summariseLessons([published(10), archived])).toEqual({ lessonCount: 1, totalMinutes: 10 });
  });

  it("does not let an excluded draft's missing estimate null out the total", () => {
    const draft = { estimated_minutes: null, published_version_id: null, archived_at: null };
    expect(summariseLessons([published(10), draft])).toEqual({ lessonCount: 1, totalMinutes: 10 });
  });
});
