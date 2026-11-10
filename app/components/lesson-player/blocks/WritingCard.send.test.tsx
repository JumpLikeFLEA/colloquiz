import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WritingTaskBlock } from "@/lib/lessons";
import { createDraftStore, writingDraftKey } from "@/lib/writing/draftStore";
import { PRACTICE_STATE, type WritingTaskState } from "@/lib/writing/state";
import { WritingTaskBlockView } from "./WritingTaskBlock";

/**
 * WRITE-002 (docs/decisions/0225) — the writing card's send states: Send,
 * Sending, "Sent. Waiting for feedback.", unsent changes with Send again,
 * locked with the feedback, refused (falls back to practice), and retry. A
 * successful send clears the browser draft.
 */

const block: WritingTaskBlock = {
  id: "w1",
  kind: "task",
  type: "writing",
  prompt: [{ text: "Write about your day." }],
  sendToTeacher: true,
};
const PATH = "/courses/c/l";
const KEY = writingDraftKey(PATH, "w1");
const ctx = (state: WritingTaskState) => ({ lessonId: "lesson-1", blocks: { w1: state } });
const cohort: WritingTaskState = { route: "cohort", locked: false, submission: null, feedback: null };
const sentState: WritingTaskState = {
  route: "linked",
  locked: false,
  submission: { id: "s1", body: "I went home.", updatedAt: "2026-11-10T10:00:00Z" },
  feedback: null,
};

function mockFetch(impl: () => Promise<Response> | Response) {
  const fn = vi.fn(async () => impl());
  vi.stubGlobal("fetch", fn);
  return fn;
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function renderCard(state: WritingTaskState | undefined) {
  return render(
    <WritingTaskBlockView block={block} lessonPath={PATH} context={state ? ctx(state) : undefined} />,
  );
}
const box = () => screen.getByRole("textbox") as HTMLTextAreaElement;

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WritingCard — send states", () => {
  it("practice mode (no route): no Send button and the practice note", () => {
    renderCard(PRACTICE_STATE);
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    expect(screen.getByText(/Practice: your answer stays on this device/)).toBeTruthy();
  });

  it("practice mode with no context at all (a visitor, the preview)", () => {
    renderCard(undefined);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("practice mode when the author left the tick off, even with a route", () => {
    render(
      <WritingTaskBlockView
        block={{ ...block, sendToTeacher: false }}
        lessonPath={PATH}
        context={ctx(cohort)}
      />,
    );
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });

  it("Send is disabled until there is text, and names the authors on the cohort route", () => {
    renderCard(cohort);
    const send = screen.getByRole("button", { name: "Send" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(screen.getByText(/goes to the authors of this course/)).toBeTruthy();
    fireEvent.change(box(), { target: { value: "Hello" } });
    expect(send.disabled).toBe(false);
  });

  it("names the teacher on the linked route", () => {
    renderCard({ ...cohort, route: "linked" });
    expect(screen.getByText(/goes to your teacher/)).toBeTruthy();
  });

  it("Sending, then 'Sent. Waiting for feedback.'; posts the normalised body; clears the draft", async () => {
    let resolve: (r: Response) => void = () => {};
    const fetchFn = mockFetch(() => new Promise<Response>((r) => (resolve = r)));
    renderCard(cohort);
    // (jsdom already turns a textarea's CRLF into LF; the CRLF rule is tested in lib/writing/answer.test.ts.)
    fireEvent.change(box(), { target: { value: "  Hello\nworld  " } });
    // A draft was being kept for the unsent text.
    await waitFor(() => expect(createDraftStore(KEY).read()).toBe("  Hello\nworld  "), { timeout: 2000 });

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect((await screen.findByRole("button", { name: "Sending…" }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const call = fetchFn.mock.calls[0] as unknown as [string, { body: string }];
    expect(call[0]).toBe("/api/writing/submissions");
    expect(JSON.parse(call[1].body)).toEqual({ lessonId: "lesson-1", blockId: "w1", body: "Hello\nworld" });

    await act(async () => resolve(json(200, { ok: true, submissionId: "s1", route: "cohort", resent: false })));
    expect(await screen.findByText("Sent. Waiting for feedback.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Send/ })).toBeNull();
    expect(createDraftStore(KEY).read()).toBe("");
    expect(box().value).toBe("Hello\nworld");
  });

  it("an answer sent earlier shows as sent; editing it shows unsent changes and Send again", () => {
    renderCard(sentState);
    expect(box().value).toBe("I went home.");
    expect(screen.getByText("Sent. Waiting for feedback.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Send/ })).toBeNull();

    fireEvent.change(box(), { target: { value: "I went home late." } });
    expect(screen.getByText("You have changes that are not sent yet.")).toBeTruthy();
    expect(screen.queryByText("Sent. Waiting for feedback.")).toBeNull();
    expect(screen.getByRole("button", { name: "Send again" })).toBeTruthy();

    fireEvent.change(box(), { target: { value: "I went home." } });
    expect(screen.getByText("Sent. Waiting for feedback.")).toBeTruthy();
  });

  it("locked: the answer is read-only with the feedback under it and no way to send", () => {
    renderCard({
      route: "linked",
      locked: true,
      submission: sentState.submission,
      feedback: { body: { paragraphs: [{ runs: [{ text: "Nice " }, { text: "work", bold: true }] }] }, publishedAt: "2026-11-10T11:00:00Z" },
    });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("I went home.")).toBeTruthy();
    expect(screen.getByText("Feedback")).toBeTruthy();
    expect(screen.getByText("work").tagName).toBe("STRONG");
    expect(screen.getByText(/can't be changed/)).toBeTruthy();
  });

  it("refused (the route is gone): falls back to practice, keeps the text and the draft", async () => {
    mockFetch(() => json(403, { ok: false, error: "no_route" }));
    renderCard(cohort);
    fireEvent.change(box(), { target: { value: "Keep me" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/Sending isn't available for this task right now/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Send/ })).toBeNull();
    expect(screen.getByText(/Practice: your answer stays on this device/)).toBeTruthy();
    expect(box().value).toBe("Keep me");
  });

  it("refused as locked (feedback arrived meanwhile) also falls back to practice", async () => {
    mockFetch(() => json(409, { ok: false, error: "locked" }));
    renderCard(sentState);
    fireEvent.change(box(), { target: { value: "Late edit" } });
    fireEvent.click(screen.getByRole("button", { name: "Send again" }));
    expect(await screen.findByText(/Sending isn't available/)).toBeTruthy();
  });

  it("a network failure shows the error with Try again; the retry can succeed", async () => {
    const fetchFn = vi.fn();
    fetchFn.mockRejectedValueOnce(new TypeError("offline"));
    fetchFn.mockResolvedValueOnce(json(200, { ok: true, submissionId: "s1", route: "cohort", resent: false }));
    vi.stubGlobal("fetch", fetchFn);
    renderCard(cohort);
    fireEvent.change(box(), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/Couldn't send your answer/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Sent. Waiting for feedback.")).toBeTruthy();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("a 500 is a retry, not a fallback: the learner keeps Send", async () => {
    mockFetch(() => json(500, { ok: false, error: "internal" }));
    renderCard(cohort);
    fireEvent.change(box(), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByText(/Sending isn't available/)).toBeNull();
  });
});
