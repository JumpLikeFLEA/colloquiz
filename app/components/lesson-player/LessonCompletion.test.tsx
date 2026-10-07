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
      <LessonCompletion score={unscored} progress={none} explanations={new Map()} courseSlug="c" nextLesson={null} isSignedIn={false} />,
    );
    expect(screen.queryByText(alliengllCopy.signupOffer.title)).toBeNull();
  });

  it("shows no offer while exercises remain, even though the lesson is already scored", () => {
    // 0068 Decision 2 showed the offer here (any item scored); 0079 D7 waits
    // for every exercise.
    render(
      <LessonCompletion score={scored} progress={partial} explanations={new Map()} courseSlug="c" nextLesson={null} isSignedIn={false} />,
    );
    expect(screen.queryByText(alliengllCopy.signupOffer.title)).toBeNull();
  });

  it("shows the offer after a completed lesson for an anonymous learner", () => {
    render(
      <LessonCompletion score={scored} progress={all} explanations={new Map()} courseSlug="c" nextLesson={null} isSignedIn={false} />,
    );
    expect(screen.getByText(alliengllCopy.signupOffer.title)).toBeDefined();
  });

  it("shows no offer for a signed-in learner, even after a completed lesson", () => {
    render(
      <LessonCompletion score={scored} progress={all} explanations={new Map()} courseSlug="c" nextLesson={null} isSignedIn={true} />,
    );
    expect(screen.queryByText(alliengllCopy.signupOffer.title)).toBeNull();
  });

  it("defaults to no offer when isSignedIn is not passed (pre-ANON-004 callers)", () => {
    render(<LessonCompletion score={scored} progress={all} explanations={new Map()} courseSlug="c" nextLesson={null} />);
    expect(screen.queryByText(alliengllCopy.signupOffer.title)).toBeNull();
  });
});

describe("LessonCompletion — what the card says (docs/decisions/0079 D7)", () => {
  it("counts the remaining exercises, and doesn't claim the lesson is finished, until every one is answered", () => {
    render(<LessonCompletion score={scored} progress={partial} explanations={new Map()} courseSlug="c" nextLesson={null} />);
    expect(screen.getByText("1 exercise left")).toBeDefined();
    expect(screen.queryByText(alliengllCopy.completion.title)).toBeNull();
  });

  it("shows the finished state with the score once every exercise is answered", () => {
    render(<LessonCompletion score={scored} progress={all} explanations={new Map()} courseSlug="c" nextLesson={null} />);
    expect(screen.getByText(alliengllCopy.completion.title)).toBeDefined();
    expect(screen.getByText("50%")).toBeDefined();
    expect(screen.queryByText(/ left$/)).toBeNull();
  });

  it("offers the way back to the course on the last lesson", () => {
    render(<LessonCompletion score={scored} progress={all} explanations={new Map()} courseSlug="c" nextLesson={null} />);
    expect(screen.getByRole("link", { name: alliengllCopy.player.backToCourse }).getAttribute("href")).toBe("/courses/c");
  });
});
