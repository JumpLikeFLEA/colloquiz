import { describe, expect, it } from "vitest";
import { parseWritingState, PRACTICE_STATE, sendingWritingBlockIds } from "./state";

const body = { paragraphs: [{ runs: [{ text: "Good" }] }] };

describe("parseWritingState", () => {
  it("reads a cohort route with an unsent slot", () => {
    expect(parseWritingState({ ok: true, route: "cohort", locked: false, submission: null, feedback: null })).toEqual({
      route: "cohort", locked: false, submission: null, feedback: null,
    });
  });
  it("reads a sent answer and a locked one with its feedback", () => {
    const raw = {
      ok: true, route: "linked", locked: true,
      submission: { id: "s1", body: "Hi", submitted_at: "t0", updated_at: "t1" },
      feedback: { body, published_at: "t2" },
    };
    const s = parseWritingState(raw);
    expect(s.locked).toBe(true);
    expect(s.submission).toEqual({ id: "s1", body: "Hi", updatedAt: "t1" });
    expect(s.feedback?.body.paragraphs[0].runs[0].text).toBe("Good");
  });
  it("a locked flag without readable feedback is not locked", () => {
    const raw = { ok: true, route: "linked", locked: true, submission: { id: "s1", body: "Hi", updated_at: "t1" }, feedback: { body: { paragraphs: [] }, published_at: "t2" } };
    const s = parseWritingState(raw);
    expect(s.locked).toBe(false);
    expect(s.feedback).toBeNull();
  });
  it("anything unexpected is practice", () => {
    for (const raw of [null, undefined, "x", [], { ok: false, error: "not_found" }, { ok: true, route: "elsewhere" }]) {
      expect(parseWritingState(raw).route).toBe("practice");
    }
    expect(parseWritingState(null)).toEqual(PRACTICE_STATE);
  });
});

describe("sendingWritingBlockIds", () => {
  it("lists only ticked writing tasks", () => {
    const doc = [
      { id: "a", kind: "task", type: "writing", sendToTeacher: true },
      { id: "b", kind: "task", type: "writing", sendToTeacher: false },
      { id: "c", kind: "task", type: "voice", sendToTeacher: true },
      { id: "d", kind: "theory" },
      null,
      { kind: "task", type: "writing", sendToTeacher: true },
    ];
    expect(sendingWritingBlockIds(doc)).toEqual(["a"]);
  });
});
