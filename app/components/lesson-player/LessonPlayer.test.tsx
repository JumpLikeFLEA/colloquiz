import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

/** PLAY-007's completion screen shows the same wrong-sub-part explanation
 * text a second time, in its own end-of-lesson review — see LessonCompletion
 * and the `lesson-blocks` wrapper's doc comment in LessonPlayer.tsx. Tests
 * that check an inline "Why?" panel's specific text (present/absent) scope
 * their query to this wrapper so they aren't confused by that second copy. */
function lessonBlocks() {
  return within(screen.getByTestId("lesson-blocks"));
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
  // PLAY-012: practiceRenderer's dispatch targets are next/dynamic components
  // now (per-type code splitting, docs/decisions/0057), so a renderer's first
  // paint resolves asynchronously even in a same-machine test — the initial
  // content query in each test below is a `findBy*` for that reason.
  it("selection: renders and a radio choice reaches onScore/scoreItem", async () => {
    const onScore = vi.fn<(result: ItemScoreResult) => void>();
    render(
      <LessonPlayer
        document={documentFor(exampleRaw("selection — MCQ single"))}
        attemptId="attempt-1"
        practiceRenderer={spiedRenderer(onScore)}
      />,
    );

    expect(await screen.findByText("Which sentence is correct?")).toBeDefined();

    fireEvent.click(screen.getByRole("radio", { name: "She goes to school every day." }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onScore).toHaveBeenCalledTimes(1);
    const result = onScore.mock.calls[0][0];
    expect(result.possible).toBe(1);
    expect(result.earned).toBe(1);
  });

  it("selection_grid: renders and a True/False row reaches onScore/scoreItem", async () => {
    const onScore = vi.fn<(result: ItemScoreResult) => void>();
    render(
      <LessonPlayer
        document={documentFor(exampleRaw("selection_grid — inline True/False"))}
        attemptId="attempt-1"
        practiceRenderer={spiedRenderer(onScore)}
      />,
    );

    expect(await screen.findByText("True or False?")).toBeDefined();

    fireEvent.click(screen.getAllByRole("button", { name: "True" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onScore).toHaveBeenCalledTimes(1);
    const result = onScore.mock.calls[0][0];
    expect(result.possible).toBe(3);
    expect(result.subResults).toHaveLength(3);
  });

  it("ordering: renders and Submit reaches onScore/scoreItem", async () => {
    const onScore = vi.fn<(result: ItemScoreResult) => void>();
    render(
      <LessonPlayer
        document={documentFor(exampleRaw("ordering — word order"))}
        attemptId="attempt-1"
        practiceRenderer={spiedRenderer(onScore)}
      />,
    );

    expect(await screen.findByText("Put the words in the correct order.")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onScore).toHaveBeenCalledTimes(1);
    const result = onScore.mock.calls[0][0];
    expect(result.possible).toBe(4);
    expect(result.subResults).toHaveLength(4);
  });

  it("matching: renders and a slot-then-chip pairing reaches onScore/scoreItem", async () => {
    const onScore = vi.fn<(result: ItemScoreResult) => void>();
    render(
      <LessonPlayer
        document={documentFor(exampleRaw("matching — word to definition"))}
        attemptId="attempt-1"
        practiceRenderer={spiedRenderer(onScore)}
      />,
    );

    expect(await screen.findByText("Match each word to its definition.")).toBeDefined();

    fireEvent.click(screen.getAllByLabelText("Empty answer slot — tap to select")[0]); // ubiquitous's slot
    fireEvent.click(screen.getByText("present everywhere")); // correct pair (p1: l1 -> r2)
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onScore).toHaveBeenCalledTimes(1);
    const result = onScore.mock.calls[0][0];
    expect(result.possible).toBe(3);
    expect(result.subResults.find((r) => r.id === "p1")?.correct).toBe(true);
  });

  it("selection: a wrong answer shows a collapsed \"Why?\" that expands the item's explanation", async () => {
    const onScore = vi.fn<(result: ItemScoreResult) => void>();
    render(
      <LessonPlayer
        document={documentFor(exampleRaw("selection — MCQ single"))}
        attemptId="attempt-1"
        practiceRenderer={spiedRenderer(onScore)}
      />,
    );

    fireEvent.click(await screen.findByRole("radio", { name: "She go to school every day." })); // wrong option
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    const why = screen.getByRole("button", { name: "Why?" });
    expect(why.getAttribute("aria-expanded")).toBe("false");
    expect(lessonBlocks().queryByText(/Third person singular/)).toBeNull();

    fireEvent.click(why);
    expect(why.getAttribute("aria-expanded")).toBe("true");
    expect(lessonBlocks().getByText(/Third person singular present tense takes an -s ending/)).toBeDefined();
  });

  it("selection_grid: numbers rows 1, 2, 3 and shows each wrong row's own explanation", async () => {
    const onScore = vi.fn<(result: ItemScoreResult) => void>();
    render(
      <LessonPlayer
        document={documentFor(exampleRaw("selection_grid — inline True/False"))}
        attemptId="attempt-1"
        practiceRenderer={spiedRenderer(onScore)}
      />,
    );

    // Submitted with no row answered — every row scores incorrect (documented
    // "unanswered" convention), so all three explanations are checkable at once.
    fireEvent.click(await screen.findByRole("button", { name: "Submit" }));

    expect(screen.getByText("1.")).toBeDefined();
    expect(screen.getByText("2.")).toBeDefined();
    expect(screen.getByText("3.")).toBeDefined();

    const whyButtons = screen.getAllByRole("button", { name: "Why?" });
    expect(whyButtons).toHaveLength(3);

    fireEvent.click(whyButtons[1]);
    expect(lessonBlocks().getByText(/needs the simple past/)).toBeDefined();
  });

  it("matching: numbers left rows 1, 2, 3 and shows each wrong pair's own explanation", async () => {
    const onScore = vi.fn<(result: ItemScoreResult) => void>();
    render(
      <LessonPlayer
        document={documentFor(exampleRaw("matching — word to definition"))}
        attemptId="attempt-1"
        practiceRenderer={spiedRenderer(onScore)}
      />,
    );

    // Submitted with nothing paired — every pair scores incorrect.
    fireEvent.click(await screen.findByRole("button", { name: "Submit" }));

    expect(screen.getByText("1.")).toBeDefined();
    expect(screen.getByText("2.")).toBeDefined();
    expect(screen.getByText("3.")).toBeDefined();

    const whyButtons = screen.getAllByRole("button", { name: "Why?" });
    expect(whyButtons).toHaveLength(3);

    fireEvent.click(whyButtons[0]);
    expect(lessonBlocks().getByText(/"Ubiquitous" means present or found everywhere/)).toBeDefined();
  });

  it("ordering: the never-identity shuffle guarantees a wrong element, and its explanation is reachable", async () => {
    const onScore = vi.fn<(result: ItemScoreResult) => void>();
    render(
      <LessonPlayer
        document={documentFor(exampleRaw("ordering — word order"))}
        attemptId="attempt-explain-ordering"
        practiceRenderer={spiedRenderer(onScore)}
      />,
    );

    // shuffleOrderingIndices never returns the identity permutation (lib/items/
    // shuffle.ts), so submitting untouched always leaves at least one wrong row.
    fireEvent.click(await screen.findByRole("button", { name: "Submit" }));

    const result = onScore.mock.calls[0][0];
    expect(result.subResults.some((r) => !r.correct)).toBe(true);

    const whyButtons = screen.getAllByRole("button", { name: "Why?" });
    expect(whyButtons.length).toBeGreaterThan(0);
    fireEvent.click(whyButtons[0]);
    expect(
      lessonBlocks().getByText(
        /subject comes first|before the main verb|follows the frequency adverb|closes the sentence/,
      ),
    ).toBeDefined();
  });

  it("slots: renders and typed gap answers reach onScore/scoreItem", async () => {
    const onScore = vi.fn<(result: ItemScoreResult) => void>();
    render(
      <LessonPlayer
        document={documentFor(exampleRaw("slots — cloze gaps"))}
        attemptId="attempt-1"
        practiceRenderer={spiedRenderer(onScore)}
      />,
    );

    expect(await screen.findByLabelText("Gap 1")).toBeDefined();

    fireEvent.change(screen.getByLabelText("Gap 1"), { target: { value: "go" } });
    fireEvent.change(screen.getByLabelText("Gap 2"), { target: { value: "on" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onScore).toHaveBeenCalledTimes(1);
    const result = onScore.mock.calls[0][0];
    expect(result.possible).toBe(2);
    expect(result.earned).toBe(2);
  });

  it("slots: an untouched (wrong) gap gets its own numbered \"Gap N:\" explanation line", async () => {
    const onScore = vi.fn<(result: ItemScoreResult) => void>();
    render(
      <LessonPlayer
        document={documentFor(exampleRaw("slots — cloze gaps"))}
        attemptId="attempt-1"
        practiceRenderer={spiedRenderer(onScore)}
      />,
    );

    // Only Gap 1 is answered (correctly) — Gap 2 stays untouched, so it
    // scores incorrect (documented "untouched" convention) and gets a "Why?".
    fireEvent.change(await screen.findByLabelText("Gap 1"), { target: { value: "go" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(screen.getByText("Gap 2:")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Why?" }));
    expect(lessonBlocks().getByText(/take the preposition "on"/)).toBeDefined();
  });
});

describe("LessonPlayer — completion screen (PLAY-007)", () => {
  it("shows the Russian score line once an item is attempted, and no review section before any wrong answer", async () => {
    const onScore = vi.fn<(result: ItemScoreResult) => void>();
    render(
      <LessonPlayer
        document={documentFor(exampleRaw("selection — MCQ single"))}
        attemptId="attempt-1"
        practiceRenderer={spiedRenderer(onScore)}
      />,
    );

    // The footer heading is always present (single-page player, no "reached
    // the end" transition — see LessonCompletion's doc comment); only the
    // score line depends on an attempt existing.
    expect(screen.getByText("Урок завершён")).toBeDefined();
    expect(screen.queryByText(/Ваш результат/)).toBeNull();

    fireEvent.click(await screen.findByRole("radio", { name: "She goes to school every day." })); // correct
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(screen.getByText("Урок завершён")).toBeDefined();
    expect(screen.getByText(/Ваш результат: 100% \(1\/1\)/)).toBeDefined();
    expect(screen.queryByText("Разбор ответов")).toBeNull(); // nothing wrong to review
  });

  it("lists the wrong item's explanation under the review heading, alongside the inline copy", async () => {
    const onScore = vi.fn<(result: ItemScoreResult) => void>();
    render(
      <LessonPlayer
        document={documentFor(exampleRaw("selection — MCQ single"))}
        attemptId="attempt-1"
        practiceRenderer={spiedRenderer(onScore)}
      />,
    );

    fireEvent.click(await screen.findByRole("radio", { name: "She go to school every day." })); // wrong option
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(screen.getByText("Разбор ответов")).toBeDefined();
    // Two copies now exist: the inline (still-collapsed) panel and this
    // review section's own — see lessonBlocks()'s doc comment above.
    expect(screen.getAllByText(/Third person singular present tense takes an -s ending/)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Why?" }));
    expect(screen.getAllByText(/Third person singular present tense takes an -s ending/)).toHaveLength(2);
  });

  it("links to the next lesson by course slug + slug, and omits the link when there is none", async () => {
    const onScore = vi.fn<(result: ItemScoreResult) => void>();
    const { rerender } = render(
      <LessonPlayer
        document={documentFor(exampleRaw("selection — MCQ single"))}
        attemptId="attempt-1"
        practiceRenderer={spiedRenderer(onScore)}
        courseSlug="future-imperfect"
        nextLesson={{ slug: "true-or-false", title: "True or False" }}
      />,
    );

    const link = screen.getByRole("link", { name: /Следующий урок: True or False/ });
    expect(link.getAttribute("href")).toBe("/courses/future-imperfect/true-or-false");

    rerender(
      <LessonPlayer
        document={documentFor(exampleRaw("selection — MCQ single"))}
        attemptId="attempt-1"
        practiceRenderer={spiedRenderer(onScore)}
        courseSlug="future-imperfect"
        nextLesson={null}
      />,
    );
    expect(screen.queryByRole("link", { name: /Следующий урок/ })).toBeNull();
  });
});
