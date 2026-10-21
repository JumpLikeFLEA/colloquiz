import { describe, expect, it } from "vitest";
import type { RawFinalAnalysis, RawFirstAnalysis } from "./schema";
import { findQuoteSpan, validateAnalysis, type ValidateContext } from "./validate";

const T = "I made up my mind. I go, I went to the school and I used to uh play football. <b>Fun</b> time.";

const ctx = (over: Partial<ValidateContext> = {}): ValidateContext => ({
  kind: "first",
  transcript: T,
  firstTranscript: null,
  expressionsListed: ["make up my mind", "I used to"],
  includeGoal: true,
  analysedSeconds: 60,
  truncated: false,
  ...over,
});

const raw = (over: Partial<RawFirstAnalysis> = {}): RawFirstAnalysis => ({
  summary: "You spoke clearly.",
  expressions_used: [],
  highlights: [],
  errors: [],
  main_error: null,
  how_it_sounds: "Warm and clear.",
  goal: "Try one new expression.",
  ...over,
});

describe("findQuoteSpan", () => {
  it("finds an exact substring and reports its offsets", () => {
    expect(findQuoteSpan(T, "my mind")).toEqual({ start: 10, end: 17 });
  });
  it("forgives whitespace at the edges and nothing else", () => {
    expect(findQuoteSpan(T, "  my mind ")).toEqual({ start: 10, end: 17 });
    expect(findQuoteSpan(T, "my  mind")).toBeNull();
    expect(findQuoteSpan(T, "My mind")).toBeNull();
    expect(findQuoteSpan(T, "")).toBeNull();
  });
  it("skips an occurrence that is taken and takes the next", () => {
    const first = findQuoteSpan("a b a b", "a b");
    expect(first).toEqual({ start: 0, end: 3 });
    expect(findQuoteSpan("a b a b", "a b", [first!])).toEqual({ start: 4, end: 7 });
    expect(findQuoteSpan("a b", "a b", [first!])).toBeNull();
  });
  it("refuses a quote that is not short", () => {
    const long = "word ".repeat(60);
    expect(findQuoteSpan(long, long.trim())).toBeNull();
  });
});

describe("validateAnalysis: verbatim only", () => {
  it("drops a highlight that is not in the transcript and keeps the one that is", () => {
    const out = validateAnalysis(
      raw({
        highlights: [
          { quote: "I used to", kind: "strength", note: "Good chunk." },
          { quote: "I always used to", kind: "strength", note: "Invented." },
        ],
      }),
      ctx(),
    );
    expect(out.highlights.map((h) => h.quote)).toEqual(["I used to"]);
    expect(out.dropped.highlights).toBe(1);
    expect(T.slice(out.highlights[0].span.start, out.highlights[0].span.end)).toBe("I used to");
  });

  it("drops errors, expressions and then/now pairs the same way", () => {
    const out = validateAnalysis(
      {
        ...raw({
          expressions_used: [{ expression: "make up my mind", quote: "made up my mind", exact: false }],
          errors: [
            { quote: "I go, I went", correction: "I went", category: "grammar", explanation: "Past tense." },
            { quote: "he go", correction: "he goes", category: "grammar", explanation: "Not said." },
          ],
          main_error: 0,
        }),
        then_now: [
          { then: "before words", now: "I used to", note: "Better." },
          { then: "I was here", now: "I used to", note: "then is not in the first transcript" },
          { then: "before words", now: "not in the final", note: "now is not in the final transcript" },
        ],
      } satisfies RawFinalAnalysis,
      ctx({ kind: "final", firstTranscript: "some before words here" }),
    );
    expect(out.expressionsUsed).toHaveLength(1);
    expect(out.errors.map((e) => e.quote)).toEqual(["I go, I went"]);
    expect(out.thenNow).toHaveLength(1);
    expect(out.thenNow[0].thenSpan).toEqual({ start: 5, end: 17 });
    expect(out.dropped).toEqual({ expressions: 0, highlights: 0, errors: 1, thenNow: 2 });
  });

  it("drops an expression that is not on the authors list, and a repeated one", () => {
    const out = validateAnalysis(
      raw({
        expressions_used: [
          { expression: "I used to", quote: "I used to", exact: true },
          { expression: "I used to", quote: "I used to", exact: true },
          { expression: "keep an eye on", quote: "mind", exact: true },
        ],
      }),
      ctx(),
    );
    expect(out.expressionsUsed.map((e) => e.expression)).toEqual(["I used to"]);
    expect(out.dropped.expressions).toBe(2);
  });

  it("keeps no comparison when there is no baseline, whatever the model returned", () => {
    const out = validateAnalysis(
      { ...raw(), then_now: [{ then: "x", now: "I used to", note: "n" }] } satisfies RawFinalAnalysis,
      ctx({ kind: "final", firstTranscript: null }),
    );
    expect(out.thenNow).toEqual([]);
    expect(out.dropped.thenNow).toBe(1);
  });
});

describe("validateAnalysis: overlaps", () => {
  it("keeps the first of two overlapping errors and remaps main_error", () => {
    const out = validateAnalysis(
      raw({
        errors: [
          { quote: "I go, I went to", correction: "I went to", category: "grammar", explanation: "a" },
          { quote: "went to the school", correction: "went to school", category: "grammar", explanation: "b" },
          { quote: "the school", correction: "school", category: "grammar", explanation: "c" },
        ],
        main_error: 2,
      }),
      ctx(),
    );
    // 0 stays; 1 overlaps 0 ("went to"); 2 starts after 0 ends, so it stays.
    expect(out.errors.map((e) => e.quote)).toEqual(["I go, I went to", "the school"]);
    expect(out.mainError).toBe(1);
  });

  it("sets main_error to null when the main error was dropped", () => {
    const out = validateAnalysis(
      raw({
        errors: [
          { quote: "not said", correction: "x", category: "grammar", explanation: "e" },
          { quote: "I go, I went", correction: "I went", category: "grammar", explanation: "e" },
        ],
        main_error: 0,
      }),
      ctx(),
    );
    expect(out.errors).toHaveLength(1);
    expect(out.mainError).toBeNull();
  });

  it("an out-of-range main_error is null, not a crash", () => {
    expect(validateAnalysis(raw({ main_error: 7 }), ctx()).mainError).toBeNull();
  });

  it("lets an expression sit inside an error (different lists)", () => {
    const out = validateAnalysis(
      raw({
        expressions_used: [{ expression: "make up my mind", quote: "made up my mind", exact: false }],
        errors: [
          { quote: "made up my mind", correction: "make up my mind", category: "grammar", explanation: "Tense." },
        ],
      }),
      ctx(),
    );
    expect(out.expressionsUsed).toHaveLength(1);
    expect(out.errors).toHaveLength(1);
  });

  it("marks the same words said twice once each", () => {
    const out = validateAnalysis(
      raw({
        highlights: [
          { quote: "I", kind: "strength", note: "a" },
          { quote: "I", kind: "strength", note: "b" },
        ],
      }),
      ctx({ transcript: "I think I know" }),
    );
    expect(out.highlights.map((h) => h.span.start)).toEqual([0, 8]);
  });
});

describe("validateAnalysis: counts are ours", () => {
  it("computes every count from what was kept", () => {
    const out = validateAnalysis(
      raw({
        expressions_used: [{ expression: "I used to", quote: "I used to", exact: true }],
        highlights: [
          { quote: "I made up", kind: "strength", note: "a" },
          { quote: "uh", kind: "hesitation", note: "b" },
          { quote: "not in the text", kind: "strength", note: "c" },
        ],
        errors: [{ quote: "I go, I went", correction: "I went", category: "grammar", explanation: "e" }],
        main_error: 0,
      }),
      ctx(),
    );
    expect(out.counts).toEqual({
      errors: 1,
      highlights: 2,
      hesitations: 1,
      expressionsUsed: 1,
      expressionsListed: 2,
      thenNow: 0,
    });
  });

  it("keeps at most one hesitation", () => {
    const out = validateAnalysis(
      raw({
        highlights: [
          { quote: "uh", kind: "hesitation", note: "a" },
          { quote: "I go, I went", kind: "hesitation", note: "b" },
        ],
      }),
      ctx(),
    );
    expect(out.counts.hesitations).toBe(1);
    expect(out.dropped.highlights).toBe(1);
  });

  it("has nowhere to read a count from the model: extra fields are not carried", () => {
    const withCounts = { ...raw(), counts: { errors: 99 }, score: 7 } as unknown as RawFirstAnalysis;
    const out = validateAnalysis(withCounts, ctx());
    expect(out.counts.errors).toBe(0);
    expect(JSON.stringify(out)).not.toContain("99");
    expect(JSON.stringify(out)).not.toContain("score");
  });

  it("drops an error whose correction corrects nothing", () => {
    const out = validateAnalysis(
      raw({
        errors: [{ quote: "I go, I went", correction: " I go, I went ", category: "grammar", explanation: "e" }],
      }),
      ctx(),
    );
    expect(out.errors).toEqual([]);
  });
});

describe("validateAnalysis: plain text", () => {
  it("a quote containing markup stays exactly that text", () => {
    const out = validateAnalysis(
      raw({ highlights: [{ quote: "<b>Fun</b> time", kind: "strength", note: "<script>x</script>" }] }),
      ctx(),
    );
    expect(out.highlights[0].quote).toBe("<b>Fun</b> time");
    expect(out.highlights[0].note).toBe("<script>x</script>");
    expect(T.slice(out.highlights[0].span.start, out.highlights[0].span.end)).toBe("<b>Fun</b> time");
  });
});

describe("validateAnalysis: goal and coverage", () => {
  it("drops the goal when the task has no goal card", () => {
    expect(validateAnalysis(raw(), ctx({ includeGoal: false })).goal).toBeNull();
    expect(validateAnalysis(raw(), ctx({ includeGoal: true })).goal).toBe("Try one new expression.");
  });

  it("records what was analysed", () => {
    const out = validateAnalysis(raw(), ctx({ analysedSeconds: 180, truncated: true }));
    expect(out.coverage).toEqual({ analysedSeconds: 180, truncated: true });
  });

  it("cuts a runaway text field and drops a highlight with an empty note", () => {
    const out = validateAnalysis(
      raw({ summary: "x".repeat(2000), highlights: [{ quote: "uh", kind: "hesitation", note: "  " }] }),
      ctx(),
    );
    expect(out.summary.length).toBeLessThanOrEqual(600);
    expect(out.highlights).toEqual([]);
  });
});
