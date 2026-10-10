import { describe, expect, it } from "vitest";
import type { ItemScoreResult } from "../items";
import { explanationsForSession, scoreSession, sessionProgress } from "../lessonPlayer/session";
import { countPracticeBlocks, parseLessonDocument, serializeLessonDocument } from "./parseLessonDocument";
import { formatVoiceDuration } from "./taskBlocks";

function voiceBlock(id: string, extra: Record<string, unknown> = {}) {
  return { id, kind: "task", type: "voice", prompt: [{ text: "Tell us about your week." }], maxSeconds: 180, ...extra };
}

function selectionBlock(id: string) {
  return {
    id,
    kind: "practice",
    type: "selection",
    payload: {
      prompt: "Pick 'cat'",
      multi: false,
      options: [
        { id: "a", text: "Cat" },
        { id: "b", text: "Dog" },
      ],
      correctOptionIds: ["a"],
      explanationRef: "r1",
      explanations: { r1: "\"Cat\" means \"cat\"." },
    },
  };
}

function proseBlock(id: string) {
  return { id, kind: "theory", type: "prose", text: [{ text: "Cats are animals." }] };
}

describe("parseLessonDocument — voice task blocks (VOICE-003)", () => {
  it("parses a voice task among theory and practice blocks", () => {
    const result = parseLessonDocument([proseBlock("p1"), voiceBlock("v1", { compare: "before" }), selectionBlock("q1")]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document[1]).toEqual({
      id: "v1",
      kind: "task",
      type: "voice",
      prompt: [{ text: "Tell us about your week." }],
      maxSeconds: 180,
      compare: "before",
    });
  });

  it("accepts a voice task with no compare slot", () => {
    const result = parseLessonDocument([voiceBlock("v1")]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document[0]).not.toHaveProperty("compare");
  });

  it.each([
    ["no maxSeconds", { maxSeconds: undefined }, "v1: maxSeconds"],
    ["maxSeconds below the floor", { maxSeconds: 14 }, "v1: maxSeconds"],
    ["maxSeconds above the cap", { maxSeconds: 601 }, "v1: maxSeconds"],
    ["fractional maxSeconds", { maxSeconds: 90.5 }, "v1: maxSeconds"],
    ["an unknown compare slot", { compare: "middle" }, "v1: compare"],
    ["an empty prompt", { prompt: [] }, "v1: prompt"],
    ["an unknown task type", { type: "video" }, "v1: type"],
  ])("rejects %s and names the block and field", (_label, extra, field) => {
    const result = parseLessonDocument([voiceBlock("v1", extra)]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((e) => e.field)).toContain(field);
  });

  it("rejects an unrecognized field (strict, like theory blocks)", () => {
    const result = parseLessonDocument([voiceBlock("v1", { scored: true })]);
    expect(result.ok).toBe(false);
  });

  it("enforces unique block ids across task and other blocks", () => {
    const result = parseLessonDocument([proseBlock("x"), voiceBlock("x")]);
    expect(result.ok).toBe(false);
  });

  it("round-trips through serializeLessonDocument unchanged", () => {
    const raw = [proseBlock("p1"), voiceBlock("v1", { compare: "after" }), selectionBlock("q1")];
    const first = parseLessonDocument(raw);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const again = parseLessonDocument(serializeLessonDocument(first.document));
    expect(again).toEqual(first);
  });
});

describe("a voice task leaves count, score and completion alone", () => {
  const withVoice = parseLessonDocument([proseBlock("p1"), voiceBlock("v1"), selectionBlock("q1"), voiceBlock("v2")]);
  const withoutVoice = parseLessonDocument([proseBlock("p1"), selectionBlock("q1")]);
  if (!withVoice.ok || !withoutVoice.ok) throw new Error("fixture must parse");
  const correct: ItemScoreResult = {
    earned: 1,
    possible: 1,
    subResults: [{ id: "q1", correct: true, earned: 1, possible: 1, explanationRef: "r1" }],
  };
  const wrong: ItemScoreResult = {
    earned: 0,
    possible: 1,
    subResults: [{ id: "q1", correct: false, earned: 0, possible: 1, explanationRef: "r1" }],
  };

  it("is not counted as an item (published_item_count)", () => {
    expect(countPracticeBlocks(withVoice.document)).toBe(1);
    expect(countPracticeBlocks(withVoice.document)).toBe(countPracticeBlocks(withoutVoice.document));
  });

  it("does not change the lesson score", () => {
    expect(scoreSession(withVoice.document, { q1: correct })).toEqual(scoreSession(withoutVoice.document, { q1: correct }));
  });

  it("does not hold back completion: every exercise answered without touching the voice task", () => {
    expect(sessionProgress(withVoice.document, { q1: correct })).toEqual({ answered: 1, total: 1 });
  });

  it("ignores a result filed under a voice task's id", () => {
    const results = { v1: wrong };
    expect(sessionProgress(withVoice.document, results)).toEqual({ answered: 0, total: 1 });
    expect(scoreSession(withVoice.document, results)).toEqual(scoreSession(withVoice.document, {}));
    expect(explanationsForSession(withVoice.document, results).size).toBe(0);
  });
});

describe("formatVoiceDuration", () => {
  it.each([
    [45, "45 s"],
    [60, "1 min"],
    [150, "2 min 30 s"],
    [180, "3 min"],
    [600, "10 min"],
  ])("%i s reads as %s", (seconds, expected) => {
    expect(formatVoiceDuration(seconds)).toBe(expected);
  });
});
