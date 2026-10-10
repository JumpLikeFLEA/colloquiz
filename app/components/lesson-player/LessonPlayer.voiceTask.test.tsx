import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAYGROUND_EXAMPLES } from "@/lib/items/__fixtures__/playgroundExamples";
import { LessonPlayer, practiceRenderer } from "@/app/components/lesson-player";

/**
 * VOICE-003 — a voice task renders as a placeholder recorder (the admin
 * preview is this same player), and is not counted as an exercise.
 */

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
}));

const raw = PLAYGROUND_EXAMPLES.find((e) => e.label === "selection — MCQ single")!.raw;
const document = [
  { id: "v1", kind: "task", type: "voice", prompt: [{ text: "Tell us about your week." }], maxSeconds: 150, compare: "before" },
  { ...(raw as Record<string, unknown>), kind: "practice" },
];

afterEach(cleanup);

describe("LessonPlayer — voice task (VOICE-003)", () => {
  it("renders the prompt, the limit and a disabled Record button", () => {
    render(<LessonPlayer document={document} attemptId="a1" practiceRenderer={practiceRenderer} />);

    expect(screen.getByText("Voice task")).toBeDefined();
    expect(screen.getByText("Tell us about your week.")).toBeDefined();
    expect(screen.getByText("Up to 2 min 30 s")).toBeDefined();
    const record = screen.getByRole("button", { name: "Record" }) as HTMLButtonElement;
    expect(record.disabled).toBe(true);
  });

  it("numbers only the practice block: the one exercise is 'Exercise 1 of 1'", () => {
    render(<LessonPlayer document={document} attemptId="a1" practiceRenderer={practiceRenderer} />);

    expect(screen.getByText("Exercise 1 of 1")).toBeDefined();
    expect(screen.queryByText(/Exercise 2/)).toBeNull();
  });
});
