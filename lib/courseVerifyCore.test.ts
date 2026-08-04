import { describe, it, expect } from "vitest";
import { tallyBlind, extractAnswer } from "./courseVerifyCore";

describe("extractAnswer", () => {
  it("reads a bare JSON object", () => {
    expect(extractAnswer('{"answer": "2*x"}')).toBe("2*x");
  });

  it("finds the final answer field after prose and LaTeX-brace working (the real failure)", () => {
    // Abridged from an actual Haiku reply: $$…$$ math full of \frac{…} braces that
    // a greedy {…} JSON matcher would grab first, then the real answer at the end.
    const reply =
      "This is a fundamental limit.\n\n" +
      "$$\\lim_{x\\to 0}\\frac{\\sin x}{x} = \\frac{\\cos x}{1} = 1$$\n\n" +
      "The limit is **1**.\n\n" +
      '{"answer": "1"}';
    expect(extractAnswer(reply)).toBe("1");
  });

  it("takes the LAST answer field when the model echoes an example first", () => {
    const reply = 'Example: {"answer": "pi/2"} — now mine:\n{"answer": "exp(x)"}';
    expect(extractAnswer(reply)).toBe("exp(x)");
  });

  it("unescapes JSON string escapes in the value", () => {
    expect(extractAnswer('{"answer": "Rational(2,\\t3)"}')).toBe("Rational(2,\t3)");
  });

  it("returns null when there is no answer field", () => {
    expect(extractAnswer("I cannot solve this.")).toBeNull();
  });

  it("returns null for an empty answer", () => {
    expect(extractAnswer('{"answer": "   "}')).toBeNull();
  });
});

// tallyBlind is the pure decision at the heart of the Layer-2 blind solver: given
// k solver samples and, for each, whether SymPy proved it equal to the authored
// key (true), unequal (false), or couldn't decide (null), decide the item's fate.
// agreement = 2 mirrors the default (majority of 3 must match to confirm).

describe("tallyBlind", () => {
  it("returns null (unverifiable) when no sample parsed", () => {
    expect(tallyBlind([], [], 2)).toEqual({
      ok: null,
      reason: "blind solver produced no parseable answer",
    });
  });

  it("confirms (true) when a majority of runs match the key", () => {
    expect(tallyBlind(["1", "1", "2"], [true, true, false], 2)).toEqual({ ok: true });
  });

  it("confirms (true) on unanimous agreement", () => {
    expect(tallyBlind(["x**2", "x**2", "x**2"], [true, true, true], 2)).toEqual({ ok: true });
  });

  it("confirms even if one sample was undecidable, as long as matches reach the bar", () => {
    expect(tallyBlind(["1", "1", "junk"], [true, true, null], 2)).toEqual({ ok: true });
  });

  it("reports false (likely wrong key) when every decidable run contradicts the key", () => {
    const out = tallyBlind(["2/3", "2/3", "2/3"], [false, false, false], 2);
    expect(out.ok).toBe(false);
    expect(out.reason).toContain("contradicted the key on all 3");
    expect(out.reason).toContain("2/3");
  });

  it("reports null (unverifiable) when agreement falls short but isn't a clean contradiction", () => {
    const out = tallyBlind(["1", "2", "3"], [true, false, false], 2);
    expect(out.ok).toBeNull();
    expect(out.reason).toContain("1/3 run(s) matched");
  });

  it("reports null when too few runs were decidable to trust a contradiction", () => {
    // one confident miss, two undecidable → not enough evidence to call the key wrong
    const out = tallyBlind(["5", "junk", "junk"], [false, null, null], 2);
    expect(out.ok).toBeNull();
    expect(out.reason).toContain("0/3 run(s) matched");
  });

  it("reports null when samples exist but none could be compared", () => {
    const out = tallyBlind(["junk", "junk"], [null, null], 2);
    expect(out.ok).toBeNull();
  });
});
