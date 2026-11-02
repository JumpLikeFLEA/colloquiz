import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAYGROUND_EXAMPLES } from "@/lib/items/__fixtures__/playgroundExamples";
import { ATTEMPT_STORAGE_KEY } from "@/lib/lessonPlayer/attemptStore";
import { LessonPlayer, type PracticeRendererProps } from "@/app/components/lesson-player";
import type { LessonProgress } from "@/app/components/lesson-player/LessonPlayer";

/**
 * PLAY-019 (docs/decisions/0210) — a lesson half done on an earlier visit
 * opens at 2/4 in the strip, marks those exercises "Answered before", and the
 * card turns to "Lesson complete" once the other two are answered now.
 */

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
}));

const raw = PLAYGROUND_EXAMPLES.find((e) => e.label === "selection — MCQ single")!.raw as Record<string, unknown>;
const IDS = ["e1", "e2", "e3", "e4"];
const document = IDS.map((id) => ({ ...raw, id, kind: "practice" }));

// Answers with full marks on a click; the real renderers are tested elsewhere.
function clickRenderer({ block, onScore }: PracticeRendererProps) {
  return (
    <button type="button" onClick={() => onScore({ earned: 1, possible: 1, subResults: [] }, null)}>
      answer {block.id}
    </button>
  );
}

let last: LessonProgress | null = null;
const strip = (p: LessonProgress) => {
  last = p;
  return null;
};

afterEach(() => {
  cleanup();
  last = null;
  window.localStorage.removeItem(ATTEMPT_STORAGE_KEY);
});

function earlier(blockId: string, earned = 1, lessonVersionId = "v1") {
  return { lessonVersionId, blockId, earned, possible: 1 };
}

describe("LessonPlayer — answered before (0210)", () => {
  it("counts the server's earlier answers, marks them, and completes with the rest", () => {
    render(
      <LessonPlayer
        document={document}
        attemptId="half-done"
        practiceRenderer={clickRenderer}
        lessonVersionId="v1"
        isSignedIn
        earlierAttempts={[earlier("e1"), earlier("e2", 0)]}
        renderProgress={strip}
      />,
    );
    expect(last).toMatchObject({ answered: 2, total: 4, complete: false });
    expect(screen.getAllByText("Answered before")).toHaveLength(2);
    expect(screen.getByText(/2 exercises/)).toBeDefined();

    fireEvent.click(screen.getByText("answer e3"));
    fireEvent.click(screen.getByText("answer e4"));

    expect(last).toMatchObject({ answered: 4, total: 4, complete: true, percent: 75 });
    expect(screen.getByText("Lesson complete")).toBeDefined();
    expect(screen.getByText("75%")).toBeDefined();
    expect(screen.getByText(/^3 of 4$/)).toBeDefined();
  });

  it("drops the mark once the exercise is answered again in this visit", () => {
    render(
      <LessonPlayer document={document} attemptId="again" practiceRenderer={clickRenderer} lessonVersionId="v1" isSignedIn earlierAttempts={[earlier("e1")]} />,
    );
    expect(screen.getAllByText("Answered before")).toHaveLength(1);
    fireEvent.click(screen.getByText("answer e1"));
    expect(screen.queryByText("Answered before")).toBeNull();
  });

  it("reads an anonymous learner's earlier answers from the local store", () => {
    window.localStorage.setItem(
      ATTEMPT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        attempts: IDS.slice(0, 3).map((blockId, i) => ({
          attemptId: `a${i}`,
          lessonVersionId: "v1",
          blockId,
          earned: 1,
          possible: 1,
          recordedAt: "2026-11-01T00:00:00Z",
        })),
      }),
    );
    render(
      <LessonPlayer document={document} attemptId="anon" practiceRenderer={clickRenderer} lessonVersionId="v1" renderProgress={strip} />,
    );
    expect(last).toMatchObject({ answered: 3, total: 4 });
  });

  it("ignores attempts on another version", () => {
    render(
      <LessonPlayer
        document={document}
        attemptId="republished"
        practiceRenderer={clickRenderer}
        lessonVersionId="v2"
        isSignedIn
        earlierAttempts={[earlier("e1", 1, "v1")]}
        renderProgress={strip}
      />,
    );
    expect(last).toMatchObject({ answered: 0, total: 4 });
    expect(screen.queryByText("Answered before")).toBeNull();
  });

  it("never shows a score below the learner's best, and drops the points line then", () => {
    render(
      <LessonPlayer
        document={document}
        attemptId="floor"
        practiceRenderer={clickRenderer}
        lessonVersionId="v1"
        isSignedIn
        previousBestPercent={90}
        earlierAttempts={[earlier("e1", 0), earlier("e2", 0), earlier("e3", 0)]}
        renderProgress={strip}
      />,
    );
    fireEvent.click(screen.getByText("answer e4"));
    expect(last).toMatchObject({ complete: true, percent: 90 });
    expect(screen.getByText("90%")).toBeDefined();
    expect(screen.queryByText(/^1 of 4$/)).toBeNull();
  });
});
