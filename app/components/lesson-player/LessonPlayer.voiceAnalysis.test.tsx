import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceTaskBlockView } from "./blocks/VoiceTaskBlock";
import type { VoiceTaskBlock } from "@/lib/lessons";
import type { VoiceTasksContext } from "@/lib/voice/taskContext";

/**
 * VOICE-014 (docs/decisions/0189): how the voice task card uses the AI feedback view. The view's
 * own states are in blocks/analysis/VoiceAnalysisPanel.test.tsx; here: when it appears, the
 * "Try to use" list, and a send refused for a cap.
 */

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "jwt" } } }) } }),
}));

const upload = vi.fn();
const submit = vi.fn();
vi.mock("@/lib/voice/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/voice/send")>()),
  uploadVoiceTake: (...args: unknown[]) => upload(...args),
  postVoiceSubmission: (...args: unknown[]) => submit(...args),
}));

const base = { id: "v1", kind: "task", type: "voice", prompt: [{ text: "Tell us about your week." }], maxSeconds: 150 };
const withList = (compare?: "before" | "after") =>
  ({ ...base, compare, listenFor: ["make up my mind", "give it a go"] }) as unknown as VoiceTaskBlock;

const sentIn = (over: Partial<Extract<VoiceTasksContext, { mode: "send" }>> = {}): VoiceTasksContext => ({
  mode: "send",
  analysis: true,
  slot: "enrolment",
  lessonId: "33333333-3333-4333-8333-333333333333",
  courseId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  submissions: { v1: { id: "s1", playbackUrl: "https://signed/x", removed: false, feedback: null } },
  ...over,
});

const TRANSCRIPT = "I made my mind.";
const DONE = {
  ok: true,
  status: "done",
  transcript: TRANSCRIPT,
  baseline: null,
  result: {
    v: 1,
    kind: "first",
    summary: "A clear start.",
    howItSounds: "Calm.",
    goal: "Use make up my mind.",
    goalReached: null,
    nextStep: null,
    expressionsUsed: [],
    highlights: [],
    errors: [{ quote: "made my mind", category: "collocation", correction: "made up my mind", explanation: "Say make up.", span: { start: 2, end: 14 } }],
    mainError: 0,
    thenNow: [],
    counts: { errors: 1, highlights: 0, hesitations: 0, expressionsUsed: 0, expressionsListed: 2, thenNow: 0 },
    coverage: { analysedSeconds: 5, truncated: false },
    dropped: { expressions: 0, highlights: 0, errors: 0, thenNow: 0 },
  },
};

class FakeRecorder {
  static isTypeSupported = () => true;
  mimeType = "audio/ogg";
  state = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob([new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 2, 0, 0])]) });
    this.onstop?.();
  }
}

function installMedia() {
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
  });
  URL.createObjectURL = vi.fn(() => "blob:take");
  URL.revokeObjectURL = vi.fn();
}


const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => DONE });
  vi.stubGlobal("fetch", fetchMock);
  upload.mockReset().mockResolvedValue("uploaded");
  submit.mockReset().mockResolvedValue({ status: 200, error: null });
  installMedia();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("the AI feedback view in the voice task card", () => {
  it("appears under a sent take while the analysis is on, next to the author's published feedback", async () => {
    render(
      <VoiceTaskBlockView
        block={withList("after")}
        context={sentIn({
          submissions: {
            v1: {
              id: "s1",
              playbackUrl: "https://signed/x",
              removed: false,
              feedback: { paragraphs: [{ runs: [{ text: "Nice " }, { text: "pace", bold: true }] }] },
            },
          },
        })}
      />,
    );
    expect(await screen.findByText("A clear start.")).toBeDefined();
    expect(screen.getByRole("region", { name: "AI feedback" })).toBeDefined();
    expect(screen.getByText("pace").tagName).toBe("STRONG");
    expect(fetchMock).toHaveBeenCalledWith("/api/voice/submissions/s1/analysis", expect.anything());
  });

  it("does not exist while the analysis is off: no panel, no request, no list (control: it does when on)", async () => {
    const { rerender } = render(<VoiceTaskBlockView block={withList("after")} context={sentIn({ analysis: false })} />);
    expect(screen.getByText("Sent. Waiting for feedback.")).toBeDefined();
    expect(screen.queryByText("Try to use")).toBeNull();
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "AI feedback" })).toBeNull();

    rerender(<VoiceTaskBlockView block={withList("after")} context={sentIn({ analysis: true })} />);
    expect(await screen.findByRole("region", { name: "AI feedback" })).toBeDefined();
    expect(screen.getByText("Try to use")).toBeDefined();
  });

  it("is not drawn for a practice learner", async () => {
    render(<VoiceTaskBlockView block={withList("after")} context={{ mode: "practice", analysis: true }} />);
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    // The list still helps them practise.
    expect(screen.getByText("Try to use")).toBeDefined();
  });

  it("a self-paced learner reads 'Sent.', a cohort learner still reads 'Waiting for feedback'", async () => {
    render(<VoiceTaskBlockView block={withList()} context={sentIn({ slot: "self_paced" })} />);
    expect(screen.getByText("Sent.")).toBeDefined();
    expect(screen.queryByText("Sent. Waiting for feedback.")).toBeNull();
    cleanup();
    render(<VoiceTaskBlockView block={withList()} context={sentIn({ slot: "enrolment" })} />);
    expect(screen.getByText("Sent. Waiting for feedback.")).toBeDefined();
  });
});

describe("Try to use", () => {
  it("lists the author's expressions on a task that is not a before task", () => {
    for (const compare of [undefined, "after"] as const) {
      render(<VoiceTaskBlockView block={withList(compare)} context={sentIn({ submissions: {} })} />);
      const list = screen.getByText("Try to use").parentElement!;
      expect(list.textContent).toContain("make up my mind");
      expect(list.textContent).toContain("give it a go");
      cleanup();
    }
  });

  it("is withheld on a before task, so the baseline is honest", () => {
    render(<VoiceTaskBlockView block={withList("before")} context={sentIn({ submissions: {} })} />);
    expect(screen.queryByText("Try to use")).toBeNull();
    expect(screen.queryByText("make up my mind")).toBeNull();
  });

  it("is absent when the author listed nothing, and without a context", () => {
    render(<VoiceTaskBlockView block={base as unknown as VoiceTaskBlock} context={sentIn({ submissions: {} })} />);
    expect(screen.queryByText("Try to use")).toBeNull();
    cleanup();
    render(<VoiceTaskBlockView block={withList("after")} />);
    expect(screen.queryByText("Try to use")).toBeNull();
  });
});

describe("a send refused for a cap", () => {
  async function recordAndSend() {
    render(<VoiceTaskBlockView block={withList()} context={sentIn({ slot: "self_paced", submissions: {} })} />);
    fireEvent.click(await screen.findByRole("button", { name: "Record" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    await screen.findByRole("button", { name: "Record again" });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send this take" })));
  }

  it("the per-task limit: says the recording was not sent, and keeps the take", async () => {
    submit.mockResolvedValueOnce({ status: 429, error: "voice_cap", cap: { kind: "task_cap", retryAt: null } });
    await recordAndSend();
    expect(await screen.findByText(/was not sent/)).toBeDefined();
    expect(screen.getByText(/limit\. Your last feedback stays/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Send this take" })).toBeDefined();
    expect(screen.queryByText(/Sending failed/)).toBeNull();
  });

  it("the daily limit: says when a place frees up", async () => {
    submit.mockResolvedValueOnce({
      status: 429,
      error: "voice_cap",
      cap: { kind: "daily_cap", retryAt: "2026-10-22T18:07:26.342Z" },
    });
    await recordAndSend();
    expect(await screen.findByText(/today's limit/)).toBeDefined();
    expect(screen.getByText(/You can send again after/)).toBeDefined();
  });

  it("control: a plain server error is still 'try again', not a cap message", async () => {
    submit.mockResolvedValueOnce({ status: 500, error: "internal" });
    await recordAndSend();
    expect(await screen.findByText(/Sending failed/)).toBeDefined();
    expect(screen.queryByText(/was not sent/)).toBeNull();
  });
});
