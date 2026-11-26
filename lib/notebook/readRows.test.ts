import { describe, expect, it } from "vitest";
import { lesson, own, said, summary, take } from "./fixtures";
import { courseIds, toLessons, toTakes, type LessonRow, type TakeRow } from "./readRows";
import { openLessonHref, rowSource, sourceIndex } from "./source";

const takeRow = (over: Partial<TakeRow> = {}): TakeRow => ({
  id: "t1",
  course_id: "c1",
  lesson_id: "l1",
  submitted_at: "2026-11-01T10:00:00+00:00",
  enrolment_id: null,
  object_name: "x",
  content_type: "audio/webm",
  run_enrolments: null,
  ...over,
});

describe("toTakes", () => {
  it("takes titles from its own copied rows only", () => {
    const [a, b, c] = toTakes(
      [takeRow(), takeRow({ id: "t2" }), takeRow({ id: "t3" })],
      [said("x", { submissionId: "t2", lessonTitle: "From the entry" }), own("note", { lessonTitle: "Never" })],
      [summary({ lessonTitle: "From the summary" })],
    );
    expect([a.lessonTitle, b.lessonTitle, c.lessonTitle]).toEqual(["From the summary", "From the entry", null]);
  });

  it("reads a cohort take's run end, and null when the run was not readable", () => {
    const ends_at = "2026-12-01T00:00:00+00:00";
    const [a, b] = toTakes(
      [
        takeRow({ enrolment_id: "e1", run_enrolments: { course_runs: { ends_at } } }),
        takeRow({ id: "t2", enrolment_id: "e1", run_enrolments: { course_runs: null } }),
      ],
      [],
      [],
    );
    expect([a.runEndsAt, b.runEndsAt]).toEqual([ends_at, null]);
  });
});

const lessonRow = (over: Partial<LessonRow> = {}): LessonRow => ({
  id: "l1",
  course_id: "c1",
  slug: "one",
  title: "One",
  ordinal: 1,
  archived_at: null,
  version: { document: [] },
  ...over,
});

describe("toLessons", () => {
  it("keeps an empty document apart from an unreadable one", () => {
    const docs = toLessons([lessonRow(), lessonRow({ version: null }), lessonRow({ version: { document: "x" } })]);
    expect(docs.map((l) => l.document)).toEqual([[], null, null]);
  });
});

describe("openLessonHref", () => {
  const courses = [{ id: "c1", slug: "course", title: "Course" }];
  it("links only a lesson whose content was read; rowSource still links the listed one", () => {
    const read = sourceIndex(courses, [lesson()]);
    const listed = sourceIndex(courses, [lesson({ document: null })]);
    const archived = sourceIndex(courses, [lesson({ archived: true })]);
    expect(openLessonHref(take(), read)).toBe("/courses/course/one");
    expect(openLessonHref(take(), listed)).toBeNull();
    expect(openLessonHref(take(), archived)).toBeNull();
    expect(rowSource(take(), listed).href).toBe("/courses/course/one");
  });
});

describe("courseIds", () => {
  it("unions started and stored courses, once each, without a null", () => {
    expect(
      courseIds(
        [{ courseId: "c1", hasBefore: false, beforeTaken: false }],
        [{ courseId: "c1" }, { courseId: "c2" }, { courseId: null }],
      ),
    ).toEqual(["c1", "c2"]);
  });
});
