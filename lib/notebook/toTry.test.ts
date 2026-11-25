import { describe, expect, it } from "vitest";
import { lesson, own, said, voice } from "./fixtures";
import { toTryRows } from "./toTry";
import type { NotebookEntry, ReadableLesson, TryGateRow } from "./types";

const gate = (hasBefore: boolean, beforeTaken: boolean, courseId = "c1"): TryGateRow => ({ courseId, hasBefore, beforeTaken });
const phrases = (g: TryGateRow[], lessons: ReadableLesson[], entries: NotebookEntry[] = []) =>
  toTryRows(g, lessons, entries).map((r) => r.phrase);

const beforeLesson = lesson({ id: "l1", ordinal: 1, document: [voice("b", ["one", "two"], "before")] });
const weekly = lesson({ id: "l2", ordinal: 2, document: [voice("w", ["three"]), voice("a", ["one", "two"], "after")] });

describe("toTryRows, the before gate", () => {
  it("a before task and no take: nothing", () => {
    expect(phrases([gate(true, false)], [beforeLesson, weekly])).toEqual([]);
  });

  it("a before task and a take: the list", () => {
    expect(phrases([gate(true, true)], [beforeLesson, weekly])).toEqual(["one", "two", "three"]);
  });

  it("no before task: the lists of readable lessons only", () => {
    // Lesson 3 exists but the session could not read its document.
    const unread = lesson({ id: "l3", ordinal: 3, document: null });
    expect(phrases([gate(false, false)], [weekly, unread])).toEqual(["three", "one", "two"]);
  });

  it("an unreadable before lesson: nothing until taken, then the readable lists", () => {
    expect(phrases([gate(true, false)], [weekly])).toEqual([]);
    expect(phrases([gate(true, true)], [weekly])).toEqual(["three", "one", "two"]);
  });

  it("a before task the session sees while the gate says none still hides the list", () => {
    expect(phrases([gate(false, false)], [beforeLesson, weekly])).toEqual([]);
    // A block the schema refuses still counts, as it does in SQL.
    const odd = lesson({ document: [{ kind: "task", type: "voice", compare: "before", prompt: 4 }] });
    expect(phrases([gate(false, false)], [odd, weekly])).toEqual([]);
  });

  it("an archived lesson neither lists nor hides", () => {
    const archived = lesson({ id: "l9", ordinal: 0, archived: true, document: [voice("x", ["gone"], "before")] });
    expect(phrases([gate(false, false)], [archived, weekly])).toEqual(["three", "one", "two"]);
  });

  it("each course has its own gate, and a course that is not started has no row", () => {
    const other = lesson({ id: "m1", courseId: "c2", document: [voice("w", ["other"])] });
    const notStarted = lesson({ id: "n1", courseId: "c3", document: [voice("w", ["secret"])] });
    const rows = toTryRows([gate(true, false), gate(false, false, "c2")], [beforeLesson, weekly, other, notStarted], []);
    expect(rows).toEqual([{ courseId: "c2", lessonId: "m1", phrase: "other" }]);
  });
});

describe("toTryRows, minus what was said", () => {
  const list = lesson({ document: [voice("w", ["I don't mind", "Be about to", "keep"])] });
  const open = [gate(false, false)];

  it("compares trimmed, case-insensitively, with apostrophes equal; close counts as said", () => {
    expect(phrases(open, [list], [said(" i DON’T mind ", { exact: false })])).toEqual(["Be about to", "keep"]);
  });

  it("compares the other way round too: a typographic list and a straight said phrase", () => {
    const typographic = lesson({ document: [voice("w", ["I don’t mind"])] });
    expect(phrases(open, [typographic])).toEqual(["I don’t mind"]);
    expect(phrases(open, [typographic], [said("I don't mind")])).toEqual([]);
  });

  it("a phrase said in another course, or kept as an own note, is still to try", () => {
    expect(phrases(open, [list], [said("keep", { courseId: "c2" }), own("keep")])).toContain("keep");
  });

  it("deleting a said phrase puts it back", () => {
    const entry = said("keep");
    expect(phrases(open, [list], [entry])).not.toContain("keep");
    expect(phrases(open, [list], [])).toContain("keep");
  });

  it("lists a phrase once, in lesson order, from the first lesson that has it", () => {
    const later = lesson({ id: "l2", ordinal: 2, document: [voice("w", ["KEEP", "new"])] });
    const rows = toTryRows(open, [later, list], []);
    expect(rows.map((r) => [r.lessonId, r.phrase])).toEqual([
      ["l1", "I don't mind"],
      ["l1", "Be about to"],
      ["l1", "keep"],
      ["l2", "new"],
    ]);
  });

  it("ignores blocks that are not voice tasks with a list", () => {
    const doc = [null, "x", { kind: "practice" }, { ...voice("w", []), listenFor: undefined }, voice("v", ["ok"])];
    expect(phrases(open, [lesson({ document: doc })])).toEqual(["ok"]);
  });
});
