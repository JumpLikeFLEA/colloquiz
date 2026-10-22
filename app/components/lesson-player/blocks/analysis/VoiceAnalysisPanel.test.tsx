import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceAnalysisPanel } from "./VoiceAnalysisPanel";

/**
 * VOICE-014 (docs/decisions/0189): the learner's AI feedback view, state by state, with the
 * status route faked. The result below is shaped like what validate.ts stores.
 */

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const TRANSCRIPT = "Yesterday I go to the shop. Um, I made my mind and I bought a <b>red</b> coat.";
const at = (quote: string) => {
  const start = TRANSCRIPT.indexOf(quote);
  return { start, end: start + quote.length };
};

function result(over: Record<string, unknown> = {}) {
  return {
    v: 1,
    kind: "first",
    summary: "You told a clear story.",
    howItSounds: "Warm and a little hesitant.",
    goal: "Use the past simple two times.",
    goalReached: null,
    nextStep: null,
    expressionsUsed: [{ expression: "make up my mind", quote: "made my mind", exact: false, span: at("made my mind") }],
    highlights: [
      { quote: "Um,", kind: "hesitation", note: "A short pause.", span: at("Um,") },
      { quote: "a <b>red</b> coat", kind: "strength", note: "A good phrase with <i>markup</i>.", span: at("a <b>red</b> coat") },
    ],
    errors: [
      { quote: "I go", category: "grammar", correction: "I went", explanation: "It happened yesterday.", span: at("I go") },
      { quote: "made my mind", category: "collocation", correction: "made up my mind", explanation: "Say make up.", span: at("made my mind") },
    ],
    mainError: 0,
    thenNow: [],
    counts: { errors: 2, highlights: 2, hesitations: 1, expressionsUsed: 1, expressionsListed: 3, thenNow: 0 },
    coverage: { analysedSeconds: 40, truncated: false },
    dropped: { expressions: 0, highlights: 0, errors: 0, thenNow: 0 },
    ...over,
  };
}

const done = (r: unknown = result(), baseline: unknown = null) => ({
  ok: true,
  status: "done",
  transcript: TRANSCRIPT,
  result: r,
  baseline,
});

/** Renders the panel and lets the first poll settle. */
async function show(body: unknown, props: { cohort?: boolean; listenFor?: string[] } = {}) {
  const fetchStatus = vi.fn().mockResolvedValue(body);
  render(<VoiceAnalysisPanel submissionId="t1" cohort={props.cohort ?? false} listenFor={props.listenFor} fetchStatus={fetchStatus} />);
  await act(async () => {});
  return fetchStatus;
}

describe("a finished analysis", () => {
  it("is labelled AI feedback and shows what worked, the count cards and the goal", async () => {
    await show(done());
    expect(screen.getByRole("region", { name: "AI feedback" })).toBeTruthy();
    expect(screen.getByText("You told a clear story.")).toBeTruthy();
    expect(screen.getByText("Errors").previousElementSibling?.textContent).toBe("2");
    expect(screen.getByText("Your goal for next time")).toBeTruthy();
    expect(screen.getByText("Use the past simple two times.")).toBeTruthy();
    expect(screen.getByText(/It is not a grade/)).toBeTruthy();
  });

  it("draws markup inside a quote and a note as text, never as elements", async () => {
    await show(done());
    const container = document.body;
    // The quote "a <b>red</b> coat" is a marked phrase whose text is those characters.
    const mark = screen.getByRole("button", { name: "a <b>red</b> coat" });
    expect(mark.textContent).toBe("a <b>red</b> coat");
    fireEvent.click(mark);
    expect(screen.getByText(/A good phrase with <i>markup<\/i>\./)).toBeTruthy();
    // Nothing the stored text contained became an element.
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("i")).toBeNull();
  });

  it("explains a phrase on tap, and the same tap again closes it", async () => {
    await show(done());
    expect(screen.getByText("Tap a marked phrase to see why.")).toBeTruthy();
    const mark = screen.getByRole("button", { name: "I go" });
    expect(mark.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(mark);
    expect(mark.getAttribute("aria-pressed")).toBe("true");
    const live = document.querySelector("[aria-live=polite]")!;
    expect(live.textContent).toContain("It happened yesterday.");
    expect(live.textContent).toContain("Better: “I went”");
    fireEvent.click(mark);
    expect(live.textContent).not.toContain("It happened yesterday.");
    expect(screen.getByText("Tap a marked phrase to see why.")).toBeTruthy();
  });

  it("keeps the whole transcript, marked or not", async () => {
    await show(done());
    const words = screen.getByText(/Yesterday/).closest("p")!;
    expect(words.textContent).toBe(TRANSCRIPT);
  });

  it("names the main error and lists every error under a disclosure", async () => {
    await show(done());
    expect(screen.getByText("One thing to fix")).toBeTruthy();
    expect(screen.getByText("All errors (2)")).toBeTruthy();
  });

  it("names the expressions not used yet when the task's list is given, and not when it is withheld", async () => {
    await show(done(), { listenFor: ["make up my mind", "give it a go"] });
    expect(screen.getByText(/Not used yet:/).textContent).toContain("give it a go");
    cleanup();
    await show(done());
    expect(screen.queryByText(/Not used yet:/)).toBeNull();
  });

  it("shows a final's goal verdict, pairs, next step and the first take's feedback collapsed", async () => {
    const first = result({ summary: "A first try." });
    const finalResult = result({
      kind: "final",
      goal: null,
      goalReached: { status: "partly", note: "You did it once." },
      nextStep: "Keep telling short stories.",
      thenNow: [
        { then: "I go", now: "I bought", note: "Past tense now.", thenSpan: at("I go"), nowSpan: at("I bought") },
      ],
      errors: [result().errors[0]],
      mainError: 0,
      counts: { errors: 1, highlights: 2, hesitations: 1, expressionsUsed: 1, expressionsListed: 3, thenNow: 1 },
    });
    await show(done(finalResult, { transcript: TRANSCRIPT, result: first }));
    expect(screen.getByText("Partly there")).toBeTruthy();
    expect(screen.getByText("You did it once.")).toBeTruthy();
    expect(screen.getByText("Then and now")).toBeTruthy();
    expect(screen.getByText("Keep telling short stories.")).toBeTruthy();
    // The stat delta: errors went from 2 to 1.
    expect(screen.getAllByText("was 2").length).toBeGreaterThan(0);
    const day1 = screen.getByText("Day 1 feedback").closest("details")!;
    expect(day1.hasAttribute("open")).toBe(false);
    expect(day1.textContent).toContain("A first try.");
  });

  it("shows a result that does not read as an analysis as a failure, not a half page", async () => {
    await show(done({ nonsense: true }));
    expect(screen.getByText("We couldn't make feedback for this recording")).toBeTruthy();
  });
});

describe("every other state", () => {
  it("analysing: a status line, and nothing else", async () => {
    await show({ ok: true, status: "analysing" });
    expect(screen.getByRole("status").textContent).toContain("Reading what you said");
    expect(screen.queryByText("What worked")).toBeNull();
  });

  it("failed: says it does not count towards the limit", async () => {
    await show({ ok: true, status: "failed" });
    expect(screen.getByText("We couldn't make feedback for this recording")).toBeTruthy();
    expect(screen.getByText(/doesn't count towards your limit/)).toBeTruthy();
  });

  it("withdrawn: 'send again'", async () => {
    await show({ ok: true, status: "withdrawn" });
    expect(screen.getByText("Feedback withdrawn — send again")).toBeTruthy();
  });

  it("paused", async () => {
    await show({ ok: true, status: "paused" });
    expect(screen.getByText("AI feedback is paused")).toBeTruthy();
  });

  it("limit on a cohort course says the teacher will still answer; on a self-paced one it does not", async () => {
    await show({ ok: true, status: "limit" }, { cohort: true });
    expect(screen.getByText("AI limit reached; your teacher will still answer.")).toBeTruthy();
    cleanup();
    await show({ ok: true, status: "limit" }, { cohort: false });
    expect(screen.queryByText(/teacher will still answer/)).toBeNull();
    expect(screen.getByText(/reached the limit for this task/)).toBeTruthy();
  });

  it("draws nothing when the mode is off or there is no analysis", async () => {
    await show({ ok: true, status: "off" });
    expect(screen.queryByRole("region")).toBeNull();
    cleanup();
    await show({ ok: true, status: "none" });
    expect(screen.queryByRole("region")).toBeNull();
  });
});

describe("polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  function setHidden(hidden: boolean) {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event("visibilitychange"));
  }

  afterEach(() => setHidden(false));

  it("polls on a growing wait until the analysis is done, then stops", async () => {
    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: "pending" })
      .mockResolvedValueOnce({ ok: true, status: "analysing" })
      .mockResolvedValue(done());
    render(<VoiceAnalysisPanel submissionId="t1" cohort={false} fetchStatus={fetchStatus} />);
    await act(async () => {});
    expect(fetchStatus).toHaveBeenCalledTimes(1);

    await act(async () => void (await vi.advanceTimersByTimeAsync(1999)));
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    await act(async () => void (await vi.advanceTimersByTimeAsync(1)));
    expect(fetchStatus).toHaveBeenCalledTimes(2);
    await act(async () => void (await vi.advanceTimersByTimeAsync(2000)));
    expect(fetchStatus).toHaveBeenCalledTimes(3);
    expect(screen.getByText("You told a clear story.")).toBeTruthy();

    await act(async () => void (await vi.advanceTimersByTimeAsync(60_000)));
    expect(fetchStatus).toHaveBeenCalledTimes(3);
  });

  it("asks for nothing while the tab is hidden and asks at once when it is shown again", async () => {
    const fetchStatus = vi.fn().mockResolvedValue({ ok: true, status: "analysing" });
    render(<VoiceAnalysisPanel submissionId="t1" cohort={false} fetchStatus={fetchStatus} />);
    await act(async () => {});
    expect(fetchStatus).toHaveBeenCalledTimes(1);

    act(() => setHidden(true));
    await act(async () => void (await vi.advanceTimersByTimeAsync(120_000)));
    expect(fetchStatus).toHaveBeenCalledTimes(1);

    act(() => setHidden(false));
    await act(async () => {});
    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });

  it("does not ask at all when it mounts in a hidden tab, and starts when shown", async () => {
    setHidden(true);
    const fetchStatus = vi.fn().mockResolvedValue({ ok: true, status: "analysing" });
    render(<VoiceAnalysisPanel submissionId="t1" cohort={false} fetchStatus={fetchStatus} />);
    await act(async () => void (await vi.advanceTimersByTimeAsync(30_000)));
    expect(fetchStatus).not.toHaveBeenCalled();
    act(() => setHidden(false));
    await act(async () => {});
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  it("gives up after five minutes and says the feedback will be here later", async () => {
    const fetchStatus = vi.fn().mockResolvedValue({ ok: true, status: "analysing" });
    render(<VoiceAnalysisPanel submissionId="t1" cohort={false} fetchStatus={fetchStatus} />);
    await act(async () => {});
    await act(async () => void (await vi.advanceTimersByTimeAsync(6 * 60_000)));
    expect(screen.getByText(/taking longer than usual/)).toBeTruthy();
    const calls = fetchStatus.mock.calls.length;
    await act(async () => void (await vi.advanceTimersByTimeAsync(5 * 60_000)));
    expect(fetchStatus.mock.calls.length).toBe(calls);
  });

  it("keeps trying after a failed request and says so, then recovers", async () => {
    const fetchStatus = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(done());
    render(<VoiceAnalysisPanel submissionId="t1" cohort={false} fetchStatus={fetchStatus} />);
    await act(async () => {});
    expect(screen.getByText(/Couldn't check for your feedback/)).toBeTruthy();
    await act(async () => void (await vi.advanceTimersByTimeAsync(2000)));
    expect(screen.getByText("You told a clear story.")).toBeTruthy();
    expect(screen.queryByText(/Couldn't check for your feedback/)).toBeNull();
  });
});
