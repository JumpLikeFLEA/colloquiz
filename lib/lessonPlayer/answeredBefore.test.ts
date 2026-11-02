import { describe, expect, it } from "vitest";
import { parseLessonDocument } from "../lessons/parseLessonDocument";
import type { ItemScoreResult } from "../items";
import { earlierAnswers, withEarlierAnswers, type EarlierAttempt } from "./answeredBefore";
import { scoreSession, sessionProgress } from "./session";

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
      explanations: { r1: "It is a cat." },
    },
  };
}

function lesson(...ids: string[]) {
  const parsed = parseLessonDocument([{ id: "p1", kind: "theory", type: "prose", text: [{ text: "Hi." }] }, ...ids.map(selectionBlock)]);
  if (!parsed.ok) throw new Error("fixture document failed to parse");
  return parsed.document;
}

const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-222222222222";
const TEN = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10"];

function attempt(blockId: string, earned: number, possible = 1, lessonVersionId = V1): EarlierAttempt {
  return { lessonVersionId, blockId, earned, possible };
}

const right: ItemScoreResult = { earned: 1, possible: 1, subResults: [] };
const wrong: ItemScoreResult = { earned: 0, possible: 1, subResults: [] };

describe("earlierAnswers", () => {
  it("is empty with no earlier attempt", () => {
    const doc = lesson(...TEN);
    expect(earlierAnswers(doc, V1, [])).toEqual({});
    expect(sessionProgress(doc, withEarlierAnswers({}, earlierAnswers(doc, V1, [])))).toEqual({ answered: 0, total: 10 });
  });

  it("counts the exercises answered before, best attempt per block", () => {
    const doc = lesson(...TEN);
    const earlier = earlierAnswers(doc, V1, [attempt("q1", 0), attempt("q1", 1), attempt("q2", 0), ...["q3", "q4", "q5"].map((id) => attempt(id, 1))]);
    expect(Object.keys(earlier).sort()).toEqual(["q1", "q2", "q3", "q4", "q5"]);
    expect(earlier.q1).toEqual({ earned: 1, possible: 1 });
    expect(sessionProgress(doc, withEarlierAnswers({}, earlier))).toEqual({ answered: 5, total: 10 });
  });

  it("counts all of them when every exercise was answered", () => {
    const doc = lesson("q1", "q2");
    const earlier = earlierAnswers(doc, V1, [attempt("q1", 1), attempt("q2", 0)]);
    const merged = withEarlierAnswers({}, earlier);
    expect(sessionProgress(doc, merged)).toEqual({ answered: 2, total: 2 });
    expect(scoreSession(doc, merged).percent).toBe(50);
  });

  it("does not carry answers over a republish: other versions and blocks the document no longer holds", () => {
    // v1 had q1..q3; v2 changed q3 into q3b. The learner answered all of v1.
    const v2 = lesson("q1", "q2", "q3b");
    const earlier = earlierAnswers(v2, V2, [attempt("q1", 1), attempt("q2", 1), attempt("q3", 1), attempt("q3", 1, 1, V2)]);
    // Only the v2 attempt on a block v2 holds would count, and q3 is not in v2.
    expect(earlier).toEqual({});
    const later = earlierAnswers(v2, V2, [attempt("q1", 1, 1, V2), attempt("q3", 1, 1, V2)]);
    expect(Object.keys(later)).toEqual(["q1"]);
  });

  it("ignores everything when no version is being played (preview, demo)", () => {
    expect(earlierAnswers(lesson("q1"), "", [attempt("q1", 1)])).toEqual({});
  });
});

describe("withEarlierAnswers", () => {
  it("lets the 5 left in this visit complete a lesson half done before", () => {
    const doc = lesson(...TEN);
    const earlier = earlierAnswers(doc, V1, TEN.slice(0, 5).map((id) => attempt(id, 1)));
    const now = Object.fromEntries(TEN.slice(5).map((id) => [id, right]));
    expect(sessionProgress(doc, withEarlierAnswers(now, earlier))).toEqual({ answered: 10, total: 10 });
  });

  it("never lowers a block's score: a worse answer now keeps the earlier best", () => {
    const doc = lesson("q1", "q2");
    const earlier = earlierAnswers(doc, V1, [attempt("q1", 1)]);
    const merged = withEarlierAnswers({ q1: wrong, q2: right }, earlier);
    expect(scoreSession(doc, merged).percent).toBe(100);
  });

  it("takes this visit's answer when it is as good or better", () => {
    const doc = lesson("q1");
    const now: ItemScoreResult = { earned: 2, possible: 2, subResults: [] };
    const merged = withEarlierAnswers({ q1: now }, earlierAnswers(doc, V1, [attempt("q1", 1, 2)]));
    expect(merged.q1).toBe(now);
  });
});
