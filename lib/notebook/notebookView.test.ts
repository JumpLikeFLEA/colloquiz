import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fix, lesson, own, said, summary, take, voice } from "./fixtures";
import { notebookView, type NotebookInput } from "./notebookView";
import { rowSource } from "./source";
import { parseTab } from "./tabs";

const day = (d: number) => `2026-11-${String(d).padStart(2, "0")}T10:00:00+00:00`;
const empty: NotebookInput = {
  entries: [],
  summaries: [],
  takes: [],
  completion: [],
  gate: [],
  courses: [],
  lessons: [],
  tab: undefined,
  course: undefined,
};

/** c1: two said, one fix. c2: one own note. c3: to try only. One note with no course. */
const full: NotebookInput = {
  ...empty,
  entries: [
    said("a", { createdAt: day(1) }),
    said("b", { createdAt: day(2), exact: false }),
    said("a", { createdAt: day(4), submissionId: "t2" }),
    fix({ createdAt: day(2) }),
    own("c", { courseId: "c2", courseTitle: "Course two (then)", createdAt: day(5) }),
    own("d", { courseId: null, lessonId: null, courseTitle: null, lessonTitle: null, createdAt: day(6) }),
  ],
  summaries: [summary()],
  takes: [take(), take({ id: "t2" })],
  gate: [{ courseId: "c3", hasBefore: false, beforeTaken: false }],
  courses: [
    { id: "c1", slug: "one", title: "Course one" },
    { id: "c3", slug: "three", title: "Course three" },
  ],
  lessons: [
    lesson({ slug: "first", title: "Lesson one" }),
    lesson({ id: "l3", courseId: "c3", document: [voice("w", ["e"])] }),
  ],
};

describe("tabs and the course filter", () => {
  it("the tab is allow-listed", () => {
    expect(["fixes", "to-try", "phrases", "x", undefined, ["fixes"], null].map(parseTab)).toEqual([
      "fixes", "to-try", "phrases", "phrases", "phrases", "phrases", "phrases",
    ]);
  });

  it("All courses: every row, counted per tab, with one chip per course that has rows", () => {
    const v = notebookView(full);
    expect(v.courseId).toBeNull();
    expect(v.counts).toEqual({ phrases: 4, fixes: 1, "to-try": 1 });
    expect(v.phrases.map((p) => p.phrase)).toEqual(["d", "c", "a", "b"]);
    expect(v.chips).toEqual([
      { courseId: "c2", title: "Course two (then)" },
      { courseId: "c1", title: "Course one" },
      { courseId: "c3", title: "Course three" },
    ]);
  });

  it("a course: its rows and its counts; a row with no course is under All only", () => {
    const v = notebookView({ ...full, course: "c1" });
    expect(v.courseId).toBe("c1");
    expect(v.counts).toEqual({ phrases: 2, fixes: 1, "to-try": 0 });
    expect(notebookView({ ...full, course: "c2" }).phrases.map((p) => p.phrase)).toEqual(["c"]);
    expect(notebookView({ ...full, course: "c3" }).toTry.map((t) => t.phrase)).toEqual(["e"]);
  });

  it("a course with no chip is All courses", () => {
    for (const course of ["c9", "", null, ["c1"], undefined]) {
      expect(notebookView({ ...full, course }).courseId).toBeNull();
    }
  });

  it("the chips' counts add up to All courses, the row with no course aside", () => {
    const v = notebookView(full);
    const sum = v.chips.reduce((n, c) => n + notebookView({ ...full, course: c.courseId }).counts.phrases, 0);
    expect(sum).toBe(v.counts.phrases - 1);
  });
});

describe("the record", () => {
  const completion = [
    { courseId: "c1", lessonSlug: "one", complete: true },
    { courseId: "c1", lessonSlug: "two", complete: false },
    // The same slug in another course, which nothing readable lists: still counted.
    { courseId: "c9", lessonSlug: "one", complete: true },
    { courseId: "c9", lessonSlug: "one", complete: true },
  ];

  it("is exactly four numbers, and no filter changes them", () => {
    const want = { lessonsCompleted: 2, recordingsSent: 2, phrasesSaid: 2, notesSaved: 2 };
    expect(notebookView({ ...full, completion }).record).toEqual(want);
    expect(notebookView({ ...full, completion, course: "c2", tab: "fixes" }).record).toEqual(want);
  });

  it("phrases said equals the said rows under All courses", () => {
    const v = notebookView(full);
    expect(v.record.phrasesSaid).toBe(v.phrases.filter((p) => p.kind === "said").length);
  });

  it("a purged take and a take with no analysis still count as sent", () => {
    const takes = [take({ objectName: null }), take({ id: "t2" })];
    expect(notebookView({ ...empty, takes }).record.recordingsSent).toBe(2);
  });
});

describe("empty states", () => {
  it("the whole notebook, on every tab", () => {
    for (const tab of ["phrases", "fixes", "to-try"]) expect(notebookView({ ...empty, tab }).empty).toBe("notebook");
    // Completed lessons alone put nothing in the notebook.
    const completion = [{ courseId: "c1", lessonSlug: "one", complete: true }];
    expect(notebookView({ ...empty, completion }).empty).toBe("notebook");
  });

  it("anything at all ends the whole-notebook state", () => {
    expect(notebookView({ ...empty, takes: [take()] }).empty).toBe("tab");
    expect(notebookView({ ...empty, summaries: [summary()] }).empty).toBe("tab");
    expect(notebookView({ ...full, entries: [], summaries: [], takes: [] }).empty).toBe("tab");
  });

  it.each([
    ["phrases", { ...full, entries: [fix()] }],
    ["fixes", { ...full, entries: [said("a")] }],
    ["to-try", { ...full, gate: [] }],
  ] as const)("the %s tab on its own", (tab, input) => {
    expect(notebookView({ ...input, tab }).empty).toBe("tab");
    // Filtered to a course, a tab empty everywhere is still the tab's own state.
    expect(notebookView({ ...input, tab, course: "c1" }).empty).toBe("tab");
  });

  it.each([
    ["phrases", "c3"],
    ["fixes", "c2"],
    ["to-try", "c1"],
  ])("a course filter that leaves %s empty", (tab, course) => {
    expect(notebookView({ ...full, tab, course }).empty).toBe("course");
    expect(notebookView({ ...full, tab }).empty).toBeNull();
  });
});

describe("rowSource", () => {
  const v = notebookView(full);
  const stored = { courseTitle: "Course one (then)", lessonTitle: "Lesson one (then)" };
  const row = { courseId: "c1", lessonId: "l1", ...stored };

  it("shows the current titles and links a readable lesson", () => {
    expect(rowSource(row, v.sources)).toEqual({ courseTitle: "Course one", lessonTitle: "Lesson one", href: "/courses/one/first" });
  });
  it("keeps the stored titles, with no link, when nothing is readable", () => {
    expect(rowSource({ ...row, courseId: "c9", lessonId: "l9" }, v.sources)).toEqual({ ...stored, href: null });
  });
  it("does not link an archived lesson, or one whose course is not readable", () => {
    const archived = notebookView({ ...full, lessons: [lesson({ archived: true })] });
    expect(rowSource(row, archived.sources).href).toBeNull();
    expect(rowSource({ ...row, courseId: null }, v.sources).href).toBeNull();
  });
  it("has nothing for a note with no source", () => {
    expect(rowSource({ courseId: null, lessonId: null, courseTitle: null, lessonTitle: null }, v.sources)).toEqual({
      courseTitle: null, lessonTitle: null, href: null,
    });
  });
});

describe("the folder", () => {
  it("imports only its own modules and the task-block schema", () => {
    const dir = new URL(".", import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    const imports = files.flatMap((f) =>
      [...readFileSync(new URL(f, dir), "utf8").matchAll(/from "([^"]+)"/g)].map((m) => m[1]),
    );
    expect(files.length).toBeGreaterThan(10);
    expect(imports.length).toBeGreaterThan(10);
    expect(imports.filter((i) => !i.startsWith("./") && i !== "../lessons/taskBlocks")).toEqual([]);
  });
});
