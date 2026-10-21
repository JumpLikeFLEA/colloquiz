import { describe, expect, it } from "vitest";
import { findBeforeBlock, firstAnalysisContext, voiceTaskInfo } from "./context";

const voice = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "task",
  type: "voice",
  prompt: [{ text: "Tell us " }, { text: "about", marks: ["emphasis"] }, { text: " your week." }],
  maxSeconds: 120,
  ...extra,
});

describe("voiceTaskInfo", () => {
  it("returns the prompt as plain text, the role and the trimmed list", () => {
    const doc = [voice("v1", { compare: "before", listenFor: ["  I used to ", "make up my mind"] })];
    expect(voiceTaskInfo(doc, "v1")).toEqual({
      ok: true,
      task: {
        prompt: "Tell us about your week.",
        listenFor: ["I used to", "make up my mind"],
        role: "before",
        maxSeconds: 120,
      },
    });
  });

  it("an absent list is an empty list and an absent role is undefined", () => {
    const r = voiceTaskInfo([voice("v1")], "v1");
    expect(r).toMatchObject({ ok: true, task: { listenFor: [], role: undefined } });
  });

  it("reports a missing block and a document that does not parse", () => {
    expect(voiceTaskInfo([voice("v1")], "nope")).toEqual({ ok: false, reason: "no_such_block" });
    expect(voiceTaskInfo([{ id: "x", kind: "nonsense" }], "x")).toEqual({ ok: false, reason: "bad_document" });
    expect(voiceTaskInfo({ not: "an array" }, "x")).toEqual({ ok: false, reason: "bad_document" });
  });
});

describe("findBeforeBlock", () => {
  it("finds the course's before task and skips a document that does not parse", () => {
    const lessons = [
      { lessonId: "l0", document: "garbage" },
      { lessonId: "l1", document: [voice("a")] },
      { lessonId: "l2", document: [voice("b", { compare: "before" })] },
      { lessonId: "l3", document: [voice("c", { compare: "after" })] },
    ];
    expect(findBeforeBlock(lessons)).toEqual({ lessonId: "l2", blockId: "b" });
  });

  it("returns null when no lesson has one", () => {
    expect(findBeforeBlock([{ lessonId: "l1", document: [voice("a", { compare: "after" })] }])).toBeNull();
    expect(findBeforeBlock([])).toBeNull();
  });
});

describe("firstAnalysisContext", () => {
  const stored = {
    goal: "Use I used to twice.",
    errors: [
      { quote: "I go", correction: "I went", explanation: "Past tense.", category: "grammar" },
      { quote: "he go", correction: "he goes", explanation: "-s.", category: "grammar" },
    ],
    mainError: 1,
  };

  it("reads the goal and the main error out of a stored result", () => {
    expect(firstAnalysisContext(stored)).toEqual({
      goal: "Use I used to twice.",
      mainError: { quote: "he go", correction: "he goes", explanation: "-s." },
    });
  });

  it("a result with a goal and no main error keeps the goal", () => {
    expect(firstAnalysisContext({ ...stored, mainError: null })).toEqual({ goal: stored.goal, mainError: null });
  });

  it("is null when the result has neither, or is not a result at all", () => {
    expect(firstAnalysisContext({ goal: null, errors: [], mainError: null })).toBeNull();
    expect(firstAnalysisContext({ goal: "  " })).toBeNull();
    for (const junk of [null, undefined, "x", 3, [], { errors: "no", mainError: 0 }]) {
      expect(firstAnalysisContext(junk)).toBeNull();
    }
  });

  it("an index that points at nothing, or an error with a missing piece, is no main error", () => {
    expect(firstAnalysisContext({ ...stored, mainError: 9, goal: null })).toBeNull();
    expect(firstAnalysisContext({ goal: "g", mainError: 0, errors: [{ quote: "a", correction: "", explanation: "x" }] })).toEqual({
      goal: "g",
      mainError: null,
    });
  });
});
