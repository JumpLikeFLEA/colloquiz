import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { selectionGridModule } from "@/lib/items/selectionGrid";
import { slotsModule } from "@/lib/items/slots";
import type { SelectionGridItem, SlotsItem } from "@/lib/items";
import { SelectionGridRenderer } from "./SelectionGridRenderer";
import { SlotsRenderer } from "./SlotsRenderer";

/** PLAY-015: a wrong sub-part names the right answer. Each test also checks
 * the note is absent before Check and for a correct sub-part, so a pass
 * cannot come from an always-rendered note. */

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

function slotsItem(): SlotsItem {
  const r = slotsModule.parse({
    id: "slots-1",
    type: "slots",
    payload: {
      prompt: "I ___ home. She ___ home.",
      input: "typed",
      gaps: [
        { id: "g1", acceptedAnswers: ["go", "walk"], explanationRef: "e" },
        { id: "g2", acceptedAnswers: ["goes"], explanationRef: "e" },
      ],
      explanations: { e: "Verb form." },
      fallbackExplanation: "see above",
    },
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.item;
}

describe("PLAY-015 wrong-answer notes", () => {
  it("True/False: a wrong row states the correct choice; a right row does not", () => {
    render(<SelectionGridRenderer item={gridItem()} onScore={() => {}} />);
    expect(screen.queryByText(/Correct:/)).toBeNull();

    const [trueBtns, falseBtns] = [screen.getAllByText("True"), screen.getAllByText("False")];
    fireEvent.click(trueBtns[0]); // row a is false: wrong
    fireEvent.click(trueBtns[1]); // row b is true: right
    expect(falseBtns).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    const notes = screen.getAllByText(/^Correct:/);
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toBe("Correct: False");
  });

  it("typed gap: a wrong gap lists an accepted answer; a right gap is not listed", () => {
    render(<SlotsRenderer item={slotsItem()} attemptId="a1" onScore={() => {}} />);
    expect(screen.queryByText(/Correct:/)).toBeNull();

    fireEvent.change(screen.getByLabelText("Gap 1"), { target: { value: "run" } }); // wrong
    fireEvent.change(screen.getByLabelText("Gap 2"), { target: { value: "goes" } }); // right
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    expect(screen.getByText("Gap 1: Correct: go")).toBeDefined();
    expect(screen.queryByText(/Gap 2: Correct/)).toBeNull();
  });
});
