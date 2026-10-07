import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAYGROUND_EXAMPLES } from "@/lib/items/__fixtures__/playgroundExamples";
import { ATTEMPT_STORAGE_KEY } from "@/lib/lessonPlayer/attemptStore";
import { LessonPlayer, practiceRenderer } from "@/app/components/lesson-player";

/**
 * ANON-013 — an anonymous learner's scored block must reach the local
 * attempt store, because both migration paths read from it: the same-browser
 * mount-time flush (0068 Decision 6) and RegistrationOffer's cross-browser
 * `pending_claims` stash. Before ANON-013, `handleScore` returned before
 * `attemptStore.record()` unless `isSignedIn`, so the store stayed empty and
 * both paths uploaded nothing (ANON-009 OAuth test, issue 135).
 *
 * Its own file, not a case in LessonPlayer.recording.test.tsx: the "never
 * loads @supabase/ssr" claim is checked by counting how often the
 * `@/lib/supabase/client` mock factory runs, and vitest runs a factory once
 * per file on first import — the signed-in cases there would already have
 * triggered it.
 */

const supabaseClientLoads = vi.hoisted(() => ({ count: 0 }));

vi.mock("@/lib/supabase/client", () => {
  supabaseClientLoads.count += 1;
  return { createClient: () => ({ auth: { getSession: vi.fn() }, rpc: vi.fn() }) };
});

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
  vi.restoreAllMocks();
  window.localStorage.removeItem(ATTEMPT_STORAGE_KEY);
});

describe("LessonPlayer — ANON-013 anonymous attempts are stored locally", () => {
  it("writes a signed-out learner's scored block to the local store, with no network call and no Supabase client", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    render(
      <LessonPlayer
        document={documentFor(exampleRaw("selection — MCQ single"))}
        attemptId="attempt-1"
        practiceRenderer={practiceRenderer}
        lessonVersionId="v1"
        isSignedIn={false}
      />,
    );

    expect(await screen.findByText("Which sentence is correct?")).toBeDefined();
    fireEvent.click(screen.getByRole("radio", { name: "She goes to school every day." }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    const stored = JSON.parse(window.localStorage.getItem(ATTEMPT_STORAGE_KEY) ?? "null");
    expect(stored).toEqual({
      version: 1,
      attempts: [
        expect.objectContaining({
          lessonVersionId: "v1",
          blockId: "playground-selection",
          earned: 1,
          possible: 1,
        }),
      ],
    });

    // Give any stray microtask (a dynamic import, a fetch) a chance to run
    // before asserting the negatives.
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The only requests are OPS-008's funnel events (lesson_start,
    // lesson_complete), which fire for every learner and predate ANON-013.
    // Recording the attempt adds none.
    const urls = fetchSpy.mock.calls.map(([input]) => String(input));
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((url) => url === "/api/events")).toBe(true);
    expect(supabaseClientLoads.count).toBe(0);
  });

  it("still records nothing when no lessonVersionId is supplied (preview/demo callers)", async () => {
    render(
      <LessonPlayer
        document={documentFor(exampleRaw("selection — MCQ single"))}
        attemptId="attempt-1"
        practiceRenderer={practiceRenderer}
      />,
    );

    expect(await screen.findByText("Which sentence is correct?")).toBeDefined();
    fireEvent.click(screen.getByRole("radio", { name: "She goes to school every day." }));
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    expect(window.localStorage.getItem(ATTEMPT_STORAGE_KEY)).toBeNull();
  });
});
