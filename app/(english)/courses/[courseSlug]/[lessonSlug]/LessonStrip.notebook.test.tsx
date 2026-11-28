import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLAYGROUND_EXAMPLES } from "@/lib/items/__fixtures__/playgroundExamples";
import { LessonPageClient } from "./LessonPageClient";
import { SignedInLessonPageClient } from "./SignedInLessonPageClient";

/**
 * PROG-022 (docs/decisions/0246, 0248) — the strip's "Add a phrase" button: on the signed-in
 * client only, and on a lesson with no exercises too (back link and button, no bar, no count).
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// The player fires funnel events through fetch; answer them so nothing logs after teardown.
beforeEach(() => vi.stubGlobal("fetch", vi.fn(async () => new Response("{}"))));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const raw = PLAYGROUND_EXAMPLES.find((e) => e.label === "selection — MCQ single")!.raw as Record<string, unknown>;
const exercise = { ...raw, kind: "practice" };
const prose = { id: "p1", kind: "theory", type: "prose", text: [{ text: "Only theory here." }] };

const common = {
  header: null,
  backLink: <span>Back</span>,
  lessonTitle: "Lesson 1",
  attemptId: "a1",
  courseSlug: "course-a",
  nextLesson: null,
  lessonVersionId: "11111111-1111-4111-8111-111111111111",
  lessonPath: "/courses/course-a/lesson-1",
  previousBestPercent: null,
};
const notebook = { lessonId: "les-1", courseId: "c-1", courseTitle: "Course A", lessonTitle: "Lesson 1", lessonPath: common.lessonPath };

describe("lesson strip — Add a phrase (PROG-022)", () => {
  it("signed out: the strip as before, no button (with and without exercises)", async () => {
    const { unmount } = render(<LessonPageClient {...common} document={[prose, exercise]} isSignedIn={false} />);
    expect(await screen.findByRole("progressbar")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add a phrase" })).toBeNull();
    unmount();
    render(<LessonPageClient {...common} document={[prose]} isSignedIn={false} />);
    await screen.findByText("Only theory here.");
    expect(screen.queryByText("Back")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add a phrase" })).toBeNull();
  });

  it("signed in: the button at the end of the strip [positive control for the case above]", async () => {
    render(<SignedInLessonPageClient {...common} document={[prose, exercise]} isSignedIn notebook={notebook} />);
    expect(await screen.findByRole("progressbar")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Add a phrase" });
    // The last in-flow child; after it only PROG-023's Save bar, out of flow and empty until a
    // selection (docs/decisions/0254).
    const bar = button.parentElement?.lastElementChild;
    expect(bar?.hasAttribute("data-selection-bar")).toBe(true);
    expect(bar?.className).toContain("absolute");
    expect(bar?.childElementCount).toBe(0);
    expect(bar?.previousElementSibling).toBe(button);
  });

  it("signed in, no exercises: back link and button, no bar and no count", async () => {
    render(<SignedInLessonPageClient {...common} document={[prose]} isSignedIn notebook={notebook} />);
    await screen.findByText("Only theory here.");
    expect(screen.getByText("Back")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Add a phrase" });
    expect(screen.queryByRole("progressbar")).toBeNull();
    // Back link, button, and the empty out-of-flow Save bar (PROG-023).
    expect(button.parentElement?.children.length).toBe(3);
    expect(button.nextElementSibling?.hasAttribute("data-selection-bar")).toBe(true);
  });
});
