import { describe, expect, it, vi } from "vitest";
import { currentEnrolmentId, submissionsForEnrolment, type SubmissionRow } from "./taskContext";

describe("currentEnrolmentId", () => {
  it("picks the latest-starting run, then the latest enrolment (060's order)", () => {
    expect(
      currentEnrolmentId([
        { id: "run1", enrolledAt: "2026-09-01T00:00:00Z", runStartsAt: "2026-09-07T00:00:00Z" },
        { id: "run2", enrolledAt: "2026-09-02T00:00:00Z", runStartsAt: "2026-10-05T00:00:00Z" },
      ]),
    ).toBe("run2");
    expect(
      currentEnrolmentId([
        { id: "a", enrolledAt: "2026-09-01T00:00:00Z", runStartsAt: "2026-10-05T00:00:00Z" },
        { id: "b", enrolledAt: "2026-09-03T00:00:00Z", runStartsAt: "2026-10-05T00:00:00Z" },
      ]),
    ).toBe("b");
  });

  it("is null with no enrolment", () => {
    expect(currentEnrolmentId([])).toBeNull();
  });
});

const feedback = { paragraphs: [{ runs: [{ text: "Good " }, { text: "pace", bold: true }] }] };

describe("submissionsForEnrolment", () => {
  const rows: SubmissionRow[] = [
    { id: "s-old", enrolmentId: "e1", blockId: "v1", objectName: "x/y/s-old.webm", feedbackBody: feedback },
    { id: "s-new", enrolmentId: "e2", blockId: "v1", objectName: "x/y/s-new.webm", feedbackBody: null },
    { id: "s-gone", enrolmentId: "e2", blockId: "v2", objectName: null, feedbackBody: feedback },
  ];

  it("keeps only the current enrolment's takes, so an earlier run's locked take doesn't block this one", () => {
    const m = submissionsForEnrolment(rows, "e2");
    expect([...m.keys()].sort()).toEqual(["v1", "v2"]);
    expect(m.get("v1")).toMatchObject({ id: "s-new", feedback: null, removed: false });
  });

  it("marks a purged take as removed and keeps its feedback", () => {
    expect(submissionsForEnrolment(rows, "e2").get("v2")).toMatchObject({ removed: true, feedback });
  });

  it("drops a feedback body that doesn't parse and reports it", () => {
    const report = vi.fn();
    const m = submissionsForEnrolment(
      [{ id: "s", enrolmentId: "e", blockId: "v", objectName: "o", feedbackBody: { html: "<b>x</b>" } }],
      "e",
      report,
    );
    expect(m.get("v")?.feedback).toBeNull();
    expect(report).toHaveBeenCalledWith("s");
  });

  it("is empty for an enrolment with no takes", () => {
    expect(submissionsForEnrolment(rows, "e9").size).toBe(0);
  });
});
