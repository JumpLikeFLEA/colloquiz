import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { alliengllCopy } from "@/lib/alliengll/copy";
import type { TheoryBlock } from "@/lib/lessons";
import { LessonUnavailable } from "./LessonUnavailable";
import { signInCopy } from "./signInCopy";

/**
 * ANON-011 (docs/decisions/0104) — the two denied states. What SQL decides
 * (the state, the teaser cut, the open lesson) is input here; this proves
 * the screen renders it, and that the sign-in link carries this lesson as
 * `next` (ANON-016 owns what /login does with it).
 */

afterEach(cleanup);

const teaser: TheoryBlock[] = [
  { id: "h1", kind: "theory", type: "heading", level: 1, text: [{ text: "Will vs going to" }] },
  { id: "p1", kind: "theory", type: "prose", text: [{ text: "Use going to for plans." }] },
];

const band = <header>band</header>;

describe("LessonUnavailable", () => {
  it("needs_sign_in: renders the teaser, a sign-in link back to this lesson, and the open lesson", () => {
    const { container } = render(
      <LessonUnavailable
        band={band}
        courseSlug="future"
        lessonPath="/courses/future/lesson-4"
        state={{ access: "needs_sign_in", teaser, openLesson: { slug: "lesson-1", title: "True or false" } }}
      />,
    );

    expect(container.querySelector("[data-access]")?.getAttribute("data-access")).toBe("needs_sign_in");
    const teaserEl = screen.getByTestId("lesson-teaser");
    expect(teaserEl.textContent).toContain("Will vs going to");
    expect(teaserEl.textContent).toContain("Use going to for plans.");

    expect(screen.getByRole("link", { name: signInCopy.cta }).getAttribute("href")).toBe(
      "/login?next=%2Fcourses%2Ffuture%2Flesson-4",
    );
    expect(screen.getByRole("link", { name: "True or false" }).getAttribute("href")).toBe("/courses/future/lesson-1");
    expect(screen.getByRole("link", { name: alliengllCopy.player.backToCourse }).getAttribute("href")).toBe("/courses/future");
    expect(screen.queryByText(alliengllCopy.notAvailable.body)).toBeNull();
  });

  it("needs_sign_in with an empty teaser and no open lesson: title, description (the band) and the prompt only", () => {
    render(
      <LessonUnavailable
        band={band}
        courseSlug="future"
        lessonPath="/courses/future/lesson-4"
        state={{ access: "needs_sign_in", teaser: [], openLesson: null }}
      />,
    );
    expect(screen.queryByTestId("lesson-teaser")).toBeNull();
    expect(screen.queryByText(signInCopy.openLessonLead)).toBeNull();
    expect(screen.getByRole("link", { name: signInCopy.cta })).toBeTruthy();
  });

  it("needs_sign_in: a teaser video is a server-rendered link out to YouTube (0104 Decision 2)", () => {
    render(
      <LessonUnavailable
        band={band}
        courseSlug="future"
        lessonPath="/courses/future/lesson-4"
        state={{
          access: "needs_sign_in",
          teaser: [{ id: "v1", kind: "theory", type: "video", youtubeId: "dQw4w9WgXcQ" }],
          openLesson: null,
        }}
      />,
    );
    const link = screen.getByRole("link", { name: signInCopy.watchVideo });
    expect(link.getAttribute("href")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("needs_entitlement: the paid card, unchanged, with no sign-in prompt", () => {
    const { container } = render(
      <LessonUnavailable band={band} courseSlug="future" lessonPath="/courses/future/exit-check" state={{ access: "needs_entitlement" }} />,
    );
    expect(container.querySelector("[data-access]")?.getAttribute("data-access")).toBe("needs_entitlement");
    expect(screen.getByText(alliengllCopy.notAvailable.body)).toBeTruthy();
    expect(screen.queryByRole("link", { name: signInCopy.cta })).toBeNull();
    expect(screen.queryByTestId("lesson-teaser")).toBeNull();
  });
});
