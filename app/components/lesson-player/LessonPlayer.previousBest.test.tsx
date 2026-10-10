import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAYGROUND_EXAMPLES } from "@/lib/items/__fixtures__/playgroundExamples";
import { ATTEMPT_STORAGE_KEY } from "@/lib/lessonPlayer/attemptStore";
import { LessonPlayer, practiceRenderer } from "@/app/components/lesson-player";

/**
 * docs/decisions/0088 — the "Your best" note. The case it exists for: a
 * learner finishes a lesson anonymously, signs in from the completion card,
 * and lands back on the same lesson. That page is rendered before the
 * player uploads the anonymous attempts, so the server's best is null and
 * only the local store knows the score. The upload then empties the store,
 * and the note must survive that.
 */

const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: "u1" } } } });

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession }, rpc }),
}));

const raw = PLAYGROUND_EXAMPLES.find((e) => e.label === "selection — MCQ single")!.raw;
const document = [{ ...(raw as Record<string, unknown>), kind: "practice" }];

function seedLocalAttempt(earned: number, possible: number, lessonVersionId = "v1") {
  window.localStorage.setItem(
    ATTEMPT_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      attempts: [
        {
          attemptId: "anon-1",
          lessonVersionId,
          blockId: "playground-selection",
          earned,
          possible,
          recordedAt: "2026-10-07T00:00:00Z",
        },
      ],
    }),
  );
}

afterEach(() => {
  cleanup();
  rpc.mockClear();
  window.localStorage.removeItem(ATTEMPT_STORAGE_KEY);
});

describe("LessonPlayer — previous best note (0088)", () => {
  it("shows the anonymous score after sign-in, and keeps it once the upload empties the store", async () => {
    seedLocalAttempt(3, 4);
    render(
      <LessonPlayer document={document} attemptId="after-signin" practiceRenderer={practiceRenderer} lessonVersionId="v1" isSignedIn />,
    );

    expect(screen.getByText("Your best: 75%")).toBeDefined();
    // The mount-time flush uploads and clears the local store...
    // (PROG-001: the mount also calls record_lesson_open, so count by name.)
    await vi.waitFor(() =>
      expect(rpc.mock.calls.filter(([fn]) => fn === "record_lesson_attempts")).toHaveLength(1),
    );
    await vi.waitFor(() => expect(JSON.parse(window.localStorage.getItem(ATTEMPT_STORAGE_KEY)!).attempts).toEqual([]));
    // ...and the note is still there.
    expect(screen.getByText("Your best: 75%")).toBeDefined();
  });

  it("shows the higher of the server's best and the local one", () => {
    seedLocalAttempt(3, 4);
    render(
      <LessonPlayer
        document={document}
        attemptId="server-higher"
        practiceRenderer={practiceRenderer}
        lessonVersionId="v1"
        isSignedIn
        previousBestPercent={90}
      />,
    );
    expect(screen.getByText("Your best: 90%")).toBeDefined();
  });

  it("shows the server's best when nothing is stored locally", () => {
    render(
      <LessonPlayer
        document={document}
        attemptId="server-only"
        practiceRenderer={practiceRenderer}
        lessonVersionId="v1"
        isSignedIn
        previousBestPercent={40}
      />,
    );
    expect(screen.getByText("Your best: 40%")).toBeDefined();
  });

  it("ignores local attempts for another lesson version", () => {
    seedLocalAttempt(1, 1, "v2");
    render(
      <LessonPlayer document={document} attemptId="other-version" practiceRenderer={practiceRenderer} lessonVersionId="v1" isSignedIn />,
    );
    expect(screen.queryByText(/Your best/)).toBeNull();
  });

  it("shows nothing to a signed-out learner", () => {
    seedLocalAttempt(3, 4);
    render(<LessonPlayer document={document} attemptId="signed-out" practiceRenderer={practiceRenderer} lessonVersionId="v1" />);
    expect(screen.queryByText(/Your best/)).toBeNull();
  });

  it("shows nothing in the preview or demo, which pass no lesson version", () => {
    seedLocalAttempt(3, 4);
    render(<LessonPlayer document={document} attemptId="preview" practiceRenderer={practiceRenderer} isSignedIn previousBestPercent={50} />);
    expect(screen.queryByText(/Your best/)).toBeNull();
  });
});
