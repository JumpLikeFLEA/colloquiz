import { describe, expect, it } from "vitest";
import {
  attachmentPath,
  attachmentView,
  buildAttachment,
  exerciseNumber,
  parseAttachment,
  type SnapshotSource,
} from "./snapshot";

// TCH-006: one case per item type and the voice task. Every block is read
// back through the real item registry, so a fixture the parser rejects shows
// up as an empty view or "unreadable", never as a pass.

const base = { explanations: {}, fallbackExplanation: "why" };

const selection = {
  id: "b1", kind: "practice", type: "selection",
  payload: {
    ...base, prompt: "Pick", multi: true,
    options: [{ id: "a", text: "Apple" }, { id: "b", text: "Banana" }, { id: "c", text: "Cherry" }],
    correctOptionIds: ["a"], explanationRef: "x",
  },
};
const grid = {
  id: "b2", kind: "practice", type: "selection_grid",
  payload: {
    ...base, prompt: "T/F",
    rows: [
      { id: "r1", statement: "Sky is blue", correct: true, explanationRef: "x" },
      { id: "r2", statement: "Fire is cold", correct: false, explanationRef: "x" },
    ],
  },
};
const ordering = {
  id: "b3", kind: "practice", type: "ordering",
  payload: {
    ...base, prompt: "Order",
    elements: [
      { id: "e1", text: "First", explanationRef: "x" },
      { id: "e2", text: "Second", explanationRef: "x" },
      { id: "e3", text: "Another", explanationRef: "x" },
    ],
  },
};
const matching = {
  id: "b4", kind: "practice", type: "matching",
  payload: {
    ...base, prompt: "Match",
    left: [
      { id: "l1", content: { kind: "text", text: "cat" } },
      { id: "l2", content: { kind: "image", src: "https://x/y.png", alt: "dog" } },
    ],
    right: [{ id: "r1", content: { kind: "text", text: "chien" } }, { id: "r2", content: { kind: "text", text: "chat" } }],
    pairs: [
      { id: "p1", left: "l1", right: "r2", explanationRef: "x" },
      { id: "p2", left: "l2", right: "r1", explanationRef: "x" },
    ],
  },
};
const slots = {
  id: "b5", kind: "practice", type: "slots",
  payload: {
    ...base, prompt: "She ___ happy and they ___ late.", input: "typed",
    gaps: [
      { id: "g1", acceptedAnswers: ["is"], explanationRef: "x" },
      { id: "g2", acceptedAnswers: ["are"], explanationRef: "x" },
    ],
  },
};
const voice = {
  id: "tk", kind: "task", type: "voice", maxSeconds: 90,
  prompt: [{ text: "Tell us " }, { text: "about", marks: ["emphasis"] }, { text: " your week." }],
};
const theory = { id: "th", kind: "theory", type: "paragraph", text: [{ text: "Hello" }] };

// theory, selection, voice task, grid, ordering, matching, slots
const document = [theory, selection, voice, grid, ordering, matching, slots];

function source(blockId: string, over: Partial<SnapshotSource> = {}): SnapshotSource {
  return {
    course: { slug: "course-a", title: "Course A" },
    lesson: { id: "les-1", slug: "lesson-1", title: "Lesson 1" },
    versionId: "11111111-1111-4111-8111-111111111111",
    document,
    blockId,
    includeAnswer: true,
    ...over,
  };
}

describe("exerciseNumber", () => {
  it("counts practice blocks only, in document order", () => {
    expect(exerciseNumber(document, "b1")).toBe(1);
    expect(exerciseNumber(document, "b2")).toBe(2); // after a voice task
    expect(exerciseNumber(document, "b5")).toBe(5);
  });

  it("is null for a theory block, a task or a missing id", () => {
    expect(exerciseNumber(document, "th")).toBeNull();
    expect(exerciseNumber(document, "tk")).toBeNull();
    expect(exerciseNumber(document, "nope")).toBeNull();
  });
});

describe("buildAttachment", () => {
  it("keeps the raw block, the names and the number", () => {
    const a = buildAttachment(source("b2"));
    expect(a).toMatchObject({
      v: 1, kind: "exercise", number: 2, blockId: "b2", courseSlug: "course-a", lessonTitle: "Lesson 1",
      versionId: "11111111-1111-4111-8111-111111111111",
    });
    expect(a?.block).toBe(grid);
  });

  it("includes the response only once checked and only if the toggle is on", () => {
    const response = { selectedOptionIds: ["a"] };
    expect(buildAttachment(source("b1", { response }))?.response).toEqual(response);
    expect(buildAttachment(source("b1"))).not.toHaveProperty("response"); // before Check
    expect(buildAttachment(source("b1", { response: null }))).not.toHaveProperty("response");
    expect(buildAttachment(source("b1", { response, includeAnswer: false }))).not.toHaveProperty("response");
  });

  it("a voice task has no number and never carries a response", () => {
    const a = buildAttachment(source("tk", { response: { x: 1 } }));
    expect(a).toMatchObject({ kind: "voice_task", number: null });
    expect(a).not.toHaveProperty("response");
  });

  it("refuses a theory block, an unknown id and a non-voice task", () => {
    expect(buildAttachment(source("th"))).toBeNull();
    expect(buildAttachment(source("nope"))).toBeNull();
    expect(buildAttachment(source("t2", { document: [{ id: "t2", kind: "task", type: "written" }] }))).toBeNull();
  });
});

describe("parseAttachment", () => {
  it("round-trips a built snapshot through JSON", () => {
    const built = buildAttachment(source("b1", { response: { selectedOptionIds: ["b"] } }));
    expect(parseAttachment(JSON.parse(JSON.stringify(built)))).toEqual(built);
  });

  it("is null for null, an unknown version, a missing block or a non-object", () => {
    expect(parseAttachment(null)).toBeNull();
    expect(parseAttachment(undefined)).toBeNull();
    expect(parseAttachment("x")).toBeNull();
    const ok = JSON.parse(JSON.stringify(buildAttachment(source("b1"))));
    expect(parseAttachment({ ...ok, v: 2 })).toBeNull();
    expect(parseAttachment({ ...ok, block: null })).toBeNull();
    expect(parseAttachment({ ...ok, kind: "homework" })).toBeNull();
  });
});

describe("attachmentView, one case per type", () => {
  const view = (id: string, response?: unknown) => attachmentView(buildAttachment(source(id, { response }))!);

  it("selection lists its options and the chosen ones, never which are right", () => {
    const v = view("b1", { selectedOptionIds: ["a", "c"] });
    expect(v).toMatchObject({ kind: "exercise", number: 1, prompt: "Pick", lines: ["Apple", "Banana", "Cherry"] });
    expect(v.answer).toEqual({ status: "ok", lines: ["Apple", "Cherry"] });
    expect(JSON.stringify(v)).not.toContain("correctOptionIds");
  });

  it("selection_grid lists its statements without their truth", () => {
    const v = view("b2", [{ rowId: "r1", answer: true }]);
    expect(v.lines).toEqual(["Sky is blue", "Fire is cold"]);
    expect(v.answer).toEqual({ status: "ok", lines: ["Sky is blue: True", "Fire is cold: no answer"] });
  });

  it("ordering lists its elements alphabetically, not in the right order", () => {
    const v = view("b3", { order: ["e2", "e3", "e1"] });
    expect(v.lines).toEqual(["Another", "First", "Second"]);
    expect(v.answer).toEqual({ status: "ok", lines: ["1. Second", "2. Another", "3. First"] });
  });

  it("matching lists the left items, then the right options as one line, no pairing", () => {
    const v = view("b4", [{ left: "l1", right: "r1" }]);
    expect(v.lines).toEqual(["cat", "[image: dog]", "chat · chien"]);
    expect(v.answer).toEqual({ status: "ok", lines: ["cat → chien", "[image: dog] → no answer"] });
  });

  it("slots is its prompt, and the answer is per gap", () => {
    const v = view("b5", [{ gapId: "g1", answer: "is" }, { gapId: "g2", answer: "were" }]);
    expect(v).toMatchObject({ prompt: "She ___ happy and they ___ late.", lines: [] });
    expect(v.answer).toEqual({ status: "ok", lines: ["Gap 1: is", "Gap 2: were"] });
  });

  it("the voice task is its prompt as plain text, with no answer", () => {
    expect(view("tk")).toEqual({ kind: "voice_task", number: null, prompt: "Tell us about your week.", lines: [], answer: { status: "none" } });
  });

  it("no response is 'none'; a response that no longer reads is 'unreadable'", () => {
    expect(view("b1").answer).toEqual({ status: "none" });
    expect(view("b1", { selectedOptionIds: "a" }).answer).toEqual({ status: "unreadable" });
  });

  it("a block that no longer parses gives an empty view rather than throwing", () => {
    const a = buildAttachment(source("b1"))!;
    const broken = { ...a, block: { id: "b1", kind: "practice", type: "selection", payload: {} } };
    expect(attachmentView(broken)).toMatchObject({ prompt: "", lines: [] });
  });
});

describe("attachmentPath", () => {
  it("links an exercise to its card and a voice task to the lesson", () => {
    expect(attachmentPath(buildAttachment(source("b2"))!)).toBe("/courses/course-a/lesson-1#exercise-b2");
    expect(attachmentPath(buildAttachment(source("tk"))!)).toBe("/courses/course-a/lesson-1");
  });
});
