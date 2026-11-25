import { describe, expect, it } from "vitest";
import { fix, own, said, summary, take } from "./fixtures";
import { keptUntil, plusSixMonths } from "./keptUntil";
import { recordingRows } from "./recordings";

describe("plusSixMonths", () => {
  // Printed by Postgres on the local stack (timezone UTC), docs/decisions/0239.
  it.each([
    ["2026-11-25T10:00:00Z", "2027-05-25T10:00:00.000Z"],
    ["2026-08-31T10:00:00Z", "2027-02-28T10:00:00.000Z"],
    ["2027-08-30T23:59:59.5Z", "2028-02-29T23:59:59.500Z"],
    ["2026-12-31T00:00:00Z", "2027-06-30T00:00:00.000Z"],
  ])("%s → %s", (from, to) => expect(plusSixMonths(from)).toBe(to));

  it("is null for an unreadable date", () => expect(plusSixMonths("x")).toBeNull());
});

describe("keptUntil", () => {
  it("self-paced: from submitted_at, whatever the run says", () => {
    expect(keptUntil(take({ submittedAt: "2026-11-01T10:00:00Z", runEndsAt: "2027-01-01T00:00:00Z" }))).toBe(
      "2027-05-01T10:00:00.000Z",
    );
  });
  it("cohort: from the run's end, not from submitted_at", () => {
    const cohort = take({ enrolmentId: "n1", submittedAt: "2026-11-01T10:00:00Z", runEndsAt: "2026-12-01T00:00:00Z" });
    expect(keptUntil(cohort)).toBe("2027-06-01T00:00:00.000Z");
  });
  it("cohort with an unreadable run: no date", () => {
    expect(keptUntil(take({ enrolmentId: "n1", runEndsAt: null }))).toBeNull();
  });
});

describe("recordingRows", () => {
  it("kept audio has a date; newest first; the kind comes from the copied summary", () => {
    const rows = recordingRows(
      [take({ id: "t1" }), take({ id: "t2", submittedAt: "2026-11-02T10:00:00Z" })],
      [],
      [summary({ submissionId: "t2", kind: "final" })],
    );
    expect(rows.map((r) => [r.take.id, r.kind, r.hasNotes, r.audio])).toEqual([
      ["t2", "final", true, { state: "kept", until: "2027-05-02T10:00:00.000Z" }],
      ["t1", null, false, { state: "kept", until: "2027-05-01T10:00:00.000Z" }],
    ]);
  });

  it("deleted audio: notes kept only when something copied from that take is left", () => {
    const gone = [take({ id: "t1", objectName: null })];
    const state = (entries: Parameters<typeof recordingRows>[1], summaries: Parameters<typeof recordingRows>[2]) => {
      const [r] = recordingRows(gone, entries, summaries);
      return [r.audio.state, r.hasNotes];
    };
    expect(state([said("a")], [])).toEqual(["deleted", true]);
    expect(state([fix()], [])).toEqual(["deleted", true]);
    expect(state([], [summary()])).toEqual(["deleted", true]);
    expect(state([own("a"), said("b", { submissionId: "t2" })], [])).toEqual(["deleted", false]);
  });
});
