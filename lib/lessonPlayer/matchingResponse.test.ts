import { describe, expect, it } from "vitest";
import { scoreItem } from "../items";
import { matchingModule } from "../items/matching";
import type { MatchingItem } from "../items";
import { shuffleForItem } from "../items/shuffle";
import { buildMatchingResponse, clearMatchingPair, setMatchingPair } from "./matchingResponse";

/** Drives the same pair/build helpers a renderer's tap-to-pair handlers
 * call, through to `scoreItem`, without any React/jsdom involved — see the
 * module header for why this is where PLAY-003's "drives the renderer to
 * submission and scores the result" acceptance line is satisfied for
 * `matching`. */

function text(t: string) {
  return { kind: "text" as const, text: t };
}

function parsedMatching(payload: unknown, id = "match-1"): MatchingItem {
  const result = matchingModule.parse({
    id,
    type: "matching",
    payload: { explanations: {}, fallbackExplanation: "explanation", ...(payload as object) },
  });
  if (!result.ok) throw new Error(`fixture did not parse: ${JSON.stringify(result.errors)}`);
  return result.item;
}

const WORD_DEFINITION_ITEM = {
  prompt: "Match the word to its definition.",
  left: [
    { id: "l1", content: text("cat") },
    { id: "l2", content: text("dog") },
  ],
  right: [
    { id: "r1", content: text("a small furry pet that says meow") },
    { id: "r2", content: text("a loyal pet that barks") },
    { id: "r3", content: text("a farm animal that gives milk") }, // distractor
  ],
  pairs: [
    { id: "p1", left: "l1", right: "r1", explanationRef: "e1" },
    { id: "p2", left: "l2", right: "r2", explanationRef: "e2" },
  ],
  explanations: { e1: "cat -> meow", e2: "dog -> barks" },
};

describe("setMatchingPair / clearMatchingPair", () => {
  it("sets and overwrites a left element's pairing", () => {
    let pairs = setMatchingPair(new Map(), "l1", "r1");
    expect(pairs.get("l1")).toBe("r1");
    pairs = setMatchingPair(pairs, "l1", "r2");
    expect(pairs.get("l1")).toBe("r2");
  });

  it("clear removes only the named left element's pairing", () => {
    let pairs = setMatchingPair(new Map(), "l1", "r1");
    pairs = setMatchingPair(pairs, "l2", "r2");
    pairs = clearMatchingPair(pairs, "l1");
    expect(pairs.has("l1")).toBe(false);
    expect(pairs.get("l2")).toBe("r2");
  });

  it("does not prevent two different left ids pairing to the same right id (many-to-one, 0013)", () => {
    let pairs = setMatchingPair(new Map(), "l1", "r1");
    pairs = setMatchingPair(pairs, "l2", "r1");
    expect(pairs.get("l1")).toBe("r1");
    expect(pairs.get("l2")).toBe("r1");
  });
});

describe("matching: pair -> build -> score", () => {
  it("scores a fully correct pairing", () => {
    const item = parsedMatching(WORD_DEFINITION_ITEM);
    let pairs = setMatchingPair(new Map(), "l1", "r1");
    pairs = setMatchingPair(pairs, "l2", "r2");

    const result = scoreItem(item, buildMatchingResponse(pairs));
    expect(result.earned).toBe(2);
    expect(result.possible).toBe(2);
    expect(result.subResults.map((r) => [r.id, r.correct])).toEqual([
      ["p1", true],
      ["p2", true],
    ]);
  });

  it("scores each pair independently, leaving an unpaired left unscored as 'no answer' for its pair", () => {
    const item = parsedMatching(WORD_DEFINITION_ITEM);
    const pairs = setMatchingPair(new Map(), "l1", "r1"); // l2 left unpaired

    const result = scoreItem(item, buildMatchingResponse(pairs));
    expect(result.earned).toBe(1);
    expect(result.possible).toBe(2);
    expect(result.subResults.map((r) => [r.id, r.correct])).toEqual([
      ["p1", true],
      ["p2", false],
    ]);
  });

  it("a right distractor (r3) never appears in subResults, whether paired or not", () => {
    const item = parsedMatching(WORD_DEFINITION_ITEM);
    let pairs = setMatchingPair(new Map(), "l1", "r3"); // wrong, but a legal response shape
    pairs = setMatchingPair(pairs, "l2", "r2");

    const result = scoreItem(item, buildMatchingResponse(pairs));
    expect(result.subResults.map((r) => r.id)).toEqual(["p1", "p2"]);
    expect(result.subResults.find((r) => r.id === "p1")?.correct).toBe(false);
  });

  it("presentation order from shuffleForItem on the right side never affects the score (0007)", () => {
    const item = parsedMatching(WORD_DEFINITION_ITEM);
    const presentedRight = shuffleForItem(item.payload.right, "attempt-1", item.id);
    expect(presentedRight.map((r) => r.id).sort()).toEqual(["r1", "r2", "r3"]);

    // Tap whichever presented chip IS "r1" for l1 -- the renderer never
    // reasons about chip position, only the chip's own id.
    const tapped = presentedRight.find((r) => r.id === "r1")!;
    const pairs = setMatchingPair(new Map(), "l1", tapped.id);
    const result = scoreItem(item, buildMatchingResponse(pairs));
    expect(result.subResults.find((r) => r.id === "p1")?.correct).toBe(true);
  });
});
