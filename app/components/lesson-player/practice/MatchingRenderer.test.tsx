import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ItemScoreResult, MatchingItem } from "@/lib/items";
import { matchingModule } from "@/lib/items/matching";
import { MatchingRenderer } from "./MatchingRenderer";

/**
 * docs/decisions/0039 — RTL smoke test for the row-slots-and-bank rework.
 * Drives the tap flow (the pointer-free path every touch/mouse tap and the
 * keyboard path both reduce to — see matchingResponse.ts) through a rendered
 * component, rather than only the pure helpers matchingResponse.test.ts
 * already covers, so a wiring mistake between the two shows up here.
 */

function text(t: string) {
  return { kind: "text" as const, text: t };
}

function parsedMatching(): MatchingItem {
  const result = matchingModule.parse({
    id: "match-1",
    type: "matching",
    payload: {
      prompt: "Match the word to its definition.",
      left: [
        { id: "l1", content: text("cat") },
        { id: "l2", content: text("dog") },
      ],
      right: [
        { id: "r1", content: text("a small furry pet that says meow") },
        { id: "r2", content: text("a loyal pet that barks") },
      ],
      pairs: [
        { id: "p1", left: "l1", right: "r1", explanationRef: "e1" },
        { id: "p2", left: "l2", right: "r1", explanationRef: "e2" }, // many-to-one: both correctly pair to r1
      ],
      explanations: { e1: "cat -> meow", e2: "a second definition also pointing at r1" },
      fallbackExplanation: "see above",
    },
  });
  if (!result.ok) throw new Error(`fixture did not parse: ${JSON.stringify(result.errors)}`);
  return result.item;
}

afterEach(() => {
  cleanup();
});

describe("MatchingRenderer", () => {
  it("mounts with an empty slot per left row and the full bank visible", () => {
    render(<MatchingRenderer item={parsedMatching()} attemptId="attempt-1" onScore={() => {}} />);

    expect(screen.getByText("cat")).toBeDefined();
    expect(screen.getByText("dog")).toBeDefined();
    expect(screen.getAllByLabelText("Empty answer slot — tap to select")).toHaveLength(2);
    expect(screen.getByText("a small furry pet that says meow")).toBeDefined();
    expect(screen.getByText("a loyal pet that barks")).toBeDefined();
  });

  it("tap a slot then a chip fills that slot", () => {
    render(<MatchingRenderer item={parsedMatching()} attemptId="attempt-1" onScore={() => {}} />);

    const emptySlots = screen.getAllByLabelText("Empty answer slot — tap to select");
    fireEvent.click(emptySlots[0]); // select cat's slot
    fireEvent.click(screen.getByText("a small furry pet that says meow")); // fill it

    // The bank chip's text now also renders inline in the filled row, so two
    // matches exist: the bank chip and the placed copy.
    expect(screen.getAllByText("a small furry pet that says meow")).toHaveLength(2);
    expect(screen.getAllByLabelText("Empty answer slot — tap to select")).toHaveLength(1);
  });

  it("a bank chip is placeable twice (many-to-one, 0013) and shows a used-count badge", () => {
    render(<MatchingRenderer item={parsedMatching()} attemptId="attempt-1" onScore={() => {}} />);

    const emptySlots = screen.getAllByLabelText("Empty answer slot — tap to select");
    fireEvent.click(emptySlots[0]);
    fireEvent.click(screen.getByText("a small furry pet that says meow"));

    // No slot selected now -- tapping the same chip again fills the next
    // empty slot (dog's), per "tap a chip with no slot selected fills the
    // first empty slot". The bank chip is now the LAST match for this text
    // (rows render first, the bank last), since the chip is now also placed
    // inline in cat's row.
    fireEvent.click(screen.getByLabelText("Empty answer slot — tap to select"));
    const matches = screen.getAllByText("a small furry pet that says meow");
    fireEvent.click(matches[matches.length - 1]);

    expect(screen.queryByLabelText("Empty answer slot — tap to select")).toBeNull();
    expect(screen.getByLabelText("used 2 times")).toBeDefined();
  });

  it("submit reaches scoreItem with the expected response", () => {
    const onScore = vi.fn<(result: ItemScoreResult) => void>();
    render(<MatchingRenderer item={parsedMatching()} attemptId="attempt-1" onScore={onScore} />);

    fireEvent.click(screen.getAllByLabelText("Empty answer slot — tap to select")[0]);
    fireEvent.click(screen.getByText("a small furry pet that says meow")); // cat -> r1, correct
    fireEvent.click(screen.getByLabelText("Empty answer slot — tap to select"));
    fireEvent.click(screen.getByText("a loyal pet that barks")); // dog -> r2, incorrect (authored: r1)

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onScore).toHaveBeenCalledTimes(1);
    const result = onScore.mock.calls[0][0];
    expect(result.earned).toBe(1);
    expect(result.possible).toBe(2);
    expect(result.subResults.map((r) => [r.id, r.correct])).toEqual([
      ["p1", true],
      ["p2", false],
    ]);
  });
});
