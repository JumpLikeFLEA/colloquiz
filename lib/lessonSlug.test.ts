import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { slugifyLessonTitle } from "./lessonSlug";

describe("slugifyLessonTitle", () => {
  it("lowercases and hyphenates a normal title", () => {
    expect(slugifyLessonTitle("Section A")).toBe("section-a");
  });

  it("collapses runs of non-alphanumeric characters to one hyphen", () => {
    expect(slugifyLessonTitle("Future  Imperfect: Part 1!")).toBe("future-imperfect-part-1");
  });

  it("trims leading/trailing separators", () => {
    expect(slugifyLessonTitle("  -Intro-  ")).toBe("intro");
  });

  it("falls back to 'lesson' when the title has no ASCII alphanumeric content", () => {
    expect(slugifyLessonTitle("!!!")).toBe("lesson");
    expect(slugifyLessonTitle("")).toBe("lesson");
  });

  it("every output matches lessons_slug_check (migration 043) verbatim", () => {
    const migration = readFileSync(
      path.resolve(__dirname, "..", "supabase", "migrations", "043_lesson_slug.sql"),
      "utf-8",
    );
    const match = migration.match(/CHECK \(slug ~ '([^']+)'\)/);
    expect(match).not.toBeNull();
    const slugCheck = new RegExp(match![1]);

    for (const title of ["Section A", "Future Imperfect: Part 1!", "  -Intro-  ", "!!!", ""]) {
      expect(slugifyLessonTitle(title)).toMatch(slugCheck);
    }
  });
});
