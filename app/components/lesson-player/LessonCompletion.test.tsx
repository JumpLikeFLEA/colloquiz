import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { LessonScoreResult } from "@/lib/items";
import { alliengllCopy } from "@/lib/alliengll/copy";
import { LessonCompletion } from "./LessonCompletion";

/**
 * ANON-004 — the registration offer only ever mounts after a completed
 * lesson and only for a learner who isn't already signed in (docs/decisions/
 * 0068 Decision 1). "Completed" is EVERY exercise answered since
 * docs/decisions/0079 D7, which revises 0068 Decision 2's "any item
 * scored". The offer's own behaviour is covered by RegistrationOffer.test.tsx;
 * this file only proves LessonCompletion gates it on the right signals, and
 * that the card's two states say the right thing.
 */

const unscored: LessonScoreResult = { status: "unscored", earned: 0, possible: 0, percent: null, items: [] };
const scored: LessonScoreResult = { status: "scored", earned: 1, possible: 2, percent: 50, items: [] };
const none = { answered: 0, total: 2 };
const partial = { answered: 1, total: 2 };
const all = { answered: 2, total: 2 };

afterEach(cleanup);

describe("LessonCompletion — registration offer gating", () => {
  it("shows no offer before any item has been attempted, even for an anonymous learner", () => {
    render(
      <LessonCompletion score={unscored} progress={none} review={[]} courseSlug="c" nextLesson={null} isSignedIn={false} />,
    );
    expect(screen.queryByText(alliengllCopy.signupOffer.title)).toBeNull();
  });

  it("shows no offer while exercises remain, even though the lesson is already scored", () => {
    // 0068 Decision 2 showed the offer here (any item scored); 0079 D7 waits
    // for every exercise.
    render(
      <LessonCompletion score={scored} progress={partial} review={[]} courseSlug="c" nextLesson={null} isSignedIn={false} />,
    );
    expect(screen.queryByText(alliengllCopy.signupOffer.title)).toBeNull();
  });

  it("shows the offer after a completed lesson for an anonymous learner", async () => {
    render(
      <LessonCompletion score={scored} progress={all} review={[]} courseSlug="c" nextLesson={null} isSignedIn={false} />,
    );
    // Lazy-loaded (0139), so it arrives a tick later.
    expect(await screen.findByText(alliengllCopy.signupOffer.title)).toBeDefined();
  });

  it("shows no offer for a signed-in learner, even after a completed lesson", () => {
    render(
      <LessonCompletion score={scored} progress={all} review={[]} courseSlug="c" nextLesson={null} isSignedIn={true} />,
    );
    expect(screen.queryByText(alliengllCopy.signupOffer.title)).toBeNull();
  });

  it("defaults to no offer when isSignedIn is not passed (pre-ANON-004 callers)", () => {
    render(<LessonCompletion score={scored} progress={all} review={[]} courseSlug="c" nextLesson={null} />);
    expect(screen.queryByText(alliengllCopy.signupOffer.title)).toBeNull();
  });
});

describe("LessonCompletion — what the card says (docs/decisions/0079 D7)", () => {
  it("counts the remaining exercises, and doesn't claim the lesson is finished, until every one is answered", () => {
    render(<LessonCompletion score={scored} progress={partial} review={[]} courseSlug="c" nextLesson={null} />);
    expect(screen.getByText("1 exercise left")).toBeDefined();
    expect(screen.queryByText(alliengllCopy.completion.title)).toBeNull();
  });

  it("shows the finished state with the score once every exercise is answered", () => {
    render(<LessonCompletion score={scored} progress={all} review={[]} courseSlug="c" nextLesson={null} />);
    expect(screen.getByText(alliengllCopy.completion.title)).toBeDefined();
    expect(screen.getByText("50%")).toBeDefined();
    expect(screen.queryByText(/ left$/)).toBeNull();
  });

  it("offers the way back to the course on the last lesson", () => {
    render(<LessonCompletion score={scored} progress={all} review={[]} courseSlug="c" nextLesson={null} />);
    expect(screen.getByRole("link", { name: alliengllCopy.player.backToCourse }).getAttribute("href")).toBe("/courses/c");
  });
});

describe("LessonCompletion — answer review (PLAY-016)", () => {
  const review = [
    { key: "q2:r3", blockId: "q2", exerciseNumber: 1, subPart: "6", context: "Ice is cold", explanation: "Ice is cold indeed." },
    { key: "q3:g2", blockId: "q3", exerciseNumber: 9, subPart: "Gap 2", context: "She ___ home.", explanation: "Use walks." },
    { key: "q4:q4", blockId: "q4", exerciseNumber: 10, subPart: null, context: "Pick the cat", explanation: "Cat is cat." },
  ];

  it("heads each entry with exercise and sub-part, shows its statement, and links to the exercise card", () => {
    render(<LessonCompletion score={scored} progress={all} review={review} courseSlug="c" nextLesson={null} />);
    const row = screen.getByRole("link", { name: /Exercise 1 · 6\s*Ice is cold/ });
    expect(row.getAttribute("href")).toBe("#exercise-q2");
    expect(screen.getByRole("link", { name: /Exercise 9 · Gap 2/ }).getAttribute("href")).toBe("#exercise-q3");
    // A selection item has one sub-part: no "· n".
    expect(screen.getByRole("link", { name: /^Exercise 10\s*Pick the cat/ })).toBeDefined();
    expect(screen.getByText("Ice is cold indeed.")).toBeDefined();
  });

  it("keeps the entries in the order given", () => {
    render(<LessonCompletion score={scored} progress={all} review={review} courseSlug="c" nextLesson={null} />);
    const text = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(text[0]).toContain("Exercise 1 · 6");
    expect(text[2]).toContain("Exercise 10");
  });
});

describe("LessonCompletion — course complete and the next lesson (PROG-008)", () => {
  const done = { bestPercent: 80, complete: true, exercisesAnswered: 2, exercisesTotal: 2 };
  const lessons = ["l1", "l2", "l3"].map((slug) => ({
    slug,
    title: `Lesson ${slug}`,
    state: "open" as const,
    versionId: `v-${slug}`,
    itemCount: 2,
  }));
  const course = (attempts: Record<string, typeof done>, nextCourse: { slug: string; title: string } | null = null) => ({
    title: "Future Imperfect",
    lessonSlug: "l3",
    lessons,
    attempts,
    nextCourse,
  });

  it("sends a learner who skipped a lesson back to it, not to the course", async () => {
    render(
      <LessonCompletion score={scored} progress={all} review={[]} courseSlug="c" nextLesson={null} course={course({ l1: done })} />,
    );
    const next = await screen.findByRole("link", { name: /Next lesson: Lesson l2/ });
    expect(next.getAttribute("href")).toBe("/courses/c/l2");
    expect(screen.queryByText(alliengllCopy.completion.courseComplete)).toBeNull();
  });

  it("reads Course complete with two numbers, the next course and a share button when the lesson finishes the course", async () => {
    render(
      <LessonCompletion
        score={scored}
        progress={all}
        review={[]}
        courseSlug="c"
        nextLesson={null}
        course={course({ l1: done, l2: done }, { slug: "other", title: "Other course" })}
      />,
    );
    expect(await screen.findByText(alliengllCopy.completion.courseComplete)).toBeDefined();
    expect(screen.getByText("3 of 3")).toBeDefined();
    // Average over completed lessons: 80, 80 and this session's 50.
    expect(screen.getByText("70%")).toBeDefined();
    expect(screen.getByRole("link", { name: /Next course: Other course/ }).getAttribute("href")).toBe("/courses/other");
    expect(screen.getByRole("button", { name: alliengllCopy.completion.share })).toBeDefined();
    expect(screen.getByRole("link", { name: alliengllCopy.player.backToCourse }).getAttribute("href")).toBe("/courses/c");
  });

  it("offers no next course when there is none", async () => {
    render(
      <LessonCompletion score={scored} progress={all} review={[]} courseSlug="c" nextLesson={null} course={course({ l1: done, l2: done })} />,
    );
    expect(await screen.findByText(alliengllCopy.completion.courseComplete)).toBeDefined();
    expect(screen.queryByRole("link", { name: /Next course/ })).toBeNull();
  });

  it("keeps the next lesson in course order on an unfinished lesson", async () => {
    render(
      <LessonCompletion
        score={scored}
        progress={partial}
        review={[]}
        courseSlug="c"
        nextLesson={{ slug: "l4", title: "Lesson l4" }}
        course={course({ l1: done })}
      />,
    );
    expect(screen.getByRole("link", { name: /Next lesson: Lesson l4/ }).getAttribute("href")).toBe("/courses/c/l4");
  });

  it("builds an anonymous visitor's summary from the local stores", async () => {
    const stored = ["l1", "l2"].flatMap((l) =>
      ["a", "b"].map((blockId) => ({
        attemptId: `${l}${blockId}`,
        lessonVersionId: `v-${l}`,
        blockId,
        earned: 1,
        possible: 1,
        response: null,
        recordedAt: "2026-11-02T00:00:00Z",
      })),
    );
    window.localStorage.setItem("alliengll.attempts.v1", JSON.stringify({ version: 1, attempts: stored }));
    try {
      render(
        <LessonCompletion
          score={scored}
          progress={all}
          review={[]}
          courseSlug="c"
          nextLesson={null}
          isSignedIn={false}
          course={{ ...course({}), attempts: null }}
        />,
      );
      expect(await screen.findByText(alliengllCopy.completion.courseComplete)).toBeDefined();
    } finally {
      window.localStorage.clear();
    }
  });
});
