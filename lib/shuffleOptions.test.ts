import { describe, it, expect } from "vitest";
import { shuffleOptions } from "./shuffleOptions";

describe("shuffleOptions — determinism", () => {
  it("same seed produces the same permutation across calls", () => {
    const options = ["a", "b", "c", "d", "e", "f"];
    const first = shuffleOptions(options, "quiz-1:question-2");
    const second = shuffleOptions(options, "quiz-1:question-2");
    expect(second).toEqual(first);
  });

  it("does not mutate the input array", () => {
    const options = ["a", "b", "c", "d"];
    const original = options.slice();
    shuffleOptions(options, "some-seed");
    expect(options).toEqual(original);
  });

  it("returns a permutation: same elements, same length", () => {
    const options = ["a", "b", "c", "d", "e"];
    const shuffled = shuffleOptions(options, "seed-x");
    expect(shuffled).toHaveLength(options.length);
    expect([...shuffled].sort()).toEqual([...options].sort());
  });

  it("different seeds produce different orderings (for a large enough set)", () => {
    const options = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const a = shuffleOptions(options, "seed-a");
    const b = shuffleOptions(options, "seed-b");
    expect(a).not.toEqual(b);
  });

  it("is a no-op copy for 0 or 1 options", () => {
    expect(shuffleOptions([], "seed")).toEqual([]);
    expect(shuffleOptions(["only"], "seed")).toEqual(["only"]);
  });

  it("0-or-1-option result is a new array, not the same reference", () => {
    const options = ["only"];
    expect(shuffleOptions(options, "seed")).not.toBe(options);
  });
});
