import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { parseItem } from "@/lib/items";
import type {
  MatchingItem,
  OrderingItem,
  SelectionGridItem,
  SelectionItem,
  SlotsItem,
} from "@/lib/items";
import { mapParseErrorsToFieldErrors } from "@/lib/lessonEditorErrors";
import { PLAYGROUND_EXAMPLES } from "@/lib/items/__fixtures__/playgroundExamples";
import { PracticeItemForm } from "./PracticeItemForm";

// AUTH-003 acceptance: "Every 0008-0017 parse rejection is reachable from the
// form and shown in place. There is one test per item type that submits an
// invalid form and asserts the rendered error." Each test below takes a
// PLAYGROUND_EXAMPLES base (a real, valid item), mutates it into one specific
// documented rejection from 0008-0017, runs it through the REAL `parseItem`
// (the same function CNT-003/the save route calls), maps the result the same
// way the editor does (lib/lessonEditorErrors.ts), and renders the form with
// that item + those errors — proving the message a real invalid submission
// would produce actually appears next to the field it names.

// Not exercised by these tests (no image field is invalid in any fixture
// here) — AUTH-004's own tests cover the upload path.
const noopUploadImage = () => Promise.resolve({ error: "not used in this test" });

function exampleFor(prefix: string): unknown {
  const found = PLAYGROUND_EXAMPLES.find((e) => e.label.startsWith(prefix));
  if (!found) throw new Error(`no playground example starting with "${prefix}"`);
  return found.raw;
}

function fieldErrorsFor(raw: unknown) {
  const result = parseItem(raw);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected parseItem to reject");
  const withBlockId = result.errors.map((e) => ({ field: e.field ? `blk: ${e.field}` : "blk", message: e.message }));
  return mapParseErrorsToFieldErrors(withBlockId).get("blk");
}

afterEach(() => {
  cleanup();
});

describe("PracticeItemForm — parse rejections are reachable and shown in place", () => {
  it("selection: 'every option correct' (docs/decisions/0008)", () => {
    const base = exampleFor("selection —") as SelectionItem;
    const invalid: SelectionItem = {
      ...base,
      payload: { ...base.payload, multi: true, correctOptionIds: base.payload.options.map((o) => o.id) },
    };

    const errors = fieldErrorsFor(invalid);
    render(<PracticeItemForm item={invalid} onChange={() => {}} errors={errors} onUploadImage={noopUploadImage} />);

    expect(
      screen.getByText("at least one option must be incorrect — an item with no wrong answer measures nothing"),
    ).toBeDefined();
  });

  it("selection_grid: duplicate row ids (docs/decisions/0010)", () => {
    const base = exampleFor("selection_grid —") as SelectionGridItem;
    const invalid: SelectionGridItem = {
      ...base,
      payload: {
        ...base.payload,
        rows: base.payload.rows.map((row, i) => (i === 1 ? { ...row, id: base.payload.rows[0].id } : row)),
      },
    };

    const errors = fieldErrorsFor(invalid);
    render(<PracticeItemForm item={invalid} onChange={() => {}} errors={errors} onUploadImage={noopUploadImage} />);

    expect(
      screen.getByText("row ids must be distinct — a response id must identify exactly one row"),
    ).toBeDefined();
  });

  it("ordering: duplicate element ids (docs/decisions/0011)", () => {
    const base = exampleFor("ordering —") as OrderingItem;
    const invalid: OrderingItem = {
      ...base,
      payload: {
        ...base.payload,
        elements: base.payload.elements.map((el, i) => (i === 1 ? { ...el, id: base.payload.elements[0].id } : el)),
      },
    };

    const errors = fieldErrorsFor(invalid);
    render(<PracticeItemForm item={invalid} onChange={() => {}} errors={errors} onUploadImage={noopUploadImage} />);

    expect(
      screen.getByText("element ids must be distinct — a response id must identify exactly one element"),
    ).toBeDefined();
  });

  it("matching: a left element paired more than once (docs/decisions/0013)", () => {
    const base = exampleFor("matching —") as MatchingItem;
    const invalid: MatchingItem = {
      ...base,
      payload: {
        ...base.payload,
        pairs: base.payload.pairs.map((pair, i) => (i === 1 ? { ...pair, left: base.payload.pairs[0].left } : pair)),
      },
    };

    const errors = fieldErrorsFor(invalid);
    render(<PracticeItemForm item={invalid} onChange={() => {}} errors={errors} onUploadImage={noopUploadImage} />);

    expect(screen.getByText("each left element may be the subject of at most one pair")).toBeDefined();
  });

  it("slots: explanationRef with no explanation and no fallback (docs/decisions/0017)", () => {
    const base = exampleFor("slots —") as SlotsItem;
    const invalid: SlotsItem = {
      ...base,
      payload: { ...base.payload, gaps: [base.payload.gaps[0]], explanations: {}, fallbackExplanation: undefined },
    };

    const errors = fieldErrorsFor(invalid);
    render(<PracticeItemForm item={invalid} onChange={() => {}} errors={errors} onUploadImage={noopUploadImage} />);

    expect(
      screen.getByText(
        `explanationRef(s) resolve to no explanation and no fallbackExplanation is set: ${invalid.payload.gaps[0].explanationRef}`,
      ),
    ).toBeDefined();
  });
});
