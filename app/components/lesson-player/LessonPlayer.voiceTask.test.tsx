import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLAYGROUND_EXAMPLES } from "@/lib/items/__fixtures__/playgroundExamples";
import { LessonPlayer, practiceRenderer } from "@/app/components/lesson-player";
import { VoiceTaskBlockView } from "./blocks/VoiceTaskBlock";
import type { VoiceTaskBlock } from "@/lib/lessons";
import type { VoiceTasksContext } from "@/lib/voice/taskContext";

/**
 * VOICE-003 — a voice task is not counted as an exercise, and without a
 * context (the admin preview) it is a placeholder.
 * VOICE-005 — the recorder's states (docs/decisions/0111).
 */

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "jwt" } } }) },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
}));

const upload = vi.fn();
const submit = vi.fn();
vi.mock("@/lib/voice/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/voice/send")>()),
  uploadVoiceTake: (...args: unknown[]) => upload(...args),
  postVoiceSubmission: (...args: unknown[]) => submit(...args),
}));

const raw = PLAYGROUND_EXAMPLES.find((e) => e.label === "selection — MCQ single")!.raw;
const voice = { id: "v1", kind: "task", type: "voice", prompt: [{ text: "Tell us about your week." }], maxSeconds: 150, compare: "before" };
const document = [voice, { ...(raw as Record<string, unknown>), kind: "practice" }];
const block = voice as unknown as VoiceTaskBlock;

const COURSE = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const LESSON = "33333333-3333-4333-8333-333333333333";
const send = (submissions: Extract<VoiceTasksContext, { mode: "send" }>["submissions"] = {}): VoiceTasksContext => ({
  mode: "send",
  lessonId: LESSON,
  courseId: COURSE,
  userId: USER,
  submissions,
});

// A MediaRecorder that hands back an Ogg take with an empty MIME, as
// Firefox 157 did in 0097.
class FakeRecorder {
  static isTypeSupported = (t: string) => t === "audio/ogg;codecs=opus";
  static last: FakeRecorder | null = null;
  mimeType = "";
  state = "inactive";
  options: unknown;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_stream: unknown, options: unknown) {
    this.options = options;
    FakeRecorder.last = this;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob([new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 2, 0, 0])]) });
    this.onstop?.();
  }
}

function installMedia({ allow = true } = {}) {
  const track = { stop: vi.fn() };
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: allow
        ? vi.fn().mockResolvedValue({ getTracks: () => [track] })
        : vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")),
    },
  });
  URL.createObjectURL = vi.fn(() => "blob:take");
  URL.revokeObjectURL = vi.fn();
  return track;
}

beforeEach(() => {
  upload.mockReset().mockResolvedValue("uploaded");
  submit.mockReset().mockResolvedValue({ status: 200, error: null });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "mediaDevices");
});

async function record() {
  fireEvent.click(await screen.findByRole("button", { name: "Record" }));
  fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
  await screen.findByRole("button", { name: "Record again" });
}

describe("LessonPlayer — voice task", () => {
  it("without a context (admin preview): the prompt, the limit and a disabled Record button", async () => {
    render(<LessonPlayer document={document} attemptId="a1" practiceRenderer={practiceRenderer} />);

    expect(await screen.findByText("Voice task")).toBeDefined();
    expect(screen.getByText("Tell us about your week.")).toBeDefined();
    expect(screen.getByText("Up to 2 min 30 s")).toBeDefined();
    const button = screen.getByRole("button", { name: "Record" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("Learners record here on the lesson page.")).toBeDefined();
  });

  it("numbers only the practice block: the one exercise is 'Exercise 1 of 1'", () => {
    render(<LessonPlayer document={document} attemptId="a1" practiceRenderer={practiceRenderer} />);

    expect(screen.getByText("Exercise 1 of 1")).toBeDefined();
    expect(screen.queryByText(/Exercise 2/)).toBeNull();
  });

  it("passes the page's context through to the recorder", async () => {
    installMedia();
    render(
      <LessonPlayer document={document} attemptId="a1" practiceRenderer={practiceRenderer} voiceTasks={{ mode: "practice" }} />,
    );
    expect(await screen.findByText(/stays on this device/)).toBeDefined();
  });
});

describe("VoiceRecorder (VOICE-005)", () => {
  it("unsupported browser (no MediaRecorder): the open-in-your-browser fallback", () => {
    render(<VoiceTaskBlockView block={block} context={send()} />);
    expect(screen.getByText(/Open this page in Safari or Chrome/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Record" })).toBeNull();
  });

  it("practice: record and listen, nothing is uploaded or submitted, no Send", async () => {
    const track = installMedia();
    const { container } = render(<VoiceTaskBlockView block={block} context={{ mode: "practice" }} />);
    await record();

    expect(container.querySelector("audio")?.getAttribute("src")).toBe("blob:take");
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    expect(track.stop).toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("requests 32 kbps and the first supported type", async () => {
    installMedia();
    render(<VoiceTaskBlockView block={block} context={{ mode: "practice" }} />);
    fireEvent.click(await screen.findByRole("button", { name: "Record" }));
    await screen.findByRole("button", { name: "Stop" });
    expect(FakeRecorder.last?.options).toEqual({ audioBitsPerSecond: 32000, mimeType: "audio/ogg;codecs=opus" });
  });

  it("send: uploads only on Send, as audio/ogg read from the bytes, under {course}/{user}/{id}.ogg, then shows 'waiting'", async () => {
    installMedia();
    render(<VoiceTaskBlockView block={block} context={send()} />);
    await record();
    expect(upload).not.toHaveBeenCalled();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })));

    expect(upload).toHaveBeenCalledTimes(1);
    const args = upload.mock.calls[0][0] as { contentType: string; objectName: string; accessToken: string };
    expect(args.contentType).toBe("audio/ogg");
    expect(args.accessToken).toBe("jwt");
    expect(args.objectName).toMatch(new RegExp(`^${COURSE}/${USER}/[0-9a-f-]{36}\\.ogg$`));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ lessonId: LESSON, blockId: "v1", objectName: args.objectName }));
    expect(await screen.findByText("Sent. Waiting for feedback.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Record again" })).toBeDefined();
  });

  it("a failed upload offers Try again, which retries the same take and name", async () => {
    installMedia();
    upload.mockRejectedValueOnce(new Error("network"));
    render(<VoiceTaskBlockView block={block} context={send()} />);
    await record();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })));
    expect(await screen.findByText(/Sending failed/)).toBeDefined();
    expect(submit).not.toHaveBeenCalled();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[1][0].objectName).toBe(upload.mock.calls[0][0].objectName);
    expect(await screen.findByText("Sent. Waiting for feedback.")).toBeDefined();
  });

  it("a refusal (not enrolled) falls back to practice", async () => {
    installMedia();
    submit.mockResolvedValueOnce({ status: 403, error: "not_enrolled" });
    render(<VoiceTaskBlockView block={block} context={send()} />);
    await record();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })));

    expect(await screen.findByText(/can't be sent from this account/)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });

  it("denied microphone: says so, and Record stays available", async () => {
    installMedia({ allow: false });
    render(<VoiceTaskBlockView block={block} context={send()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Record" }));
    expect(await screen.findByText(/Microphone access is blocked/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Record" })).toBeDefined();
  });

  it("sent, no feedback yet: own playback and 'waiting for feedback', re-record allowed", () => {
    installMedia();
    const { container } = render(
      <VoiceTaskBlockView
        block={block}
        context={send({ v1: { id: "s1", playbackUrl: "https://signed/x", removed: false, feedback: null } })}
      />,
    );
    expect(container.querySelector("audio")?.getAttribute("src")).toBe("https://signed/x");
    expect(screen.getByText("Sent. Waiting for feedback.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Record again" })).toBeDefined();
  });

  it("feedback published: shown under the recording, bold kept, and the block is locked", () => {
    installMedia();
    render(
      <VoiceTaskBlockView
        block={block}
        context={send({
          v1: {
            id: "s1",
            playbackUrl: "https://signed/x",
            removed: false,
            feedback: { paragraphs: [{ runs: [{ text: "Good " }, { text: "pace", bold: true }] }] },
          },
        })}
      />,
    );
    expect(screen.getByText("Feedback")).toBeDefined();
    expect(screen.getByText("pace").tagName).toBe("STRONG");
    expect(screen.getByText(/can't be replaced/)).toBeDefined();
    expect(screen.queryByRole("button", { name: /Record/ })).toBeNull();
    expect(screen.queryByText("Sent. Waiting for feedback.")).toBeNull();
  });
});
