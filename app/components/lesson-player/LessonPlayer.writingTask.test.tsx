import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PLAYGROUND_EXAMPLES } from "@/lib/items/__fixtures__/playgroundExamples";
import { LessonPlayer, practiceRenderer } from "@/app/components/lesson-player";
import { WRITING_ANSWER_MAX_CHARS } from "@/lib/lessons";
import { writingDraftKey } from "@/lib/writing/draftStore";

/**
 * WRITE-001 (docs/decisions/0225) — a writing task is a card, not an exercise:
 * not numbered, not counted in the strip, outside the score; its draft stays
 * in this browser.
 */

const raw = PLAYGROUND_EXAMPLES.find((e) => e.label === "selection — MCQ single")!.raw;
const writing = (id: string, sendToTeacher: boolean) => ({
  id,
  kind: "task",
  type: "writing",
  prompt: [{ text: "Situation 1.\nSituation 2." }],
  sendToTeacher,
});
const document = [writing("w1", true), { ...(raw as Record<string, unknown>), kind: "practice" }, writing("w2", false)];
const PATH = "/courses/c/l";

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("LessonPlayer — writing task", () => {
  it("is not numbered or counted: one exercise, one pill, and it renders both tasks", async () => {
    let progress: { answered: number; total: number } | null = null;
    render(
      <LessonPlayer
        document={document}
        attemptId="a"
        practiceRenderer={practiceRenderer}
        lessonPath={PATH}
        renderProgress={(p) => {
          progress = p;
          return null;
        }}
      />,
    );
    expect(await screen.findAllByText("Writing task")).toHaveLength(2);
    expect(await screen.findAllByText(/Exercise \d+ of \d+/)).toHaveLength(1);
    expect(screen.getByText(/Exercise 1 of 1/)).toBeTruthy();
    expect(progress).toMatchObject({ answered: 0, total: 1 });
  });

  it("draws the prompt with its line break, a growing textarea, the cap, the counter and the practice note", async () => {
    render(<LessonPlayer document={document} attemptId="a" lessonPath={PATH} />);
    const [first] = await screen.findAllByRole("textbox");
    expect(first.getAttribute("maxlength")).toBe(String(WRITING_ANSWER_MAX_CHARS));
    expect(screen.getAllByText("Practice: your answer stays on this device.")).toHaveLength(2);
    expect(screen.getAllByText("0 / 4000")).toHaveLength(2);
    expect(screen.getAllByText(/Situation 1\./)[0].className).toContain("whitespace-pre-line");
    fireEvent.change(first, { target: { value: "hello\nworld" } });
    expect(screen.getByText("11 / 4000")).toBeTruthy();
  });

  it("restores a stored draft after mount, per block", async () => {
    window.localStorage.setItem(writingDraftKey(PATH, "w2"), JSON.stringify({ v: 1, text: "kept story" }));
    render(<LessonPlayer document={document} attemptId="a" lessonPath={PATH} />);
    const boxes = (await screen.findAllByRole("textbox")) as HTMLTextAreaElement[];
    await screen.findByDisplayValue("kept story");
    expect(boxes[0].value).toBe("");
  });

  it("keeps the text in memory only without a lesson path (the Studio preview)", async () => {
    render(<LessonPlayer document={document} attemptId="a" />);
    const [first] = await screen.findAllByRole("textbox");
    fireEvent.change(first, { target: { value: "typed" } });
    cleanup(); // unmount flushes
    expect(window.localStorage.length).toBe(0);
  });

  it("writes the draft when the page is hidden", async () => {
    render(<LessonPlayer document={document} attemptId="a" lessonPath={PATH} />);
    const [first] = await screen.findAllByRole("textbox");
    fireEvent.change(first, { target: { value: "saved on hide" } });
    window.dispatchEvent(new Event("pagehide"));
    expect(window.localStorage.getItem(writingDraftKey(PATH, "w1"))).toBe(JSON.stringify({ v: 1, text: "saved on hide" }));
  });
});
