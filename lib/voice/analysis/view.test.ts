import { describe, expect, it } from "vitest";
import {
  POLL_GIVE_UP_MS,
  buildSegments,
  markDetail,
  marksOf,
  parseStatusBody,
  parseStoredAnalysis,
  pollDelayMs,
  shouldGiveUp,
  statCards,
  type ViewAnalysis,
} from "./view";

const TRANSCRIPT = "Yesterday I go to the shop. Um, I made my mind and I bought a <b>red</b> coat.";

function span(quote: string, from = 0) {
  const start = TRANSCRIPT.indexOf(quote, from);
  if (start < 0) throw new Error(`fixture: ${quote} not in transcript`);
  return { start, end: start + quote.length };
}

function stored(over: Record<string, unknown> = {}) {
  return {
    v: 1,
    kind: "first",
    summary: "You told a clear story.",
    howItSounds: "Warm and a little hesitant.",
    goal: "Use the past simple two times.",
    goalReached: null,
    nextStep: null,
    expressionsUsed: [{ expression: "make up my mind", quote: "made my mind", exact: false, span: span("made my mind") }],
    highlights: [
      { quote: "Um,", kind: "hesitation", note: "A short pause.", span: span("Um,") },
      { quote: "a <b>red</b> coat", kind: "strength", note: "A good phrase.", span: span("a <b>red</b> coat") },
    ],
    errors: [
      { quote: "I go", category: "grammar", correction: "I went", explanation: "It happened yesterday.", span: span("I go") },
      { quote: "made my mind", category: "collocation", correction: "made up my mind", explanation: "Say make up.", span: span("made my mind") },
    ],
    mainError: 1,
    thenNow: [],
    counts: { errors: 2, highlights: 2, hesitations: 1, expressionsUsed: 1, expressionsListed: 3, thenNow: 0 },
    coverage: { analysedSeconds: 40, truncated: false },
    dropped: { expressions: 0, highlights: 0, errors: 0, thenNow: 0 },
    ...over,
  };
}

function parsed(over: Record<string, unknown> = {}): ViewAnalysis {
  const a = parseStoredAnalysis(stored(over), TRANSCRIPT);
  if (!a) throw new Error("fixture did not parse");
  return a;
}

describe("parseStoredAnalysis", () => {
  it("reads a stored first analysis and recomputes the counts from what it kept", () => {
    const a = parsed();
    expect(a.kind).toBe("first");
    expect(a.errors).toHaveLength(2);
    expect(a.mainError).toBe(1);
    expect(a.counts).toMatchObject({ errors: 2, highlights: 2, hesitations: 1, expressionsUsed: 1, expressionsListed: 3 });
  });

  it("keeps markup inside a quote as the characters it is", () => {
    const a = parsed();
    expect(a.highlights.map((h) => h.quote)).toContain("a <b>red</b> coat");
  });

  it("drops an item whose span no longer points at its quote (control: the same item with a true span stays)", () => {
    const bad = stored();
    (bad.errors[0] as { span: unknown }).span = { start: 0, end: 4 };
    const a = parseStoredAnalysis(bad, TRANSCRIPT)!;
    expect(a.errors.map((e) => e.quote)).toEqual(["made my mind"]);
    // The main error pointed at the second error; after the drop it is the first of what is left.
    expect(a.mainError).toBe(0);
    expect(a.counts.errors).toBe(1);
  });

  it("drops an item whose span runs past the transcript", () => {
    const bad = stored();
    (bad.highlights[0] as { span: unknown }).span = { start: TRANSCRIPT.length - 2, end: TRANSCRIPT.length + 10 };
    expect(parseStoredAnalysis(bad, TRANSCRIPT)!.highlights).toHaveLength(1);
  });

  it("skips a malformed item and keeps the rest", () => {
    const a = parseStoredAnalysis(stored({ errors: [null, "x", stored().errors[0]] }), TRANSCRIPT)!;
    expect(a.errors).toHaveLength(1);
    expect(a.mainError).toBeNull();
  });

  it("returns null for something that is not an analysis", () => {
    expect(parseStoredAnalysis(null, TRANSCRIPT)).toBeNull();
    expect(parseStoredAnalysis("text", TRANSCRIPT)).toBeNull();
    expect(parseStoredAnalysis({ kind: "third" }, TRANSCRIPT)).toBeNull();
  });

  it("reads an older final (final-v0: no goalReached, no nextStep) as absent, not as an error", () => {
    const v0 = stored({ kind: "final", goal: "old goal" });
    delete (v0 as Record<string, unknown>).goalReached;
    delete (v0 as Record<string, unknown>).nextStep;
    const a = parseStoredAnalysis(v0, TRANSCRIPT)!;
    expect(a.goalReached).toBeNull();
    expect(a.nextStep).toBeNull();
    expect(a.goal).toBeNull();
  });

  it("shows a goal only on a first, and a verdict and next step only on a final", () => {
    expect(parsed().goal).toBe("Use the past simple two times.");
    const fin = parseStoredAnalysis(
      stored({
        kind: "final",
        goal: null,
        goalReached: { status: "partly", note: "Once." },
        nextStep: "Keep it up.",
      }),
      TRANSCRIPT,
    )!;
    expect(fin.goalReached).toEqual({ status: "partly", note: "Once." });
    expect(fin.nextStep).toBe("Keep it up.");
    expect(fin.goal).toBeNull();
  });

  it("checks a final's then quote against the first take's transcript, and drops pairs without it", () => {
    const first = "I go to shop every day.";
    const nowText = "I went to the shop.";
    const pair = {
      then: "I go to shop",
      now: "I went to the shop",
      note: "Past tense.",
      thenSpan: { start: 0, end: 12 },
      nowSpan: { start: 0, end: 18 },
    };
    const fin = { ...stored({ kind: "final" }), thenNow: [pair], errors: [], highlights: [], expressionsUsed: [], mainError: null };
    expect(parseStoredAnalysis(fin, nowText, first)!.thenNow).toHaveLength(1);
    expect(parseStoredAnalysis(fin, nowText, null)!.thenNow).toHaveLength(0);
    expect(parseStoredAnalysis(fin, nowText, "Something else entirely.")!.thenNow).toHaveLength(0);
  });
});

describe("buildSegments", () => {
  it("joins back into the transcript and marks each item once", () => {
    const a = parsed();
    const segs = buildSegments(TRANSCRIPT, marksOf(a));
    expect(segs.map((s) => s.text).join("")).toBe(TRANSCRIPT);
    expect(segs.filter((s) => s.mark)).not.toHaveLength(0);
  });

  it("gives words that two items claim to the error, not the expression", () => {
    const a = parsed();
    const segs = buildSegments(TRANSCRIPT, marksOf(a));
    const over = segs.find((s) => s.text === "made my mind");
    expect(over?.mark?.kind).toBe("error");
    // The expression is still an item the view lists; it just has no run of its own.
    expect(segs.some((s) => s.mark?.kind === "expression")).toBe(false);
  });

  it("puts a highlight above an expression it overlaps", () => {
    const marks = [
      { id: "highlight-0", kind: "strength" as const, span: { start: 0, end: 9 } },
      { id: "expression-0", kind: "expression" as const, span: { start: 5, end: 12 } },
    ];
    const segs = buildSegments(TRANSCRIPT, marks);
    expect(segs[0].mark?.id).toBe("highlight-0");
    expect(segs.some((s) => s.mark?.id === "expression-0")).toBe(false);
  });

  it("orders runs by position whatever order the marks came in", () => {
    const segs = buildSegments("one two three", [
      { id: "error-1", kind: "error", span: { start: 8, end: 13 } },
      { id: "error-0", kind: "error", span: { start: 0, end: 3 } },
    ]);
    expect(segs.map((s) => s.text)).toEqual(["one", " two ", "three"]);
  });

  it("ignores a mark outside the transcript", () => {
    const segs = buildSegments("short", [{ id: "error-0", kind: "error", span: { start: 3, end: 40 } }]);
    expect(segs).toEqual([{ text: "short", mark: null }]);
  });

  it("returns one plain run for a transcript with no marks, and nothing for an empty one", () => {
    expect(buildSegments("hello", [])).toEqual([{ text: "hello", mark: null }]);
    expect(buildSegments("", [])).toEqual([]);
  });
});

describe("markDetail", () => {
  it("explains an error with its correction", () => {
    expect(markDetail(parsed(), "error-0")).toMatchObject({
      label: "To fix",
      quote: "I go",
      correction: "I went",
      text: "It happened yesterday.",
    });
  });

  it("explains a highlight by its kind, and says when an expression is only a near miss", () => {
    const a = parsed();
    expect(markDetail(a, "highlight-0")?.label).toBe("Hesitation");
    expect(markDetail(a, "highlight-1")?.label).toBe("Worked well");
    expect(markDetail(a, "expression-0")?.text).toContain("Close to");
  });

  it("is null for an id that names nothing", () => {
    const a = parsed();
    expect(markDetail(a, "error-9")).toBeNull();
    expect(markDetail(a, "nonsense")).toBeNull();
    expect(markDetail(a, "error-x")).toBeNull();
  });
});

describe("statCards", () => {
  it("counts from the items and omits the expressions card when the author listed none", () => {
    expect(statCards(parsed(), null).map((c) => [c.key, c.value])).toEqual([
      ["errors", "2"],
      ["highlights", "1"],
      ["hesitations", "1"],
      ["expressions", "1 of 3"],
    ]);
    const none = parsed({ counts: { expressionsListed: 0 }, expressionsUsed: [] });
    expect(statCards(none, null).some((c) => c.key === "expressions")).toBe(false);
  });

  it("carries the first take's figure as `from` on a final", () => {
    const first = parsed();
    const now = parsed({ errors: [stored().errors[0]], mainError: 0 });
    const cards = statCards(now, first);
    expect(cards.find((c) => c.key === "errors")).toMatchObject({ value: "1", from: "2" });
    expect(statCards(now, null).every((c) => c.from === null)).toBe(true);
  });
});

describe("polling", () => {
  it("backs off and stops growing at 15 s", () => {
    const delays = [0, 1, 2, 3, 4, 5, 6, 7, 8, 50].map(pollDelayMs);
    expect(delays[0]).toBe(2000);
    for (let i = 1; i < delays.length; i++) expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
    expect(delays.at(-1)).toBe(15000);
    expect(pollDelayMs(-3)).toBe(2000);
  });

  it("gives up after five minutes", () => {
    expect(shouldGiveUp(POLL_GIVE_UP_MS - 1)).toBe(false);
    expect(shouldGiveUp(POLL_GIVE_UP_MS)).toBe(true);
  });
});

describe("parseStatusBody", () => {
  it("accepts every state word and a done body", () => {
    for (const status of ["pending", "transcribing", "analysing", "failed", "withdrawn", "limit", "paused", "off", "none"]) {
      expect(parseStatusBody({ ok: true, status })).toEqual({ ok: true, status });
    }
    const done = parseStatusBody({ ok: true, status: "done", transcript: "hi", result: { a: 1 }, baseline: { transcript: "x", result: 2 } });
    expect(done).toEqual({ ok: true, status: "done", transcript: "hi", result: { a: 1 }, baseline: { transcript: "x", result: 2 } });
  });

  it("refuses what it does not know", () => {
    expect(parseStatusBody(null)).toBeNull();
    expect(parseStatusBody({ ok: false, status: "done" })).toBeNull();
    expect(parseStatusBody({ ok: true, status: "weird" })).toBeNull();
    expect(parseStatusBody({ ok: true, status: "done" })).toBeNull();
  });
});
