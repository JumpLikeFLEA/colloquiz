import { describe, expect, it, vi } from "vitest";
import {
  currentEnrolmentId,
  parseVoiceAnalysisMode,
  submissionsForEnrolment,
  voiceSendSlot,
  type SubmissionRow,
  type VoiceAnalysisMode,
} from "./taskContext";

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

describe("parseVoiceAnalysisMode", () => {
  it("reads on and paused, case and space insensitive", () => {
    expect(parseVoiceAnalysisMode("on")).toBe("on");
    expect(parseVoiceAnalysisMode(" Paused ")).toBe("paused");
    expect(parseVoiceAnalysisMode("OFF")).toBe("off");
  });

  it("fails closed: unset, empty and unknown values are off", () => {
    expect(parseVoiceAnalysisMode(undefined)).toBe("off");
    expect(parseVoiceAnalysisMode(null)).toBe("off");
    expect(parseVoiceAnalysisMode("")).toBe("off");
    expect(parseVoiceAnalysisMode("enabled")).toBe("off");
    expect(parseVoiceAnalysisMode("true")).toBe("off");
  });
});

describe("voiceSendSlot", () => {
  const modes: VoiceAnalysisMode[] = ["off", "paused", "on"];
  const base = { signedIn: true, lessonOpen: true, enrolmentId: null as string | null };

  it("keeps an anonymous visitor on practice in every mode", () => {
    for (const analysisMode of modes) {
      expect(voiceSendSlot({ ...base, signedIn: false, analysisMode })).toBeNull();
      expect(voiceSendSlot({ ...base, signedIn: false, enrolmentId: "e1", analysisMode })).toBeNull();
    }
  });

  it("gives a signed-in learner on an open lesson a self-paced slot unless the mode is off", () => {
    expect(voiceSendSlot({ ...base, analysisMode: "on" })).toBe("self_paced");
    expect(voiceSendSlot({ ...base, analysisMode: "paused" })).toBe("self_paced");
    expect(voiceSendSlot({ ...base, analysisMode: "off" })).toBeNull();
  });

  it("gives a lesson that is not open no self-paced slot", () => {
    for (const analysisMode of modes) {
      expect(voiceSendSlot({ ...base, lessonOpen: false, analysisMode })).toBeNull();
    }
  });

  it("leaves an enrolled learner on the enrolment's slot in every mode, as before 094", () => {
    for (const analysisMode of modes) {
      expect(voiceSendSlot({ ...base, enrolmentId: "e1", analysisMode })).toBe("enrolment");
    }
  });
});

describe("submissionsForEnrolment with the self-paced slot (null)", () => {
  const rows: SubmissionRow[] = [
    { id: "s-self", enrolmentId: null, blockId: "v1", objectName: "x/y/s-self.webm", feedbackBody: null },
    { id: "s-enrol", enrolmentId: "e1", blockId: "v1", objectName: "x/y/s-enrol.webm", feedbackBody: feedback },
    { id: "s-self-gone", enrolmentId: null, blockId: "v2", objectName: null, feedbackBody: null },
  ];

  it("returns only the takes made outside an enrolment", () => {
    const m = submissionsForEnrolment(rows, null);
    expect([...m.keys()].sort()).toEqual(["v1", "v2"]);
    expect(m.get("v1")).toMatchObject({ id: "s-self", feedback: null, removed: false });
    expect(m.get("v2")).toMatchObject({ removed: true });
  });

  it("does not mix an enrolment's take into the self-paced slot, nor the reverse", () => {
    expect(submissionsForEnrolment(rows, "e1").get("v1")).toMatchObject({ id: "s-enrol", feedback });
    expect(submissionsForEnrolment(rows, "e1").has("v2")).toBe(false);
  });
});
