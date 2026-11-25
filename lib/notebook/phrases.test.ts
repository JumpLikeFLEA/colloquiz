import { describe, expect, it } from "vitest";
import { fixRows } from "./fixes";
import { fix, own, said } from "./fixtures";
import { phraseRows } from "./phrases";

const day = (d: number) => `2026-11-${String(d).padStart(2, "0")}T10:00:00+00:00`;

describe("phraseRows", () => {
  it("lists said phrases and own notes together, newest first, told apart by kind; fixes are not here", () => {
    const rows = phraseRows([
      said("a", { createdAt: day(1) }),
      own("b", { createdAt: day(3) }),
      fix({ createdAt: day(4) }),
      said("c", { createdAt: day(2) }),
    ]);
    expect(rows.map((r) => [r.kind, r.phrase])).toEqual([["own", "b"], ["said", "c"], ["said", "a"]]);
  });

  it("merges a phrase said in two takes of one course, with the newest quote and its closeness", () => {
    const older = said("I don’t mind", { submissionId: "t1", createdAt: day(1), exact: true, quote: "old" });
    const newer = said("I don't mind", { submissionId: "t2", createdAt: day(2), exact: false, quote: "new" });
    for (const entries of [[older, newer], [newer, older]]) {
      const rows = phraseRows(entries);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: newer.id, quote: "new", close: true, takes: 2 });
    }
  });

  it("close is exact: false, and only that", () => {
    const rows = phraseRows([said("a", { exact: true }), said("b", { exact: false })]);
    expect(rows.map((r) => r.kind === "said" && r.close)).toEqual([false, true]);
  });

  it("does not merge across courses, and counts takes rather than rows", () => {
    const rows = phraseRows([said("a"), said("A"), said("a", { courseId: "c2" })]);
    expect(rows.map((r) => [r.courseId, r.kind === "said" && r.takes])).toEqual([["c1", 1], ["c2", 1]]);
  });

  it("never merges own notes: a repeated phrase is two rows", () => {
    expect(phraseRows([own("a"), own("a"), said("a")])).toHaveLength(3);
  });
});

describe("fixRows", () => {
  it("lists every fix, newest first, and nothing else", () => {
    const rows = fixRows([fix({ createdAt: day(1) }), said("a"), own("b"), fix({ createdAt: day(2) })]);
    expect(rows.map((r) => r.createdAt)).toEqual([day(2), day(1)]);
  });
});
