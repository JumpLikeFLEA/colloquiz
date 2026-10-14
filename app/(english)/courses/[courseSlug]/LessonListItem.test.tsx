import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PublicCourseLesson } from "@/lib/coursePageProgress";
import { courseCopy } from "./courseCopy";
import { LessonListItem } from "./LessonListItem";

/** PAY-001 (docs/decisions/0136) — the cue follows the SQL state, not the access level. */

afterEach(cleanup);

const base: PublicCourseLesson = {
  slug: "l",
  title: "Lesson",
  description: null,
  itemCount: 0,
  estimatedMinutes: null,
  accessLevel: "anyone",
  state: "open",
  opensAt: null,
  week: null,
  ordinal: 1,
};

function row(lesson: Partial<PublicCourseLesson>) {
  render(
    <ol>
      <LessonListItem lang="en" href="/x" position={1} lesson={{ ...base, ...lesson }} showFreeBadge={false} bestPercent={null} />
    </ol>,
  );
}

describe("LessonListItem cue", () => {
  it("needs_entitlement shows the paid pill", () => {
    row({ accessLevel: "entitled", state: "needs_entitlement" });
    expect(screen.getByText(courseCopy.en.paidBadge)).toBeTruthy();
  });
  it("needs_sign_in shows the sign-in pill", () => {
    row({ accessLevel: "signed_in", state: "needs_sign_in" });
    expect(screen.getByText(courseCopy.en.signInBadge)).toBeTruthy();
  });
  it("an open lesson shows neither, even when its level is entitled (a grant)", () => {
    row({ accessLevel: "entitled", state: "open" });
    expect(screen.queryByText(courseCopy.en.paidBadge)).toBeNull();
    expect(screen.queryByText(courseCopy.en.signInBadge)).toBeNull();
  });
});
