import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MessageThread } from "./MessageThread";
import { toMessage } from "@/lib/messages/messages";
import { attachmentLabelsEn } from "@/lib/alliengll/askTeacherCopy";

/**
 * TCH-006 (docs/decisions/0153) — a message that carries a frozen exercise
 * renders it as a read-only card naming the course, lesson and "Exercise N",
 * linking to the lesson, in both threads (the same component serves both).
 */

afterEach(cleanup);

const body = (text: string) => ({ paragraphs: [{ runs: [{ text }] }] });
const block = {
  id: "ex2", kind: "practice", type: "selection",
  payload: {
    explanations: {}, fallbackExplanation: "why", prompt: "Pick one", multi: false,
    options: [{ id: "a", text: "Apple" }, { id: "b", text: "Banana" }], correctOptionIds: ["a"], explanationRef: "x",
  },
};
const stored = {
  v: 1, kind: "exercise", courseSlug: "course-a", courseTitle: "Course A", lessonSlug: "lesson-1", lessonTitle: "Lesson 1",
  lessonId: "l1", versionId: "v1", blockId: "ex2", number: 2, block, response: { selectedOptionIds: ["b"] },
};
const labels = {
  you: "You", them: "Anna", newMessage: "New", unreadable: "x",
  attachment: attachmentLabelsEn, attachmentUnreadable: attachmentLabelsEn.unreadableAttachment,
};

function thread(attachment: unknown) {
  const m = toMessage({ message_id: "m1", author_id: "a", mine: true, body: body("Why?"), created_at: "2026-10-16T10:00:00Z", read_at: null, attachment });
  return <MessageThread messages={[m]} locale="en-GB" labels={labels} />;
}

describe("MessageThread — attached exercise", () => {
  it("shows the card under the text: course · lesson, Exercise N, prompt, options and the answer", () => {
    const { container } = render(thread(stored));
    const card = container.querySelector("[data-attachment='exercise']")!;
    expect(card.textContent).toContain("Course A · Lesson 1");
    expect(card.textContent).toContain("Exercise 2");
    expect(card.textContent).toContain("Pick one");
    expect(card.textContent).toContain("Apple");
    expect(card.textContent).toContain("Banana"); // as an option, and as the answer
    expect(card.textContent).toContain("Answer");
    expect(card.textContent).not.toContain("correctOptionIds");
  });

  it("links to the lesson's exercise card", () => {
    render(thread(stored));
    const link = screen.getByRole("link", { name: /Exercise 2/ });
    expect(link.getAttribute("href")).toBe("/courses/course-a/lesson-1#exercise-ex2");
  });

  it("says the answer was not included when the student left it out", () => {
    const { response: _omit, ...withoutAnswer } = stored;
    render(thread(withoutAnswer));
    expect(screen.getByText("Answer not included.")).toBeDefined();
  });

  it("shows no card on a plain message, and a muted line for an attachment that no longer parses", () => {
    const { container, unmount } = render(thread(null));
    expect(container.querySelector("[data-attachment]")).toBeNull();
    unmount();
    render(thread({ v: 9 }));
    expect(screen.getByText("The attached exercise can't be shown.")).toBeDefined();
  });
});
