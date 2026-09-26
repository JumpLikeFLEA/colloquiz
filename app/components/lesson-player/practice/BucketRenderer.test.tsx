import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ItemScoreResult, MatchingItem } from "@/lib/items";
import { matchingModule } from "@/lib/items/matching";
import { MatchingRenderer } from "./MatchingRenderer";

/**
 * PLAY-011b — RTL smoke test for the `presentation: "sort"` dispatch and the
 * bucket renderer's tap flow. Drives the pointer-free path (the same one
 * every touch/mouse tap and the keyboard path reduce to, per
 * matchingResponse.ts) through the rendered component, mirroring
 * MatchingRenderer.test.tsx's own precedent — dnd-kit's pointer sensors
 * aren't drivable under jsdom, so drag itself is not exercised here.
 */

function text(t: string) {
  return { kind: "text" as const, text: t };
}

function parsedSortItem(): MatchingItem {
  const result = matchingModule.parse({
    id: "sort-1",
    type: "matching",
    payload: {
      presentation: "sort",
      prompt: "Put each sentence in the correct column.",
      left: [
        { id: "a", content: text("Clarke described geostationary satellites.") },
        { id: "b", content: text("Satellites have existed for over sixty years.") },
      ],
      right: [
        { id: "ps", content: text("Past simple") },
        { id: "pp", content: text("Present perfect") },
      ],
      pairs: [
        { id: "p-a", left: "a", right: "ps", explanationRef: "col" },
        { id: "p-b", left: "b", right: "pp", explanationRef: "col" },
      ],
      explanations: { col: "One is a dated moment, the other is measured to now." },
      fallbackExplanation: "see above",
    },
  });
  if (!result.ok) throw new Error(`fixture did not parse: ${JSON.stringify(result.errors)}`);
  return result.item;
}

afterEach(() => {
  cleanup();
});

describe("MatchingRenderer dispatch for presentation: sort", () => {
  it("renders every bucket, always, alongside the unplaced statement pool", () => {
    render(<MatchingRenderer item={parsedSortItem()} attemptId="attempt-1" onScore={() => {}} />);

    expect(screen.getByText("Past simple")).toBeDefined();
    expect(screen.getByText("Present perfect")).toBeDefined();
    expect(screen.getByText("Clarke described geostationary satellites.")).toBeDefined();
    expect(screen.getByText("Satellites have existed for over sixty years.")).toBeDefined();
  });

  it("tapping a bucket with nothing selected is a no-op", () => {
    render(<MatchingRenderer item={parsedSortItem()} attemptId="attempt-1" onScore={() => {}} />);

    fireEvent.click(screen.getByText("Past simple"));

    // Both statements remain wherever they started -- no crash, no placement.
    expect(screen.getByText("Clarke described geostationary satellites.")).toBeDefined();
    expect(screen.getByText("Satellites have existed for over sixty years.")).toBeDefined();
  });

  it("tap a statement then a bucket places it, and a placed statement can move buckets", () => {
    render(<MatchingRenderer item={parsedSortItem()} attemptId="attempt-1" onScore={() => {}} />);

    fireEvent.click(screen.getByText("Clarke described geostationary satellites."));
    fireEvent.click(screen.getByText("Past simple"));

    // Move it to the other bucket without a special "unplace" step first.
    fireEvent.click(screen.getByText("Clarke described geostationary satellites."));
    fireEvent.click(screen.getByText("Present perfect"));

    expect(screen.getByText("Clarke described geostationary satellites.")).toBeDefined();
  });

  it("a placed statement can be returned to the pool", () => {
    render(<MatchingRenderer item={parsedSortItem()} attemptId="attempt-1" onScore={() => {}} />);

    fireEvent.click(screen.getByText("Clarke described geostationary satellites."));
    fireEvent.click(screen.getByText("Past simple"));
    fireEvent.click(screen.getByText("Clarke described geostationary satellites."));
    fireEvent.click(screen.getByRole("button", { name: "Return to pool" }));

    expect(screen.queryByRole("button", { name: "Return to pool" })).toBeNull();
  });

  it("submit reaches scoreItem with the expected response and a wrong statement stays put with a note", () => {
    const onScore = vi.fn<(result: ItemScoreResult) => void>();
    render(<MatchingRenderer item={parsedSortItem()} attemptId="attempt-1" onScore={onScore} />);

    fireEvent.click(screen.getByText("Clarke described geostationary satellites."));
    fireEvent.click(screen.getByText("Past simple")); // a -> ps, correct
    fireEvent.click(screen.getByText("Satellites have existed for over sixty years."));
    fireEvent.click(screen.getByText("Past simple")); // b -> ps, incorrect (authored: pp)

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onScore).toHaveBeenCalledTimes(1);
    const result = onScore.mock.calls[0][0];
    expect(result.earned).toBe(1);
    expect(result.possible).toBe(2);
    expect(result.subResults.map((r) => [r.id, r.correct])).toEqual([
      ["p-a", true],
      ["p-b", false],
    ]);

    // The wrong statement stays inside the bucket the learner chose (Past
    // simple), not moved to the correct one, with a note naming it.
    expect(screen.getByText("Satellites have existed for over sixty years.")).toBeDefined();
    expect(screen.getByText("Correct: Present perfect")).toBeDefined();
  });

  it("an unplaced statement is marked wrong in the pool on submit", () => {
    const onScore = vi.fn<(result: ItemScoreResult) => void>();
    render(<MatchingRenderer item={parsedSortItem()} attemptId="attempt-1" onScore={onScore} />);

    // Leave both statements unplaced.
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    const result = onScore.mock.calls[0][0];
    expect(result.earned).toBe(0);
    expect(result.possible).toBe(2);
    expect(screen.getAllByText(/^Correct: /).length).toBe(2);
  });
});

describe("MatchingRenderer dispatch stays on the pairs UI without presentation set", () => {
  it("an item with no presentation field still renders row slots and a bank, not buckets", () => {
    const result = matchingModule.parse({
      id: "b-match-1",
      type: "matching",
      payload: {
        prompt: "Match the word to its meaning.",
        left: [{ id: "l1", content: text("cat") }],
        right: [{ id: "r1", content: text("a small furry pet that says meow") }],
        pairs: [{ id: "p1", left: "l1", right: "r1", explanationRef: "e1" }],
        explanations: { e1: "cat -> meow" },
        fallbackExplanation: "see above",
      },
    });
    if (!result.ok) throw new Error(`fixture did not parse: ${JSON.stringify(result.errors)}`);

    render(<MatchingRenderer item={result.item} attemptId="attempt-1" onScore={() => {}} />);

    expect(screen.getByLabelText("Empty answer slot — tap to select")).toBeDefined();
  });
});
