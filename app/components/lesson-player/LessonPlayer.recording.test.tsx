import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAYGROUND_EXAMPLES } from "@/lib/items/__fixtures__/playgroundExamples";
import { LessonPlayer, practiceRenderer } from "@/app/components/lesson-player";

/**
 * ANON-005 — the recording half of `LessonPlayer`: a signed-in learner's
 * scored block is uploaded through `record_lesson_attempts`, an anonymous
 * or preview caller's is not. Mocks `@/lib/supabase/client` (the module
 * `LessonPlayer` dynamically imports only on the signed-in path) rather than
 * the network — `lib/lessonPlayer/attemptStore.test.ts` already covers
 * `uploadPendingAttempts`'s own contract against a fake `SupabaseClient`; this
 * test only proves `LessonPlayer` wires into that contract for the right
 * caller, with the right shape.
 */

const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: "u1" } } } });

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession }, rpc }),
}));

function documentFor(rawItem: unknown) {
  return [{ ...(rawItem as Record<string, unknown>), kind: "practice" }];
}

function exampleRaw(label: string): unknown {
  const example = PLAYGROUND_EXAMPLES.find((e) => e.label === label);
  if (!example) throw new Error(`no playground example labelled ${JSON.stringify(label)}`);
  return example.raw;
}

afterEach(() => {
  cleanup();
  rpc.mockClear();
});

async function scoreTheSelectionItem() {
  expect(await screen.findByText("Which sentence is correct?")).toBeDefined();
  fireEvent.click(screen.getByRole("radio", { name: "She goes to school every day." }));
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
}

describe("LessonPlayer — ANON-005 attempt recording", () => {
  it("uploads a signed-in learner's scored block through record_lesson_attempts", async () => {
    render(
      <LessonPlayer
        document={documentFor(exampleRaw("selection — MCQ single"))}
        attemptId="attempt-1"
        practiceRenderer={practiceRenderer}
        lessonVersionId="v1"
        isSignedIn
      />,
    );

    await scoreTheSelectionItem();

    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledWith("record_lesson_attempts", {
      p_attempts: [
        expect.objectContaining({
          lesson_version_id: "v1",
          block_id: "playground-selection",
          earned: 1,
          possible: 1,
        }),
      ],
    });
  });

  it("never imports the Supabase client for a signed-out learner", async () => {
    render(
      <LessonPlayer
        document={documentFor(exampleRaw("selection — MCQ single"))}
        attemptId="attempt-1"
        practiceRenderer={practiceRenderer}
        lessonVersionId="v1"
        isSignedIn={false}
      />,
    );

    await scoreTheSelectionItem();

    // Give any stray microtask a chance to run before asserting the negative.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not record when isSignedIn is true but no lessonVersionId is supplied (preview/demo callers)", async () => {
    render(
      <LessonPlayer
        document={documentFor(exampleRaw("selection — MCQ single"))}
        attemptId="attempt-1"
        practiceRenderer={practiceRenderer}
        isSignedIn
      />,
    );

    await scoreTheSelectionItem();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rpc).not.toHaveBeenCalled();
  });
});
