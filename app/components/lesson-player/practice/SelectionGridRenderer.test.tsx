import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { selectionGridModule } from "@/lib/items/selectionGrid";
import type { SelectionGridItem } from "@/lib/items";
import { SelectionGridRenderer } from "./SelectionGridRenderer";

afterEach(cleanup);

function gridItem(): SelectionGridItem {
  const r = selectionGridModule.parse({
    id: "grid-1",
    type: "selection_grid",
    payload: {
      prompt: "True or false?",
      rows: [
        { id: "a", statement: "Cats bark.", correct: false, explanationRef: "e" },
        { id: "b", statement: "Dogs bark.", correct: true, explanationRef: "e" },
      ],
      explanations: { e: "See above." },
      fallbackExplanation: "see above",
    },
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.item;
}

describe("SelectionGridRenderer — accessible names (PLAY-018)", () => {
  it("each True/False pair is a group named by its row's statement", () => {
    render(<SelectionGridRenderer item={gridItem()} onScore={() => {}} />);
    const dogs = screen.getByRole("group", { name: /Dogs bark\./ });
    const cats = screen.getByRole("group", { name: /Cats bark\./ });
    expect(dogs).not.toBe(cats);

    // The group, not the button, carries the statement: pressing True in the
    // "Dogs" group sets that row only.
    fireEvent.click(within(dogs).getByRole("button", { name: "True" }));
    expect(within(dogs).getByRole("button", { name: "True" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(cats).getByRole("button", { name: "True" }).getAttribute("aria-pressed")).toBe("false");
  });
});
