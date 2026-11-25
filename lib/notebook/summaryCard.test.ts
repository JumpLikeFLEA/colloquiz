import { describe, expect, it } from "vitest";
import { summary } from "./fixtures";
import { summaryCard } from "./summaryCard";

describe("summaryCard", () => {
  it("a first take shows its goal, never a next step", () => {
    expect(summaryCard([summary({ kind: "first", goal: "G", nextStep: "stray" })])?.follow).toEqual({ kind: "goal", text: "G" });
  });
  it.each(["final", "interim"] as const)("a %s take shows its next step, never a goal", (kind) => {
    expect(summaryCard([summary({ kind, goal: "stray", nextStep: "N" })])?.follow).toEqual({ kind: "next_step", text: "N" });
  });
  it("a take with neither keeps its summary", () => {
    for (const s of [summary(), summary({ goal: "  " }), summary({ kind: "final", nextStep: "" })]) {
      expect(summaryCard([s])).toMatchObject({ text: "You told a clear story.", follow: { kind: "none" } });
    }
  });
  it("takes the newest, and skips one with no text at all", () => {
    const old = summary({ submissionId: "old", takenAt: "2026-10-01T10:00:00Z" });
    const recent = summary({ submissionId: "new", takenAt: "2026-11-20T10:00:00Z" });
    const blank = summary({ submissionId: "blank", summary: "", takenAt: "2026-11-25T10:00:00Z" });
    expect(summaryCard([old, blank, recent])?.summary.submissionId).toBe("new");
    expect(summaryCard([{ ...blank, goal: "G" }, recent])).toMatchObject({ text: null, follow: { text: "G" } });
  });
  it("is null with none", () => {
    expect(summaryCard([])).toBeNull();
    expect(summaryCard([summary({ summary: " " })])).toBeNull();
  });
});
