import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ItemScoreResult } from "@/lib/items";
import { PLAYGROUND_EXAMPLES } from "@/lib/items/__fixtures__/playgroundExamples";
import { LessonPlayer, practiceRenderer, type PracticeRendererProps } from "@/app/components/lesson-player";

/**
 * PLAY-005 — one RTL smoke test per PLAY-002..004 renderer, mounted inside
 * the real `LessonPlayer` shell with the real `practiceRenderer` dispatcher
 * (the same one `LessonPlayerDemoClient` wires up), rather than rendering a
 * renderer directly. This is the rendering-plus-wiring layer neither the
 * pure `lib/items/*.test.ts` suite nor a manual browser check exercises —
 * see the issue body for the hydration/client-boundary bugs that slipped
 * through that gap during PLAY-001..004.
 *
 * Fixtures are the existing `PLAYGROUND_EXAMPLES` raw item envelopes
 * (ITEM-010) — a practice block is that envelope plus `kind: "practice"`
 * (lib/lessons/parseLessonDocument.ts), so no new content is authored here.
 */

function documentFor(rawItem: unknown) {
  return [{ ...(rawItem as Record<string, unknown>), kind: "practice" }];
}

function exampleRaw(label: string): unknown {
  const example = PLAYGROUND_EXAMPLES.find((e) => e.label === label);
  if (!example) throw new Error(`no playground example labelled ${JSON.stringify(label)}`);
  return example.raw;
}

/** Wraps the real dispatcher so a test can assert on the `ItemScoreResult`
 * `scoreItem` actually produced, without replacing any per-type renderer. */
function spiedRenderer(spy: (result: ItemScoreResult) => void) {
  return (props: PracticeRendererProps) =>
    practiceRenderer({ ...props, onScore: (result) => { spy(result); props.onScore(result); } });
}

afterEach(() => {
  cleanup();
});

describe("LessonPlayer — practice renderer smoke tests", () => {
  it("selection: renders and a radio choice reaches onScore/scoreItem", () => {
    const onScore = vi.fn<(result: ItemScoreResult) => void>();
    render(
      <LessonPlayer
        document={documentFor(exampleRaw("selection — MCQ single"))}
        attemptId="attempt-1"
        practiceRenderer={spiedRenderer(onScore)}
      />,
    );

    expect(screen.getByText("Which sentence is correct?")).toBeDefined();

    fireEvent.click(screen.getByRole("radio", { name: "She goes to school every day." }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onScore).toHaveBeenCalledTimes(1);
    const result = onScore.mock.calls[0][0];
    expect(result.possible).toBe(1);
    expect(result.earned).toBe(1);
  });

  it("selection_grid: renders and a True/False row reaches onScore/scoreItem", () => {
    const onScore = vi.fn<(result: ItemScoreResult) => void>();
    render(
      <LessonPlayer
        document={documentFor(exampleRaw("selection_grid — inline True/False"))}
        attemptId="attempt-1"
        practiceRenderer={spiedRenderer(onScore)}
      />,
    );

    expect(screen.getByText("True or False?")).toBeDefined();

    fireEvent.click(screen.getAllByRole("button", { name: "True" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onScore).toHaveBeenCalledTimes(1);
    const result = onScore.mock.calls[0][0];
    expect(result.possible).toBe(3);
    expect(result.subResults).toHaveLength(3);
  });

  it("ordering: renders and Submit reaches onScore/scoreItem", () => {
    const onScore = vi.fn<(result: ItemScoreResult) => void>();
    render(
      <LessonPlayer
        document={documentFor(exampleRaw("ordering — word order"))}
        attemptId="attempt-1"
        practiceRenderer={spiedRenderer(onScore)}
      />,
    );

    expect(screen.getByText("Put the words in the correct order.")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onScore).toHaveBeenCalledTimes(1);
    const result = onScore.mock.calls[0][0];
    expect(result.possible).toBe(4);
    expect(result.subResults).toHaveLength(4);
  });

  it("matching: renders and a slot-then-chip pairing reaches onScore/scoreItem", () => {
    const onScore = vi.fn<(result: ItemScoreResult) => void>();
    render(
      <LessonPlayer
        document={documentFor(exampleRaw("matching — word to definition"))}
        attemptId="attempt-1"
        practiceRenderer={spiedRenderer(onScore)}
      />,
    );

    expect(screen.getByText("Match each word to its definition.")).toBeDefined();

    fireEvent.click(screen.getAllByLabelText("Empty answer slot — tap to select")[0]); // ubiquitous's slot
    fireEvent.click(screen.getByText("present everywhere")); // correct pair (p1: l1 -> r2)
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onScore).toHaveBeenCalledTimes(1);
    const result = onScore.mock.calls[0][0];
    expect(result.possible).toBe(3);
    expect(result.subResults.find((r) => r.id === "p1")?.correct).toBe(true);
  });

  it("slots: renders and typed gap answers reach onScore/scoreItem", () => {
    const onScore = vi.fn<(result: ItemScoreResult) => void>();
    render(
      <LessonPlayer
        document={documentFor(exampleRaw("slots — cloze gaps"))}
        attemptId="attempt-1"
        practiceRenderer={spiedRenderer(onScore)}
      />,
    );

    expect(screen.getByLabelText("Gap 1")).toBeDefined();

    fireEvent.change(screen.getByLabelText("Gap 1"), { target: { value: "go" } });
    fireEvent.change(screen.getByLabelText("Gap 2"), { target: { value: "on" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onScore).toHaveBeenCalledTimes(1);
    const result = onScore.mock.calls[0][0];
    expect(result.possible).toBe(2);
    expect(result.earned).toBe(2);
  });
});
