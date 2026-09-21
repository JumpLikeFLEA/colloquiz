import { describe, it, expect } from "vitest";
import { ItemResponseError } from "./errors";
import { selectionGridModule } from "./selectionGrid";
import type { SelectionGridItem } from "./types";

/**
 * ITEM-004. Each row is scored independently — right or wrong, `possible: 1`
 * per row, `possible: rows.length` for the item — unlike `selection`
 * (docs/decisions/0008), which has no response-shaped denominator to worry
 * about here: a grid row has no "over-selection" case.
 *
 * Fixtures are built THROUGH `parse`, never hand-constructed, so every score
 * case also asserts the payload it uses is one `parse` accepts.
 */

/** Merges in a default `fallbackExplanation` (ITEM-009) so fixtures that
 * predate explanation coverage don't each need updating individually. */
function parsedItem(payload: unknown, id = "item-1"): SelectionGridItem {
  const result = selectionGridModule.parse({
    id,
    type: "selection_grid",
    payload: { explanations: {}, fallbackExplanation: "explanation", ...(payload as object) },
  });
  if (!result.ok) {
    throw new Error(`fixture did not parse: ${JSON.stringify(result.errors)}`);
  }
  return result.item;
}

const row = (id: string, correct: boolean) => ({
  id,
  statement: `statement ${id}`,
  correct,
  explanationRef: `exp-${id}`,
});

/** 10 rows: r1..r5 true, r6..r10 false. */
const tenRowGrid = () =>
  parsedItem({
    prompt: "True or false?",
    rows: [
      row("r1", true),
      row("r2", true),
      row("r3", true),
      row("r4", true),
      row("r5", true),
      row("r6", false),
      row("r7", false),
      row("r8", false),
      row("r9", false),
      row("r10", false),
    ],
  });

const answer = (rowId: string, value: boolean) => ({ rowId, answer: value });

describe("selection_grid — N statements, one choice each", () => {
  it("scores all correct: earned equals possible equals the row count", () => {
    const item = tenRowGrid();
    const response = [
      ...["r1", "r2", "r3", "r4", "r5"].map((id) => answer(id, true)),
      ...["r6", "r7", "r8", "r9", "r10"].map((id) => answer(id, false)),
    ];
    const result = selectionGridModule.score(item, response);
    expect(result.earned).toBe(10);
    expect(result.possible).toBe(10);
  });

  it("scores none correct: every row wrong scores 0 of 10", () => {
    const item = tenRowGrid();
    const response = [
      ...["r1", "r2", "r3", "r4", "r5"].map((id) => answer(id, false)),
      ...["r6", "r7", "r8", "r9", "r10"].map((id) => answer(id, true)),
    ];
    const result = selectionGridModule.score(item, response);
    expect(result.earned).toBe(0);
    expect(result.possible).toBe(10);
  });

  it("8 of 10 correct scores 0.8, not 0 — nothing demotivates the learner", () => {
    const item = tenRowGrid();
    const response = [
      ...["r1", "r2", "r3", "r4", "r5"].map((id) => answer(id, true)), // correct
      ...["r6", "r7", "r8"].map((id) => answer(id, false)), // correct
      answer("r9", true), // wrong
      answer("r10", true), // wrong
    ];
    const result = selectionGridModule.score(item, response);
    expect(result.earned).toBe(8);
    expect(result.possible).toBe(10);
    expect(result.earned / result.possible).toBe(0.8);
  });

  it("carries one subResult per row, each with its row identity, correctness and explanation ref", () => {
    const item = tenRowGrid();
    const result = selectionGridModule.score(item, [answer("r1", true), answer("r6", true)]);
    expect(result.subResults).toHaveLength(10);
    expect(result.subResults[0]).toEqual({ id: "r1", correct: true, earned: 1, possible: 1, explanationRef: "exp-r1" });
    expect(result.subResults[5]).toEqual({ id: "r6", correct: false, earned: 0, possible: 1, explanationRef: "exp-r6" });
    // Row identity survives even when other rows are dropped from the response.
    expect(result.subResults.map((r) => r.id)).toEqual(item.payload.rows.map((r) => r.id));
  });

  it("a row missing from the response is scored incorrect, not excluded or thrown", () => {
    const item = tenRowGrid();
    // Only r1 answered (correctly); the other 9 rows are untouched.
    const result = selectionGridModule.score(item, [answer("r1", true)]);
    expect(result.earned).toBe(1);
    expect(result.possible).toBe(10); // still 10 — the item is not scored as unattempted
    expect(result.subResults[1]).toEqual({ id: "r2", correct: false, earned: 0, possible: 1, explanationRef: "exp-r2" });
  });

  it("an unattempted grid (null, undefined, empty array) scores 0 of the row count", () => {
    const item = tenRowGrid();
    expect(selectionGridModule.score(item, null)).toMatchObject({ earned: 0, possible: 10 });
    expect(selectionGridModule.score(item, undefined)).toMatchObject({ earned: 0, possible: 10 });
    expect(selectionGridModule.score(item, [])).toMatchObject({ earned: 0, possible: 10 });
  });
});

describe("selection_grid — a client bug must not look like a wrong answer", () => {
  function scoreError(item: SelectionGridItem, response: unknown): ItemResponseError {
    try {
      selectionGridModule.score(item, response);
    } catch (error) {
      if (error instanceof ItemResponseError) return error;
      throw error;
    }
    throw new Error("expected score() to throw an ItemResponseError, but it returned a score");
  }

  it("throws on a row id the item does not have", () => {
    const error = scoreError(tenRowGrid(), [answer("zz", true)]);
    expect(error.code).toBe("unknown_id");
    expect(error.itemId).toBe("item-1");
    expect(error.itemType).toBe("selection_grid");
    expect(error.message).toContain("zz");
  });

  it("throws on a malformed response rather than scoring it zero", () => {
    expect(scoreError(tenRowGrid(), [{ rowId: "r1", answer: "true" }]).code).toBe("malformed");
    expect(scoreError(tenRowGrid(), { rowId: "r1", answer: true }).code).toBe("malformed");
    expect(scoreError(tenRowGrid(), "r1").code).toBe("malformed");
    expect(scoreError(tenRowGrid(), 42).code).toBe("malformed");
  });

  it("throws on the same row answered twice — an ambiguous response, not a de-dupe", () => {
    expect(scoreError(tenRowGrid(), [answer("r1", true), answer("r1", false)]).code).toBe("duplicate_id");
  });

  it("a thrown error is distinguishable from a real zero score", () => {
    const zero = selectionGridModule.score(tenRowGrid(), [answer("r1", false)]);
    expect(zero.earned).toBe(0); // a genuine wrong answer scores, it does not throw
    expect(scoreError(tenRowGrid(), [answer("nope", true)]).code).toBe("unknown_id");
  });
});

describe("selection_grid — parse rejects items that cannot be scored meaningfully", () => {
  const reject = (payload: unknown) => {
    const result = selectionGridModule.parse({ id: "item-x", type: "selection_grid", payload });
    if (result.ok) throw new Error("expected parse to reject this payload");
    return result.errors;
  };

  const base = {
    prompt: "True or false?",
    rows: [row("r1", true), row("r2", false)],
    explanations: {},
    fallbackExplanation: "explanation",
  };

  it("rejects zero rows — this is the exact shape that turns a score into NaN", () => {
    const errors = reject({ ...base, rows: [] });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe("payload.rows");
  });

  it("rejects duplicate row ids", () => {
    const errors = reject({ ...base, rows: [row("r1", true), { ...row("r1", false) }] });
    expect(errors.some((e) => e.message.includes("must be distinct"))).toBe(true);
  });

  it("rejects a row missing its explanationRef", () => {
    const badRow = { id: "r1", statement: "s", correct: true, explanationRef: "" };
    const errors = reject({ ...base, rows: [badRow] });
    expect(errors.some((e) => e.field.includes("explanationRef"))).toBe(true);
  });

  it("applies the shared authoredString guard to the prompt and each row statement", () => {
    expect(reject({ ...base, prompt: "two\nlines" })[0].field).toBe("payload.prompt");
    expect(
      reject({ ...base, rows: [row("r1", true), { ...row("r2", false), statement: "bad\ttab" }] })[0].field,
    ).toBe("payload.rows[1].statement");
  });

  it("rejects an unknown field rather than stripping it", () => {
    expect(reject({ ...base, shuffle: false })[0].field).toContain("payload");
  });

  it("rejects a non-selection_grid item and a missing envelope", () => {
    const wrongType = selectionGridModule.parse({ id: "i", type: "selection", payload: {} });
    expect(wrongType.ok).toBe(false);
    if (!wrongType.ok) expect(wrongType.errors[0].message).toContain('expected "selection_grid"');
    expect(selectionGridModule.parse(null).ok).toBe(false);
    expect(selectionGridModule.parse({ type: "selection_grid", payload: {} }).ok).toBe(false);
  });
});

describe("selection_grid — lesson totals stay well-formed", () => {
  it("earned/possible are always finite and possible matches the row count, across every response shape", () => {
    const item = tenRowGrid();
    const responses = [
      null,
      undefined,
      [],
      [answer("r1", true)],
      [answer("r1", true), answer("r2", true), answer("r3", false)],
    ];
    for (const response of responses) {
      const result = selectionGridModule.score(item, response);
      expect(Number.isFinite(result.earned)).toBe(true);
      expect(result.possible).toBe(10);
      expect(result.earned).toBe(result.subResults.reduce((n, s) => n + s.earned, 0));
      expect(result.possible).toBe(result.subResults.reduce((n, s) => n + s.possible, 0));
    }
  });
});
