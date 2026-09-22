import { describe, expect, it } from "vitest";
import { parseLessonDocument } from "../lessons/parseLessonDocument";
import type { ItemScoreResult } from "../items";
import { buildYouTubeEmbedUrl, explanationsForSession, scoreSession } from "./session";

function selectionBlock(id: string) {
  return {
    id,
    kind: "practice",
    type: "selection",
    payload: {
      prompt: "Pick the correct translation of 'cat'",
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

function parseFixture(...ids: string[]) {
  const document = [proseBlock("p1"), ...ids.map(selectionBlock)];
  const result = parseLessonDocument(document);
  if (!result.ok) throw new Error("fixture document failed to parse");
  return result.document;
}

describe("scoreSession", () => {
  it("is unscored when no practice item has been attempted yet", () => {
    const document = parseFixture("q1", "q2");
    const score = scoreSession(document, {});
    expect(score.status).toBe("unscored");
  });

  it("rolls up only the items that have been scored so far, in document order", () => {
    const document = parseFixture("q1", "q2");
    const correct: ItemScoreResult = {
      earned: 1,
      possible: 1,
      subResults: [{ id: "q1", correct: true, earned: 1, possible: 1, explanationRef: "r1" }],
    };
    const score = scoreSession(document, { q1: correct });
    expect(score.status).toBe("scored");
    expect(score.percent).toBe(100);
    expect(score.items).toHaveLength(1);
    expect(score.items[0].itemId).toBe("q1");
  });
});

describe("explanationsForSession", () => {
  it("has no entry for an unattempted item", () => {
    const document = parseFixture("q1");
    const map = explanationsForSession(document, {});
    expect(map.has("q1")).toBe(false);
  });

  it("resolves a wrong sub-response's explanation, and omits a correct one", () => {
    const document = parseFixture("q1");
    const wrong: ItemScoreResult = {
      earned: 0,
      possible: 1,
      subResults: [{ id: "q1", correct: false, earned: 0, possible: 1, explanationRef: "r1" }],
    };
    const map = explanationsForSession(document, { q1: wrong });
    expect(map.get("q1")).toEqual([{ subResultId: "q1", explanation: "\"Cat\" means \"cat\"." }]);
  });
});

describe("buildYouTubeEmbedUrl", () => {
  it("builds a youtube-nocookie.com embed URL from a bare video id", () => {
    expect(buildYouTubeEmbedUrl("dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1",
    );
  });
});
