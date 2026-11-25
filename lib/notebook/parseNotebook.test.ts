import { describe, expect, it } from "vitest";
import { parseNotebook } from "./parseNotebook";

const row = {
  id: "e1",
  submission_id: "t1",
  course_id: "c1",
  lesson_id: "l1",
  course_title: "C",
  lesson_title: "L",
  created_at: "2026-11-01T10:00:00.123456+00:00",
  updated_at: "2026-11-01T10:00:00+00:00",
  phrase: null,
  phrase_key: null,
  quote: null,
  exact: null,
  correction: null,
  note: null,
};
const saidRow = { ...row, kind: "said", phrase: "Be about to", phrase_key: "be about to", quote: "was about to", exact: false };
const fixRow = { ...row, id: "e2", kind: "fix", quote: "I have went", correction: "I went" };
const ownRow = { ...row, id: "e3", kind: "own", submission_id: null, course_id: null, lesson_id: null, phrase: "на всякий случай", note: "just in case" };
const summaryRow = {
  submission_id: "t1",
  course_id: "c1",
  lesson_id: "l1",
  course_title: "C",
  lesson_title: "L",
  kind: "interim",
  summary: "S",
  next_step: "N",
  goal: null,
  taken_at: "2026-11-01T10:00:00+00:00",
};

describe("parseNotebook", () => {
  it("reads a row of every kind", () => {
    const n = parseNotebook({ entries: [saidRow, fixRow, ownRow], summaries: [summaryRow] });
    const at = { courseId: "c1", lessonId: "l1", courseTitle: "C", lessonTitle: "L", createdAt: row.created_at };
    expect(n?.entries).toEqual([
      { ...at, id: "e1", kind: "said", submissionId: "t1", phrase: "Be about to", phraseKey: "be about to", quote: "was about to", exact: false },
      { ...at, id: "e2", kind: "fix", submissionId: "t1", quote: "I have went", correction: "I went" },
      { ...at, id: "e3", kind: "own", courseId: null, lessonId: null, phrase: "на всякий случай", note: "just in case" },
    ]);
    expect(n?.summaries).toEqual([
      { submissionId: "t1", courseId: "c1", lessonId: "l1", courseTitle: "C", lessonTitle: "L", kind: "interim", summary: "S", nextStep: "N", goal: null, takenAt: "2026-11-01T10:00:00+00:00" },
    ]);
  });

  it("answers null for anything but the two lists, so a failed read is not an empty notebook", () => {
    for (const raw of [null, undefined, "x", [], {}, { entries: [] }, { entries: [], summaries: {} }]) {
      expect(parseNotebook(raw)).toBeNull();
    }
    expect(parseNotebook({ entries: [], summaries: [] })).toEqual({ entries: [], summaries: [] });
  });

  it("drops and reports a row that is not its kind's shape, and keeps the others", () => {
    const bad = [
      null,
      "x",
      { ...saidRow, exact: "yes" },
      { ...saidRow, phrase_key: null },
      { ...saidRow, submission_id: null },
      { ...fixRow, correction: null },
      { ...ownRow, phrase: null },
      { ...saidRow, kind: "other" },
      { ...saidRow, created_at: "never" },
    ];
    const badSummaries = [{ ...summaryRow, kind: "other" }, { ...summaryRow, summary: null }, { ...summaryRow, taken_at: null }];
    const dropped: unknown[] = [];
    const n = parseNotebook(
      { entries: [...bad, saidRow], summaries: [...badSummaries, summaryRow] },
      (r) => dropped.push(r),
    );
    expect(n?.entries.map((e) => e.id)).toEqual(["e1"]);
    expect(n?.summaries).toHaveLength(1);
    expect(dropped).toEqual([...bad, ...badSummaries]);
  });
});
