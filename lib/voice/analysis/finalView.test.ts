import { describe, expect, it } from "vitest";
import { finalAnalysisView } from "./finalView";
import type { AnalysisStatusBody } from "./view";

const TRANSCRIPT = "Yesterday I went to the shop. I made up my mind and I bought a coat.";

function span(quote: string) {
  const start = TRANSCRIPT.indexOf(quote);
  if (start < 0) throw new Error(`fixture: ${quote} not in transcript`);
  return { start, end: start + quote.length };
}

const stored = {
  v: 1,
  kind: "final",
  summary: "Clearer, and in the past.",
  howItSounds: "Smoother.",
  goal: null,
  goalReached: { status: "reached", note: "You said went." },
  nextStep: "Keep going.",
  expressionsUsed: [{ expression: "make up my mind", quote: "made up my mind", exact: true, span: span("made up my mind") }],
  highlights: [],
  errors: [],
  mainError: null,
  thenNow: [],
  counts: { errors: 0, highlights: 0, hesitations: 0, expressionsUsed: 1, expressionsListed: 1, thenNow: 0 },
  coverage: { analysedSeconds: 30, truncated: false },
  dropped: { expressions: 0, highlights: 0, errors: 0, thenNow: 0 },
};

const done = (over: Partial<Extract<AnalysisStatusBody, { status: "done" }>> = {}): AnalysisStatusBody => ({
  ok: true,
  status: "done",
  transcript: TRANSCRIPT,
  result: stored,
  baseline: null,
  ...over,
});

describe("finalAnalysisView", () => {
  it("reads a finished final analysis (positive control)", () => {
    const v = finalAnalysisView(done());
    expect(v.kind).toBe("done");
    if (v.kind !== "done") return;
    expect(v.analysis.kind).toBe("final");
    expect(v.transcript).toBe(TRANSCRIPT);
    expect(v.baseline).toBeNull();
  });

  it("carries the first take's feedback when it reads", () => {
    const first = { ...stored, kind: "first", goal: "Use the past.", goalReached: null, nextStep: null };
    const v = finalAnalysisView(done({ baseline: { transcript: TRANSCRIPT, result: first } }));
    expect(v.kind === "done" && v.baseline?.analysis.kind).toBe("first");
  });

  it("drops an unreadable baseline but keeps the final", () => {
    const v = finalAnalysisView(done({ baseline: { transcript: TRANSCRIPT, result: { nope: true } } }));
    expect(v.kind === "done" && v.baseline).toBeNull();
  });

  it("a result that is not an analysis is a failure, never half a page", () => {
    expect(finalAnalysisView(done({ result: { nope: true } }))).toEqual({ kind: "failed" });
    expect(finalAnalysisView(done({ result: null }))).toEqual({ kind: "failed" });
  });

  it("maps every other state, and draws nothing for none or off", () => {
    const status = (s: string) => finalAnalysisView({ ok: true, status: s } as AnalysisStatusBody);
    expect(status("pending")).toEqual({ kind: "working" });
    expect(status("transcribing")).toEqual({ kind: "working" });
    expect(status("analysing")).toEqual({ kind: "working" });
    expect(status("failed")).toEqual({ kind: "failed" });
    expect(status("withdrawn")).toEqual({ kind: "withdrawn" });
    expect(status("paused")).toEqual({ kind: "paused" });
    expect(status("limit")).toEqual({ kind: "limit" });
    expect(status("none")).toEqual({ kind: "none" });
    expect(status("off")).toEqual({ kind: "none" });
    expect(finalAnalysisView(null)).toEqual({ kind: "none" });
  });
});
