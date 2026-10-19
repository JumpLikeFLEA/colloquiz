import { describe, expect, it } from "vitest";
import { OPENS_STORAGE_KEY, parseOpens, recordAnonOpen, withOpen } from "./anonOpens";
import { anonAttemptSummary, anonLastOpenedSlug, anonStoreSnapshot, parseAnonSnapshot } from "./anonProgress";
import { ATTEMPT_STORAGE_KEY, type StoredAttempt } from "./attemptStore";

function attempt(version: string, block: string, earned: number, possible = 1): StoredAttempt {
  return {
    attemptId: `${version}-${block}-${earned}`,
    lessonVersionId: version,
    blockId: block,
    earned,
    possible,
    recordedAt: "2026-10-19T00:00:00.000Z",
  };
}

const lessons = [
  { slug: "a", versionId: "va", itemCount: 2 },
  { slug: "b", versionId: "vb", itemCount: 0 },
  { slug: "c", versionId: "vc", itemCount: 3 },
];

describe("anonAttemptSummary", () => {
  it("is empty for a fresh browser", () => {
    expect(anonAttemptSummary(lessons, [], [])).toEqual({});
  });

  it("completes a lesson when every exercise has an attempt, scoring the best per block", () => {
    const attempts = [attempt("va", "x", 0), attempt("va", "x", 1), attempt("va", "y", 0)];
    expect(anonAttemptSummary(lessons, attempts, []).a).toEqual({
      bestPercent: 50,
      complete: true,
      exercisesAnswered: 2,
      exercisesTotal: 2,
    });
  });

  it("reports a partly answered lesson with no score", () => {
    expect(anonAttemptSummary(lessons, [attempt("vc", "x", 1)], []).c).toEqual({
      bestPercent: null,
      complete: false,
      exercisesAnswered: 1,
      exercisesTotal: 3,
    });
  });

  it("counts a theory-only lesson only once it was opened here", () => {
    expect(anonAttemptSummary(lessons, [], []).b).toBeUndefined();
    expect(anonAttemptSummary(lessons, [], ["vb"]).b).toEqual({
      bestPercent: null,
      complete: true,
      exercisesAnswered: 0,
      exercisesTotal: 0,
    });
  });

  it("ignores attempts on another version of the lesson", () => {
    expect(anonAttemptSummary(lessons, [attempt("old", "x", 1), attempt("old", "y", 1)], []).a).toBeUndefined();
  });
});

describe("anonLastOpenedSlug", () => {
  it("finds the most recently opened lesson of this course", () => {
    expect(anonLastOpenedSlug(lessons, ["va", "other", "vc", "foreign"])).toBe("c");
  });
  it("is null when none of the course was opened", () => {
    expect(anonLastOpenedSlug(lessons, ["foreign"])).toBeNull();
    expect(anonLastOpenedSlug(lessons, [])).toBeNull();
  });
});

describe("opens store", () => {
  it("moves a reopened version to the end and caps the list", () => {
    expect(withOpen(["a", "b", "c"], "a")).toEqual(["b", "c", "a"]);
    const many = Array.from({ length: 250 }, (_, i) => `v${i}`);
    const capped = withOpen(many, "new");
    expect(capped).toHaveLength(200);
    expect(capped[capped.length - 1]).toBe("new");
  });

  it("round-trips through a backend and survives garbage", () => {
    const mem = new Map<string, string>();
    const backend = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    recordAnonOpen("v1", backend);
    recordAnonOpen("v2", backend);
    expect(parseOpens(mem.get(OPENS_STORAGE_KEY) ?? null)).toEqual(["v1", "v2"]);
    expect(parseOpens("not json")).toEqual([]);
    expect(parseOpens(JSON.stringify({ version: 9, opens: ["x"] }))).toEqual([]);
    expect(parseOpens(null)).toEqual([]);
  });

  it("never throws when storage does", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(() => recordAnonOpen("v1", throwing)).not.toThrow();
    expect(() => recordAnonOpen("v1", null)).not.toThrow();
  });
});

describe("snapshot", () => {
  it("joins and splits both stores", () => {
    const stored = {
      [ATTEMPT_STORAGE_KEY]: JSON.stringify({ version: 1, attempts: [attempt("va", "x", 1)] }),
      [OPENS_STORAGE_KEY]: JSON.stringify({ version: 1, opens: ["vb"] }),
    } as Record<string, string>;
    const snap = anonStoreSnapshot((k) => stored[k] ?? null);
    const parsed = parseAnonSnapshot(snap);
    expect(parsed.attempts).toHaveLength(1);
    expect(parsed.opens).toEqual(["vb"]);
  });

  it("is empty for empty stores", () => {
    expect(parseAnonSnapshot(anonStoreSnapshot(() => null))).toEqual({ attempts: [], opens: [] });
  });
});
