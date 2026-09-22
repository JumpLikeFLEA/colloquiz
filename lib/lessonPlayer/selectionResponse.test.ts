import { describe, expect, it } from "vitest";
import { scoreItem } from "../items";
import { selectionModule } from "../items/selection";
import { selectionGridModule } from "../items/selectionGrid";
import type { SelectionGridItem, SelectionItem } from "../items";
import { shuffleForItem } from "../items/shuffle";
import {
  buildSelectionGridResponse,
  buildSelectionResponse,
  selectionOptionFeedback,
  setGridRowAnswer,
  toggleSelectionOption,
} from "./selectionResponse";

/** Drives the same toggle/build helpers a renderer's click handlers call,
 * through to `scoreItem`, without any React/jsdom involved — see the module
 * header for why this is where PLAY-002's "drives the renderer to
 * submission and scores the result" acceptance line is satisfied. */

function parsedSelection(payload: unknown, id = "sel-1"): SelectionItem {
  const result = selectionModule.parse({
    id,
    type: "selection",
    payload: { explanations: {}, fallbackExplanation: "explanation", ...(payload as object) },
  });
  if (!result.ok) throw new Error(`fixture did not parse: ${JSON.stringify(result.errors)}`);
  return result.item;
}

function parsedGrid(payload: unknown, id = "grid-1"): SelectionGridItem {
  const result = selectionGridModule.parse({
    id,
    type: "selection_grid",
    payload: { explanations: {}, fallbackExplanation: "explanation", ...(payload as object) },
  });
  if (!result.ok) throw new Error(`fixture did not parse: ${JSON.stringify(result.errors)}`);
  return result.item;
}

describe("toggleSelectionOption", () => {
  it("single-answer: tapping a second option replaces the first (radio semantics)", () => {
    let selected = toggleSelectionOption([], "a", false);
    expect(selected).toEqual(["a"]);
    selected = toggleSelectionOption(selected, "b", false);
    expect(selected).toEqual(["b"]);
  });

  it("single-answer: tapping the same option again clears it", () => {
    const selected = toggleSelectionOption(["a"], "a", false);
    expect(selected).toEqual([]);
  });

  it("multi-answer: tapping adds, tapping again removes (checkbox semantics)", () => {
    let selected = toggleSelectionOption([], "a", true);
    selected = toggleSelectionOption(selected, "b", true);
    expect(selected).toEqual(["a", "b"]);
    selected = toggleSelectionOption(selected, "a", true);
    expect(selected).toEqual(["b"]);
  });
});

describe("selection: toggle -> build -> score", () => {
  it("scores a correct single-answer submission as 1/1", () => {
    const item = parsedSelection({
      prompt: "Which form is correct?",
      multi: false,
      options: [
        { id: "a", text: "walk" },
        { id: "b", text: "walked" },
      ],
      correctOptionIds: ["b"],
      explanationRef: "r1",
      explanations: { r1: "walked is past simple" },
    });

    const selected = toggleSelectionOption([], "b", item.payload.multi);
    const result = scoreItem(item, buildSelectionResponse(selected));

    expect(result.earned).toBe(1);
    expect(result.possible).toBe(1);
    expect(result.subResults[0].correct).toBe(true);
  });

  it("scores a wrong single-answer submission as 0/1, and feedback marks selected+correct", () => {
    const item = parsedSelection({
      prompt: "Which form is correct?",
      multi: false,
      options: [
        { id: "a", text: "walk" },
        { id: "b", text: "walked" },
      ],
      correctOptionIds: ["b"],
      explanationRef: "r1",
      explanations: { r1: "walked is past simple" },
    });

    const selected = toggleSelectionOption([], "a", item.payload.multi);
    const result = scoreItem(item, buildSelectionResponse(selected));

    expect(result.earned).toBe(0);
    expect(result.subResults[0].correct).toBe(false);

    const feedback = selectionOptionFeedback(item, selected);
    expect(feedback).toEqual([
      { id: "a", wasSelected: true, isCorrect: false },
      { id: "b", wasSelected: false, isCorrect: true },
    ]);
  });

  it("multi-answer: partial credit for selecting one of two correct options", () => {
    const item = parsedSelection({
      prompt: "Which are fruits?",
      multi: true,
      options: [
        { id: "a", text: "apple" },
        { id: "b", text: "banana" },
        { id: "c", text: "carrot" },
      ],
      correctOptionIds: ["a", "b"],
      explanationRef: "r1",
      explanations: { r1: "apple and banana are fruits" },
    });

    let selected: string[] = [];
    selected = toggleSelectionOption(selected, "a", item.payload.multi);
    const result = scoreItem(item, buildSelectionResponse(selected));

    expect(result.earned).toBe(0.5);
    expect(result.possible).toBe(1);
  });

  it("presentation order from shuffleForItem never affects the score (0007)", () => {
    const item = parsedSelection({
      prompt: "Which form is correct?",
      multi: false,
      options: [
        { id: "a", text: "walk" },
        { id: "b", text: "walked" },
        { id: "c", text: "walking" },
      ],
      correctOptionIds: ["b"],
      explanationRef: "r1",
      explanations: { r1: "walked is past simple" },
    });

    const presented = shuffleForItem(item.payload.options, "attempt-1", item.id);
    expect(presented.map((o) => o.id).sort()).toEqual(["a", "b", "c"]);

    // Tap whichever presented option IS "b" — the renderer never reasons
    // about position, only the option's own id.
    const tapped = presented.find((o) => o.id === "b")!;
    const selected = toggleSelectionOption([], tapped.id, item.payload.multi);
    const result = scoreItem(item, buildSelectionResponse(selected));

    expect(result.earned).toBe(1);
  });
});

describe("selection_grid: toggle -> build -> score", () => {
  it("scores each row independently and leaves untouched rows incorrect, not excluded", () => {
    const item = parsedGrid({
      prompt: "True or false?",
      rows: [
        { id: "r1", statement: "The sky is blue.", correct: true, explanationRef: "e1" },
        { id: "r2", statement: "Cats are reptiles.", correct: false, explanationRef: "e2" },
        { id: "r3", statement: "Water boils at 100C.", correct: true, explanationRef: "e3" },
      ],
      explanations: { e1: "yes", e2: "no, mammals", e3: "at sea level" },
    });

    let answers = new Map<string, boolean>();
    answers = setGridRowAnswer(answers, "r1", true); // correct
    answers = setGridRowAnswer(answers, "r2", true); // wrong (correct is false)
    // r3 left untouched -> scores incorrect, not excluded

    const result = scoreItem(item, buildSelectionGridResponse(answers));

    expect(result.possible).toBe(3);
    expect(result.earned).toBe(1);
    expect(result.subResults.map((s) => [s.id, s.correct])).toEqual([
      ["r1", true],
      ["r2", false],
      ["r3", false],
    ]);
  });

  it("re-answering a row (toggling the switch back and forth) uses only the latest answer", () => {
    const item = parsedGrid({
      prompt: "True or false?",
      rows: [{ id: "r1", statement: "The sky is blue.", correct: true, explanationRef: "e1" }],
      explanations: { e1: "yes" },
    });

    let answers = new Map<string, boolean>();
    answers = setGridRowAnswer(answers, "r1", false);
    answers = setGridRowAnswer(answers, "r1", true);

    const result = scoreItem(item, buildSelectionGridResponse(answers));
    expect(result.earned).toBe(1);
  });
});
