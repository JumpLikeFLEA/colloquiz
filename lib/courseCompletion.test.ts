import { describe, expect, it } from "vitest";
import {
  courseCompletionView,
  isCourseComplete,
  nextCatalogueCourse,
  nextUnfinishedLesson,
  withSessionResult,
} from "./courseCompletion";
import type { AttemptsByLessonSlug, LessonAttemptSummary, LessonState } from "./coursePageProgress";
import { anonAttemptSummary } from "./lessonPlayer/anonProgress";

const lesson = (slug: string, state: LessonState = "open") => ({ slug, state });
const done = (bestPercent: number | null = 80): LessonAttemptSummary => ({
  bestPercent,
  complete: true,
  exercisesAnswered: 4,
  exercisesTotal: 4,
});
const partial: LessonAttemptSummary = { bestPercent: null, complete: false, exercisesAnswered: 2, exercisesTotal: 4 };
const finished = (slug: string, percent: number | null = 90) => ({ slug, complete: true, percent });

const eight = ["l1", "l2", "l3", "l4", "l5", "l6", "l7", "l8"].map((s) => lesson(s));
const allBut = (skip: string[]): AttemptsByLessonSlug =>
  Object.fromEntries(eight.filter((l) => !skip.includes(l.slug)).map((l) => [l.slug, done()]));

describe("courseCompletionView", () => {
  it("finishing the last lesson with an earlier one skipped is not complete, and sends the learner to the skipped one", () => {
    const view = courseCompletionView(eight, allBut(["l2", "l8"]), finished("l8"));
    expect(view.complete).toBe(false);
    expect(view.next?.slug).toBe("l2");
    expect(view.progress).toEqual({ attempted: 7, total: 8, averagePercent: 81 });
  });

  it("a partly answered earlier lesson is not complete either", () => {
    const view = courseCompletionView(eight, { ...allBut(["l2", "l8"]), l2: partial }, finished("l8"));
    expect(view.complete).toBe(false);
    expect(view.next?.slug).toBe("l2");
  });

  it("finishing the one remaining lesson completes the course, with no next lesson", () => {
    const view = courseCompletionView(eight, allBut(["l5"]), finished("l5", 40));
    expect(view.complete).toBe(true);
    expect(view.next).toBeNull();
    // Two numbers: lessons N of N and the average over completed lessons.
    expect(view.progress).toEqual({ attempted: 8, total: 8, averagePercent: 75 });
  });

  it("a retake that scores lower keeps the best score and the course complete", () => {
    const view = courseCompletionView(eight, allBut([]), finished("l1", 10));
    expect(view.complete).toBe(true);
    expect(view.progress.averagePercent).toBe(80);
  });

  it("an unfinished session changes nothing", () => {
    const view = courseCompletionView(eight, allBut(["l8"]), { slug: "l8", complete: false, percent: null });
    expect(view.complete).toBe(false);
    expect(view.progress.attempted).toBe(7);
  });

  it("a theory-only lesson completes the course when opened (0143), without a score", () => {
    const lessons = [lesson("t1"), lesson("ex")];
    const view = courseCompletionView(lessons, { ex: done(60) }, finished("t1", null));
    expect(view.complete).toBe(true);
    expect(view.progress).toEqual({ attempted: 2, total: 2, averagePercent: 60 });
  });

  it("a cohort learner's scheduled lessons keep the course incomplete and are never the next lesson", () => {
    const lessons = [lesson("w1a"), lesson("w1b"), lesson("w2a", "scheduled"), lesson("w2b", "scheduled")];
    const view = courseCompletionView(lessons, { w1a: done() }, finished("w1b"));
    expect(view.complete).toBe(false);
    expect(view.next).toBeNull();
    expect(view.progress).toEqual({ attempted: 2, total: 4, averagePercent: 85 });
  });

  it("once the last week opens and is done, the cohort course is complete", () => {
    const lessons = [lesson("w1a"), lesson("w2a")];
    expect(courseCompletionView(lessons, { w1a: done() }, finished("w2a")).complete).toBe(true);
  });

  it("works from the anonymous visitor's local stores", () => {
    const anonLessons = [
      { slug: "a", versionId: "va", itemCount: 1 },
      { slug: "t", versionId: "vt", itemCount: 0 },
      { slug: "b", versionId: "vb", itemCount: 1 },
    ];
    const attempts = [{ attemptId: "x", lessonVersionId: "va", blockId: "q", earned: 1, possible: 1, response: null, recordedAt: "2026-11-02T00:00:00Z" }];
    const summary = anonAttemptSummary(anonLessons, attempts, ["vt"]);
    const lessons = anonLessons.map((l) => lesson(l.slug));
    expect(courseCompletionView(lessons, summary, finished("b", 50)).complete).toBe(true);
    // Without the theory lesson's open, it is the next lesson instead.
    const unread = anonAttemptSummary(anonLessons, attempts, []);
    const view = courseCompletionView(lessons, unread, finished("b", 50));
    expect(view.complete).toBe(false);
    expect(view.next?.slug).toBe("t");
  });
});

describe("isCourseComplete", () => {
  it("is false for a course with no lessons: a claim about nothing", () => {
    expect(isCourseComplete([], {})).toBe(false);
  });

  it("is false when a complete lesson is no longer open to the caller", () => {
    expect(isCourseComplete([lesson("a"), lesson("b", "needs_entitlement")], { a: done(), b: done() })).toBe(false);
  });
});

describe("withSessionResult", () => {
  it("keeps a completed lesson complete on an unfinished retake", () => {
    const attempts = { a: done(70) };
    expect(withSessionResult(attempts, { slug: "a", complete: false, percent: null })).toBe(attempts);
  });

  it("raises the best score when this session beats it", () => {
    expect(withSessionResult({ a: done(70) }, finished("a", 95)).a.bestPercent).toBe(95);
  });
});

describe("nextUnfinishedLesson", () => {
  it("skips the lesson on screen even when the summary has it unfinished", () => {
    expect(nextUnfinishedLesson([lesson("a"), lesson("b")], { a: partial }, "a")?.slug).toBe("b");
  });

  it("is null when every other open lesson is complete", () => {
    expect(nextUnfinishedLesson([lesson("a"), lesson("b")], { b: done() }, "a")).toBeNull();
  });

  it("never picks a sign-in or paid lesson", () => {
    expect(nextUnfinishedLesson([lesson("a"), lesson("b", "needs_sign_in"), lesson("c", "needs_entitlement")], {}, "a")).toBeNull();
  });
});

describe("nextCatalogueCourse", () => {
  const courses = [{ slug: "x" }, { slug: "y" }, { slug: "z" }];
  it("is the next course in catalogue order, wrapping round", () => {
    expect(nextCatalogueCourse(courses, "x")?.slug).toBe("y");
    expect(nextCatalogueCourse(courses, "z")?.slug).toBe("x");
  });
  it("is the first listed course for an unlisted one", () => {
    expect(nextCatalogueCourse(courses, "unlisted")?.slug).toBe("x");
  });
  it("is null when this is the only course, or there are none", () => {
    expect(nextCatalogueCourse([{ slug: "x" }], "x")).toBeNull();
    expect(nextCatalogueCourse([], "x")).toBeNull();
  });
});
