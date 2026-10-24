import { describe, expect, it } from "vitest";
import { PLAN } from "./__fixtures__/lesson";
import { nextStep, RECLAIM_AFTER_MS, shouldReclaim, shouldRepair } from "./steps";

describe("nextStep", () => {
  it("pending reads the file", () => {
    expect(nextStep({ status: "pending", plan: null, lessonsDone: 0 })).toEqual({ kind: "prepare" });
  });

  it("planning with no plan makes the plan", () => {
    expect(nextStep({ status: "planning", plan: null, lessonsDone: 0 })).toEqual({ kind: "plan" });
  });

  it("with a plan, drafts the lesson after the last stored one", () => {
    expect(nextStep({ status: "drafting", plan: PLAN, lessonsDone: 0 })).toEqual({ kind: "draft", index: 0 });
    expect(nextStep({ status: "drafting", plan: PLAN, lessonsDone: 1 })).toEqual({ kind: "draft", index: 1 });
  });

  it("a planning row that already has its plan drafts too (a run died between two writes)", () => {
    expect(nextStep({ status: "planning", plan: PLAN, lessonsDone: 0 })).toEqual({ kind: "draft", index: 0 });
  });

  it("commits when every planned lesson is stored, and at committing", () => {
    expect(nextStep({ status: "drafting", plan: PLAN, lessonsDone: 2 })).toEqual({ kind: "commit" });
    expect(nextStep({ status: "committing", plan: PLAN, lessonsDone: 2 })).toEqual({ kind: "commit" });
  });

  it("a drafting row with no plan is broken, and a terminal row has nothing to do", () => {
    expect(nextStep({ status: "drafting", plan: null, lessonsDone: 0 })).toEqual({ kind: "none" });
    expect(nextStep({ status: "done", plan: PLAN, lessonsDone: 2 })).toEqual({ kind: "none" });
    expect(nextStep({ status: "failed", plan: null, lessonsDone: 0 })).toEqual({ kind: "none" });
  });
});

describe("shouldRepair", () => {
  it("allows exactly one repair", () => {
    expect(shouldRepair(0)).toBe(true);
    expect(shouldRepair(1)).toBe(false);
    expect(shouldRepair(2)).toBe(false);
  });
});

describe("shouldReclaim", () => {
  const now = Date.parse("2026-10-24T12:00:00Z");
  const old = new Date(now - RECLAIM_AFTER_MS).toISOString();
  const recent = new Date(now - RECLAIM_AFTER_MS + 1).toISOString();

  it("offers a stalled running row, at the threshold", () => {
    for (const s of ["pending", "planning", "drafting", "committing"]) expect(shouldReclaim(s, old, now)).toBe(true);
  });

  it("leaves a row that moved a moment ago", () => {
    expect(shouldReclaim("drafting", recent, now)).toBe(false);
  });

  it("never offers a finished row, however old", () => {
    expect(shouldReclaim("done", old, now)).toBe(false);
    expect(shouldReclaim("failed", old, now)).toBe(false);
  });

  it("offers a row whose time cannot be read", () => {
    expect(shouldReclaim("drafting", "garbage", now)).toBe(true);
  });
});
