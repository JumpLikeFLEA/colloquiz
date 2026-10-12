import { describe, expect, it } from "vitest";
import { parseLessonDocument } from "../lessons/parseLessonDocument";
import { scoreItem } from "../items";
import { reviewEntriesForSession } from "./reviewEntries";

const doc = [
  { id: "t1", kind: "theory", type: "prose", text: [{ text: "Intro" }] },
  {
    id: "q1",
    kind: "practice",
    type: "selection",
    payload: {
      prompt: "Pick the cat",
      multi: false,
      options: [{ id: "a", text: "Cat" }, { id: "b", text: "Dog" }],
      correctOptionIds: ["a"],
      explanationRef: "r",
      explanations: { r: "Cat is cat." },
    },
  },
  {
    id: "q2",
    kind: "practice",
    type: "selection_grid",
    payload: {
      prompt: "True or false?",
      rows: [
        { id: "r1", statement: "Water is wet", correct: true, explanationRef: "e1" },
        { id: "r2", statement: "Fire is cold", correct: false, explanationRef: "e2" },
        { id: "r3", statement: "Ice is cold", correct: true, explanationRef: "e3" },
      ],
      explanations: { e1: "x1", e2: "x2", e3: "Ice is cold indeed." },
    },
  },
  {
    id: "q3",
    kind: "practice",
    type: "slots",
    payload: {
      prompt: "She ___ to school and ___ home.",
      input: "typed",
      gaps: [
        { id: "g1", acceptedAnswers: ["goes"], explanationRef: "a" },
        { id: "g2", acceptedAnswers: ["walks"], explanationRef: "b" },
      ],
      explanations: { a: "ga", b: "gb" },
    },
  },
];

function parsed() {
  const r = parseLessonDocument(doc);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.document;
}

describe("reviewEntriesForSession", () => {
  it("labels wrong sub-parts with exercise number, sub-part and statement, in document order", () => {
    const document = parsed();
    const [, q1, q2, q3] = document;
    if (q1.kind !== "practice" || q2.kind !== "practice" || q3.kind !== "practice") throw new Error("fixture");
    const results = {
      q1: scoreItem(q1.item, { selectedOptionIds: ["b"] }),
      // rows 1 right, 2 right, 3 wrong
      q2: scoreItem(q2.item, [
        { rowId: "r1", answer: true },
        { rowId: "r2", answer: false },
        { rowId: "r3", answer: false },
      ]),
      q3: scoreItem(q3.item, [
        { gapId: "g1", answer: "goes" },
        { gapId: "g2", answer: "runs" },
      ]),
    };
    const entries = reviewEntriesForSession(document, results);
    expect(entries.map((e) => [e.blockId, e.exerciseNumber, e.subPart, e.context])).toEqual([
      ["q1", 1, null, "Pick the cat"],
      ["q2", 2, "3", "Ice is cold"],
      ["q3", 3, "Gap 2", "She ___ to school and ___ home."],
    ]);
  });

  it("omits unattempted items and correct sub-parts", () => {
    const document = parsed();
    expect(reviewEntriesForSession(document, {})).toEqual([]);
  });
});
