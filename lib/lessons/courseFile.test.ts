import { describe, expect, it } from "vitest";
import { CourseFileSchema, LessonFileSchema } from "./courseFile";

// CNT-010: scripts/import-lesson.ts inserts lessons directly via the
// service-role client (bypassing create_lesson), using whatever `slug` the
// authored file supplies — it never derives one from the title. This is the
// "apply the same format rule" branch of CNT-010's acceptance line (the
// importer doesn't build a slug via lib/lessonSlug.ts, since the file already
// carries an explicit one), verified here against the schema the importer
// validates every file against BEFORE any write (import-lesson.ts's own
// "all three run fully before anything touches the database").
describe("LessonFileSchema slug field", () => {
  it("accepts a lowercase kebab-case slug", () => {
    expect(LessonFileSchema.safeParse({ slug: "section-a", title: "Section A", document: [] }).success).toBe(true);
  });

  it("rejects a raw Cyrillic slug (the importer expects an already-slugified value, not a title)", () => {
    const result = LessonFileSchema.safeParse({ slug: "прошедшее-время", title: "Прошедшее время", document: [] });
    expect(result.success).toBe(false);
  });

  it("rejects the same malformed shapes create_lesson/update_lesson_slug reject (uppercase, edge hyphens, double hyphens)", () => {
    for (const slug of ["Section-A", "-intro", "intro-", "a--b"]) {
      expect(LessonFileSchema.safeParse({ slug, title: "x", document: [] }).success).toBe(false);
    }
  });
});

describe("CourseFileSchema duplicate-slug check", () => {
  it("flags two lessons sharing a slug within one file", () => {
    const result = CourseFileSchema.safeParse({
      slug: "future-imperfect",
      title: "Future Imperfect",
      level: "B1",
      lessons: [
        { slug: "intro", title: "Intro", document: [] },
        { slug: "intro", title: "Intro again", document: [] },
      ],
    });
    expect(result.success).toBe(false);
  });
});
