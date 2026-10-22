import { describe, expect, it } from "vitest";
import { learnerAnalysisHref, toLearnerAnalysisRow, toLearnerAnalysisRows } from "./learnerList";

const row = (over: Record<string, unknown> = {}, analysis: Record<string, unknown> = {}) => ({
  id: "s1",
  submitted_at: "2026-10-20T10:00:00Z",
  lessons: { slug: "week-one", title: "Week one" },
  courses: { slug: "coh", title: "Cohort" },
  voice_analyses: { status: "done", instruction: "first", hidden_at: null, ...analysis },
  ...over,
});

describe("toLearnerAnalysisRow", () => {
  it("reads a finished, shown analysis (positive control)", () => {
    expect(toLearnerAnalysisRow(row())).toEqual({
      submissionId: "s1",
      sentAt: "2026-10-20T10:00:00Z",
      kind: "first",
      courseSlug: "coh",
      courseTitle: "Cohort",
      lessonSlug: "week-one",
      lessonTitle: "Week one",
    });
  });

  it("marks a final take as final, and anything else as first", () => {
    expect(toLearnerAnalysisRow(row({}, { instruction: "final" }))?.kind).toBe("final");
    expect(toLearnerAnalysisRow(row({}, { instruction: "weekly" }))?.kind).toBe("first");
    expect(toLearnerAnalysisRow(row({}, { instruction: null }))?.kind).toBe("first");
  });

  it("drops an analysis that is not done", () => {
    for (const status of ["pending", "transcribing", "analysing", "failed"]) {
      expect(toLearnerAnalysisRow(row({}, { status }))).toBeNull();
    }
  });

  it("drops a hidden analysis", () => {
    expect(toLearnerAnalysisRow(row({}, { hidden_at: "2026-10-21T00:00:00Z" }))).toBeNull();
  });

  it("drops a row with no analysis, no id or no date", () => {
    expect(toLearnerAnalysisRow(row({ voice_analyses: null }))).toBeNull();
    expect(toLearnerAnalysisRow(row({ id: null }))).toBeNull();
    expect(toLearnerAnalysisRow(row({ submitted_at: undefined }))).toBeNull();
    expect(toLearnerAnalysisRow(null)).toBeNull();
    expect(toLearnerAnalysisRow("x")).toBeNull();
  });

  it("tolerates a one-element array for an embed", () => {
    const r = toLearnerAnalysisRow(row({ voice_analyses: [{ status: "done", instruction: "final", hidden_at: null }] }));
    expect(r?.kind).toBe("final");
  });

  it("keeps the row when its course or lesson is no longer readable, with no title or slug", () => {
    const r = toLearnerAnalysisRow(row({ lessons: null, courses: null }));
    expect(r).toMatchObject({ courseSlug: null, lessonSlug: null, courseTitle: null, lessonTitle: null });
  });
});

describe("toLearnerAnalysisRows", () => {
  it("sorts newest take first and drops what is not shown", () => {
    const rows = toLearnerAnalysisRows([
      row({ id: "old", submitted_at: "2026-10-01T00:00:00Z" }),
      row({ id: "hidden" }, { hidden_at: "2026-10-02T00:00:00Z" }),
      row({ id: "new", submitted_at: "2026-10-22T00:00:00Z" }),
    ]);
    expect(rows.map((r) => r.submissionId)).toEqual(["new", "old"]);
  });

  it("an empty read is an empty list, not a pass: callers must not draw a section for it", () => {
    expect(toLearnerAnalysisRows([])).toEqual([]);
  });
});

describe("learnerAnalysisHref", () => {
  it("links to the lesson, and to nothing when either slug is missing", () => {
    expect(learnerAnalysisHref({ courseSlug: "coh", lessonSlug: "week-one" })).toBe("/courses/coh/week-one");
    expect(learnerAnalysisHref({ courseSlug: "coh", lessonSlug: null })).toBeNull();
    expect(learnerAnalysisHref({ courseSlug: null, lessonSlug: "week-one" })).toBeNull();
  });
});
