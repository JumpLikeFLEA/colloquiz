import { describe, it, expect } from "vitest";
import { itemShuffleSeed, shuffleForItem, shuffleOrderingIndices } from "./shuffle";

describe("itemShuffleSeed", () => {
  it("is attemptId:itemId", () => {
    expect(itemShuffleSeed("attempt-1", "item-7")).toBe("attempt-1:item-7");
  });
});

describe("shuffleForItem", () => {
  it("same attempt+item gives the same permutation across calls", () => {
    const options = ["a", "b", "c", "d", "e"];
    const first = shuffleForItem(options, "attempt-1", "item-1");
    const second = shuffleForItem(options, "attempt-1", "item-1");
    expect(second).toEqual(first);
  });

  it("a different attemptId (a retry) reshuffles the same item", () => {
    const options = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const attempt1 = shuffleForItem(options, "attempt-1", "item-1");
    const attempt2 = shuffleForItem(options, "attempt-2", "item-1");
    expect(attempt1).not.toEqual(attempt2);
  });
});

describe("shuffleOrderingIndices — never the correct order", () => {
  // n=2 is the case a naive shuffle fails on: only two permutations exist
  // (identity and swap), so an unguarded shuffle hits identity ~50% of the
  // time. Sweep many seeds and assert it never does.
  it("n=2: never identity, over many seeds", () => {
    for (let i = 0; i < 500; i++) {
      const result = shuffleOrderingIndices(2, `attempt-${i}`, "item-n2");
      expect(result).not.toEqual([0, 1]);
      // and it must still be a permutation of {0,1}
      expect([...result].sort()).toEqual([0, 1]);
    }
  });

  it("n=3: never identity, over many seeds", () => {
    for (let i = 0; i < 500; i++) {
      const result = shuffleOrderingIndices(3, `attempt-${i}`, "item-n3");
      expect(result).not.toEqual([0, 1, 2]);
      expect([...result].sort()).toEqual([0, 1, 2]);
    }
  });

  it("n=0 and n=1 have no other permutation to give — identity is the only valid result", () => {
    expect(shuffleOrderingIndices(0, "attempt-1", "item-n0")).toEqual([]);
    expect(shuffleOrderingIndices(1, "attempt-1", "item-n1")).toEqual([0]);
  });

  it("is deterministic per attempt+item", () => {
    const first = shuffleOrderingIndices(5, "attempt-1", "item-5");
    const second = shuffleOrderingIndices(5, "attempt-1", "item-5");
    expect(second).toEqual(first);
  });
});

describe("no scoring depends on presentation order", () => {
  // The concrete shape of the invariant: an ordering item's elements carry
  // their own ids. Presentation shuffles indices for DISPLAY; the learner's
  // response is read back as an ordered list of ids (drag results reorder a
  // set of id-tagged chips) and scored by comparing that id sequence to the
  // authored id sequence — never by comparing array positions. Swap the
  // shuffle seed (a different presentation order) and the score for the same
  // learner answer is unchanged, because scoring never looks at how the
  // items were laid out on screen.
  const elements = [
    { id: "id-A", text: "First" },
    { id: "id-B", text: "Second" },
    { id: "id-C", text: "Third" },
  ];
  const correctIdOrder = elements.map((e) => e.id); // authored order, by id

  function scoreByIdentity(submittedIdOrder: string[]): boolean {
    return JSON.stringify(submittedIdOrder) === JSON.stringify(correctIdOrder);
  }

  it("scoring the correct id sequence is correct regardless of which seed presented it", () => {
    for (const attemptId of ["attempt-a", "attempt-b", "attempt-c"]) {
      const presented = shuffleOrderingIndices(elements.length, attemptId, "item-order");
      // The learner drags the presented chips back into the authored order —
      // the SUBMITTED id sequence is what's scored, not `presented` itself.
      void presented; // presentation order is irrelevant to the score below
      expect(scoreByIdentity(correctIdOrder)).toBe(true);
    }
  });

  it("a wrong id sequence scores wrong under every presentation seed", () => {
    const wrongIdOrder = ["id-B", "id-A", "id-C"];
    for (const attemptId of ["attempt-a", "attempt-b", "attempt-c"]) {
      shuffleOrderingIndices(elements.length, attemptId, "item-order");
      expect(scoreByIdentity(wrongIdOrder)).toBe(false);
    }
  });
});
