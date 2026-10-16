import { describe, expect, it } from "vitest";
import { groupAnswers, toAttemptRow, toLessonScoreRow } from "./answers";

const block = {
  id: "b1", kind: "practice", type: "selection",
  payload: {
    explanations: {}, fallbackExplanation: "why", prompt: "Pick", multi: false,
    options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctOptionIds: ["a"], explanationRef: "x",
  },
};
const row = (over: Record<string, unknown>) =>
  toAttemptRow({
    attempt_id: "att", course_id: "c", lesson_id: "l1", lesson_version_id: "v1", block_id: "b1",
    earned: "1", possible: "1", response: { selectedOptionIds: ["a"] }, created_at: "2026-10-01T10:00:00Z", block,
    ...over,
  });

describe("groupAnswers", () => {
  it("groups by lesson then exercise, attempts oldest first, answers read from the row's own block", () => {
    const g = groupAnswers(
      [
        row({ attempt_id: "2", created_at: "2026-10-01T11:00:00Z", earned: 1, response: { selectedOptionIds: ["a"] } }),
        row({ attempt_id: "1", created_at: "2026-10-01T10:00:00Z", earned: 0, response: { selectedOptionIds: ["b"] } }),
        row({ attempt_id: "3", lesson_id: "l2", response: null }),
      ],
      [toLessonScoreRow({ course_id: "c", lesson_id: "l1", best_percent: 100, complete: true, exercises_answered: 1, exercises_total: 1 })],
    );
    expect(g.size).toBe(2);
    const l1 = g.get("l1")!;
    expect(l1.score).toMatchObject({ bestPercent: 100, complete: true });
    expect(l1.exercises).toHaveLength(1);
    expect(l1.exercises[0].attempts.map((a) => a.attemptId)).toEqual(["1", "2"]);
    expect(l1.exercises[0].attempts[0].answer).toMatchObject({ status: "ok", lines: ["B"] });
    expect(g.get("l2")!.score).toBeNull();
    expect(g.get("l2")!.exercises[0].attempts[0].answer).toEqual({ status: "no_response" });
  });

  it("the same block id in two versions is two exercises", () => {
    const g = groupAnswers([row({ lesson_version_id: "v1" }), row({ attempt_id: "x", lesson_version_id: "v2" })], []);
    expect(g.get("l1")!.exercises).toHaveLength(2);
  });

  it("an attempt whose block is gone from its version says unreadable, not no answer", () => {
    const g = groupAnswers([row({ block: null })], []);
    expect(g.get("l1")!.exercises[0].attempts[0].answer).toEqual({ status: "unreadable" });
  });

  it("empty input is empty", () => {
    expect(groupAnswers([], []).size).toBe(0);
  });
});
