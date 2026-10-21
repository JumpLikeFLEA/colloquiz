import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CourseFileSchema } from "./courseFile";
import { parseLessonDocument } from "./parseLessonDocument";

// AUTH-020: "Every existing lesson document still parses (vitest over the
// authored course files)". `authored/` is gitignored (the maintainer's local
// drafts), so on a checkout without it the first test is skipped; where it
// exists, the counts below must be positive, so a missing glob or an empty
// directory cannot pass as a green check.
const AUTHORED_DIR = join(process.cwd(), "authored", "courses");
const hasAuthored = existsSync(AUTHORED_DIR);

describe.skipIf(!hasAuthored)("authored/courses/*.json", () => {
  const files = hasAuthored ? readdirSync(AUTHORED_DIR).filter((f) => f.endsWith(".json")) : [];

  it("has at least one file to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("every file passes the importer's schema and every lesson document parses", () => {
    let blocks = 0;
    for (const file of files) {
      const course = CourseFileSchema.parse(JSON.parse(readFileSync(join(AUTHORED_DIR, file), "utf8")));
      for (const lesson of course.lessons) {
        const parsed = parseLessonDocument(lesson.document);
        expect(parsed.ok, `${file} / ${lesson.slug}`).toBe(true);
        if (parsed.ok) blocks += parsed.document.length;
      }
    }
    expect(blocks).toBeGreaterThan(0);
  });
});

describe("a course file with a voice task that lists expressions (importer and validate-course-file path)", () => {
  const course = (listenFor: unknown) => ({
    slug: "demo",
    title: "Demo",
    level: "B1",
    lessons: [
      {
        slug: "intro",
        title: "Intro",
        document: [
          {
            id: "v1",
            kind: "task",
            type: "voice",
            prompt: [{ text: "Tell us about your week." }],
            maxSeconds: 180,
            compare: "before",
            listenFor,
          },
        ],
      },
    ],
  });

  it("parses and keeps the list", () => {
    const file = CourseFileSchema.parse(course(["I used to", "by the time"]));
    const parsed = parseLessonDocument(file.lessons[0].document);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.document[0]).toMatchObject({ listenFor: ["I used to", "by the time"] });
  });

  it("is refused offline when the list breaks a bound", () => {
    const file = CourseFileSchema.parse(course(["x", "x"]));
    expect(parseLessonDocument(file.lessons[0].document).ok).toBe(false);
  });
});
