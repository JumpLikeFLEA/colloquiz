import { describe, expect, it } from "vitest";
import type { StoredAttempt } from "./attemptStore";
import { bestPercentForVersion, higherPercent } from "./previousBest";

function attempt(blockId: string, earned: number, possible: number, lessonVersionId = "v1"): StoredAttempt {
  return { attemptId: `${blockId}-${earned}`, lessonVersionId, blockId, earned, possible, recordedAt: "2026-10-07T00:00:00Z" };
}

describe("bestPercentForVersion", () => {
  it("sums each block's best attempt, like migration 050", () => {
    // b1 best 3/4, b2 best 2/2 -> 5/6 = 83%
    const attempts = [attempt("b1", 1, 4), attempt("b1", 3, 4), attempt("b2", 2, 2), attempt("b2", 0, 2)];
    expect(bestPercentForVersion(attempts, "v1")).toBe(83);
  });

  it("picks the best attempt by ratio, not by earned", () => {
    // 2/2 (100%) beats 3/6 (50%) for the same block
    expect(bestPercentForVersion([attempt("b1", 3, 6), attempt("b1", 2, 2)], "v1")).toBe(100);
  });

  it("ignores other lesson versions", () => {
    expect(bestPercentForVersion([attempt("b1", 1, 1, "v2"), attempt("b1", 0, 1)], "v1")).toBe(0);
  });

  it("returns null when nothing for the version is stored", () => {
    expect(bestPercentForVersion([], "v1")).toBeNull();
    expect(bestPercentForVersion([attempt("b1", 1, 1, "v2")], "v1")).toBeNull();
  });

  it("skips an attempt with nothing possible instead of dividing by zero", () => {
    expect(bestPercentForVersion([attempt("b1", 0, 0)], "v1")).toBeNull();
  });
});

describe("higherPercent", () => {
  it("returns the higher value, or whichever exists", () => {
    expect(higherPercent(40, 63)).toBe(63);
    expect(higherPercent(null, 63)).toBe(63);
    expect(higherPercent(40, null)).toBe(40);
    expect(higherPercent(null, null)).toBeNull();
    expect(higherPercent(0, null)).toBe(0);
  });
});
