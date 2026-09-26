import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isValidLessonSlugFormat, LESSON_SLUG_RE, slugifyLessonTitle } from "./lessonSlug";

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

  // CNT-010 / docs/decisions/0044 addendum: before this transliteration step
  // existed, both of these collapsed to the "lesson"/"2" fallback ladder —
  // the failure this card exists to fix. Printed, not just asserted, per the
  // acceptance line's "print them".
  it("transliterates a Cyrillic-only title into a meaningful, non-fallback slug", () => {
    const a = slugifyLessonTitle("Прошедшее время: вопросы");
    const b = slugifyLessonTitle("Прошедшее время 2: вопросы");
    console.log("Прошедшее время: вопросы ->", a);
    console.log("Прошедшее время 2: вопросы ->", b);
    expect(a).toBe("proshedshee-vremya-voprosy");
    expect(b).toBe("proshedshee-vremya-2-voprosy");
    expect(a).not.toBe("lesson");
    expect(b).not.toBe("2");
    expect(a).not.toBe(b);
  });

  it("every output matches lessons_slug_check (migration 043) verbatim", () => {
    const migration = readFileSync(
      path.resolve(__dirname, "..", "supabase", "migrations", "043_lesson_slug.sql"),
      "utf-8",
    );
    const match = migration.match(/CHECK \(slug ~ '([^']+)'\)/);
    expect(match).not.toBeNull();
    const slugCheck = new RegExp(match![1]);

    for (const title of [
      "Section A",
      "Future Imperfect: Part 1!",
      "  -Intro-  ",
      "!!!",
      "",
      "Прошедшее время: вопросы",
      "Прошедшее время 2: вопросы",
    ]) {
      expect(slugifyLessonTitle(title)).toMatch(slugCheck);
    }
  });
});

describe("isValidLessonSlugFormat / LESSON_SLUG_RE", () => {
  it("accepts lowercase kebab-case", () => {
    expect(isValidLessonSlugFormat("proshedshee-vremya")).toBe(true);
    expect(isValidLessonSlugFormat("lesson-2")).toBe(true);
  });

  it("rejects anything slugifyLessonTitle would never produce", () => {
    for (const bad of ["Has-Caps", "trailing-", "-leading", "double--hyphen", "", "with space", "юникод"]) {
      expect(isValidLessonSlugFormat(bad)).toBe(false);
    }
  });

  it("matches lessons_slug_check (migration 043) verbatim", () => {
    const migration = readFileSync(
      path.resolve(__dirname, "..", "supabase", "migrations", "043_lesson_slug.sql"),
      "utf-8",
    );
    const match = migration.match(/CHECK \(slug ~ '([^']+)'\)/);
    expect(match).not.toBeNull();
    expect(LESSON_SLUG_RE.source).toBe(match![1]);
  });
});
