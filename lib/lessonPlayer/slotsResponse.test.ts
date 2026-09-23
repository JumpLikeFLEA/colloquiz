import { describe, expect, it } from "vitest";
import { scoreItem } from "../items";
import { slotsModule } from "../items/slots";
import type { SlotsItem } from "../items";
import { shuffleForItem } from "../items/shuffle";
import {
  buildSlotsResponse,
  buildSlotsResponseFromChips,
  clearChip,
  clearGapAnswer,
  placeChip,
  setGapAnswer,
  splitPromptOnGaps,
} from "./slotsResponse";

/** Drives the same set/place/build helpers a renderer's typed-input and
 * drag-tap handlers call, through to `scoreItem`, without any React/jsdom
 * involved — see the module header for why this is where PLAY-004's "drives
 * the renderer to submission and scores the result" acceptance line is
 * satisfied for `slots`, for BOTH inputs. */

function parsedSlots(payload: unknown, id = "slots-1"): SlotsItem {
  const result = slotsModule.parse({
    id,
    type: "slots",
    payload: { explanations: {}, fallbackExplanation: "explanation", ...(payload as object) },
  });
  if (!result.ok) throw new Error(`fixture did not parse: ${JSON.stringify(result.errors)}`);
  return result.item;
}

const THREE_GAP_ITEM = {
  prompt: "I have a ___. I ___ yesterday. I ___ care.",
  input: "typed" as const,
  gaps: [
    { id: "g1", acceptedAnswers: ["cat"], explanationRef: "r1" },
    { id: "g2", acceptedAnswers: ["run", "ran"], explanationRef: "r1" },
    { id: "g3", acceptedAnswers: ["don't"], explanationRef: "r1" },
  ],
  explanations: { r1: "explanation" },
};

describe("splitPromptOnGaps", () => {
  it("splits into gapCount + 1 segments when the count matches", () => {
    const segments = splitPromptOnGaps("I have a ___. I ___ yesterday. I ___ care.", 3);
    expect(segments).toEqual(["I have a ", ". I ", " yesterday. I ", " care."]);
  });

  it("returns null when the prompt has fewer or more '___' than gaps", () => {
    expect(splitPromptOnGaps("I have a ___ and a ___.", 3)).toBeNull();
    expect(splitPromptOnGaps("No gaps here.", 1)).toBeNull();
  });
});

describe("setGapAnswer / clearGapAnswer", () => {
  it("sets and overwrites a gap's typed answer", () => {
    let answers = setGapAnswer(new Map(), "g1", "cat");
    expect(answers.get("g1")).toBe("cat");
    answers = setGapAnswer(answers, "g1", "cats");
    expect(answers.get("g1")).toBe("cats");
  });

  it("clear removes only the named gap's answer", () => {
    let answers = setGapAnswer(new Map(), "g1", "cat");
    answers = setGapAnswer(answers, "g2", "run");
    answers = clearGapAnswer(answers, "g1");
    expect(answers.has("g1")).toBe(false);
    expect(answers.get("g2")).toBe("run");
  });
});

describe("placeChip / clearChip", () => {
  it("sets and overwrites a gap's placed chip", () => {
    let placed = placeChip(new Map(), "g1", "chip-a");
    expect(placed.get("g1")).toBe("chip-a");
    placed = placeChip(placed, "g1", "chip-b");
    expect(placed.get("g1")).toBe("chip-b");
  });

  it("clear removes only the named gap's placement", () => {
    let placed = placeChip(new Map(), "g1", "chip-a");
    placed = placeChip(placed, "g2", "chip-b");
    placed = clearChip(placed, "g1");
    expect(placed.has("g1")).toBe(false);
    expect(placed.get("g2")).toBe("chip-b");
  });
});

describe("slots (typed): set -> build -> score", () => {
  it("scores all gaps right", () => {
    const item = parsedSlots(THREE_GAP_ITEM);
    let answers = setGapAnswer(new Map(), "g1", "cat");
    answers = setGapAnswer(answers, "g2", "ran");
    answers = setGapAnswer(answers, "g3", "don't");

    const result = scoreItem(item, buildSlotsResponse(answers));
    expect(result.earned).toBe(3);
    expect(result.possible).toBe(3);
    expect(result.subResults.map((r) => r.correct)).toEqual([true, true, true]);
  });

  it("an untouched gap scores incorrect, not excluded", () => {
    const item = parsedSlots(THREE_GAP_ITEM);
    const answers = setGapAnswer(new Map(), "g1", "cat"); // g2/g3 left untouched

    const result = scoreItem(item, buildSlotsResponse(answers));
    expect(result.earned).toBe(1);
    expect(result.possible).toBe(3);
    expect(result.subResults.map((r) => r.id)).toEqual(["g1", "g2", "g3"]);
  });
});

describe("slots (drag): place -> build -> score", () => {
  // One chip per gap, id'd by the gap it originated from -- same convention
  // SlotsRenderer uses (acceptedAnswers[0] as the chip's display/answer text).
  const chipTextById = new Map([
    ["g1", "cat"],
    ["g2", "run"],
    ["g3", "don't"],
  ]);

  it("scores all gaps right when every chip lands on its own gap", () => {
    const item = parsedSlots(THREE_GAP_ITEM);
    let placed = placeChip(new Map(), "g1", "g1");
    placed = placeChip(placed, "g2", "g2");
    placed = placeChip(placed, "g3", "g3");

    const result = scoreItem(item, buildSlotsResponseFromChips(placed, chipTextById));
    expect(result.earned).toBe(3);
    expect(result.possible).toBe(3);
  });

  it("a chip dropped on the wrong gap scores that gap incorrect", () => {
    const item = parsedSlots(THREE_GAP_ITEM);
    const placed = placeChip(new Map(), "g1", "g2"); // "run" answer text on g1 (wants "cat")

    const result = scoreItem(item, buildSlotsResponseFromChips(placed, chipTextById));
    expect(result.subResults.find((r) => r.id === "g1")?.correct).toBe(false);
  });

  it("typed and drag score identically for the same answer text (this card's acceptance)", () => {
    const item = parsedSlots(THREE_GAP_ITEM);

    const typedAnswers = setGapAnswer(new Map(), "g1", "cat");
    const typedResult = scoreItem(item, buildSlotsResponse(typedAnswers));

    const draggedPlacement = placeChip(new Map(), "g1", "g1");
    const dragResult = scoreItem(item, buildSlotsResponseFromChips(draggedPlacement, chipTextById));

    expect(dragResult.subResults.find((r) => r.id === "g1")?.correct).toBe(
      typedResult.subResults.find((r) => r.id === "g1")?.correct,
    );
    expect(dragResult.subResults.find((r) => r.id === "g1")?.correct).toBe(true);
  });

  it("presentation order of the chip pool never affects the score (0007)", () => {
    const item = parsedSlots(THREE_GAP_ITEM);
    const chips = item.payload.gaps.map((gap) => ({ id: gap.id, text: gap.acceptedAnswers[0] }));
    const presented = shuffleForItem(chips, "attempt-1", item.id);
    expect(presented.map((c) => c.id).sort()).toEqual(["g1", "g2", "g3"]);

    // Tap whichever presented chip IS "g1" for gap g1 -- the renderer never
    // reasons about chip position, only the chip's own id.
    const tapped = presented.find((c) => c.id === "g1")!;
    const placed = placeChip(new Map(), "g1", tapped.id);
    const result = scoreItem(item, buildSlotsResponseFromChips(placed, chipTextById));
    expect(result.subResults.find((r) => r.id === "g1")?.correct).toBe(true);
  });
});
