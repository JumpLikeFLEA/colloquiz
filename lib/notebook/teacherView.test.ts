import { describe, expect, it } from "vitest";
import { teacherNotebook } from "./teacherView";

const loc = (lesson: string, course = "c1") => ({
  course_id: course,
  course_title: `Course ${course}`,
  lesson_id: lesson,
  lesson_title: `Lesson ${lesson}`,
});
const said = (id: string, phrase: string, at: string, lesson = "l1", over = {}) => ({
  id, kind: "said", phrase, phrase_key: phrase.toLowerCase(), quote: `I said ${phrase}`, exact: true, correction: null, created_at: at, ...loc(lesson), ...over,
});

describe("teacherNotebook", () => {
  it("groups by course and lesson, newest first, merging a phrase said twice", () => {
    const out = teacherNotebook({
      entries: [
        said("a", "be about to", "2026-11-01T10:00:00Z"),
        said("b", "Be about to", "2026-11-03T10:00:00Z", "l1", { quote: "newer" }),
        { id: "f", kind: "fix", quote: "I have went", correction: "I went", created_at: "2026-11-02T10:00:00Z", ...loc("l1") },
        said("c", "on the other hand", "2026-11-05T10:00:00Z", "l2"),
      ],
      summaries: [
        { kind: "first", summary: "Clear.", goal: "Use linkers.", next_step: null, taken_at: "2026-11-01T10:00:00Z", ...loc("l1") },
        { kind: "final", summary: "Smoother.", goal: null, next_step: "Try more.", taken_at: "2026-11-05T10:00:00Z", ...loc("l2") },
      ],
    });
    expect(out).not.toBeNull();
    expect(out!.map((c) => c.courseId)).toEqual(["c1"]);
    const [l2, l1] = out![0].lessons;
    expect([l2.lessonId, l1.lessonId]).toEqual(["l2", "l1"]);
    expect(l1.said).toHaveLength(1);
    expect(l1.said[0]).toMatchObject({ quote: "newer", times: 2 });
    expect(l1.fixes.map((f) => f.correction)).toEqual(["I went"]);
    expect(l1.summaries[0].follow).toEqual({ label: "goal", text: "Use linkers." });
    expect(l2.summaries[0].follow).toEqual({ label: "next_step", text: "Try more." });
  });

  it("never draws an own note, even if one were returned", () => {
    const out = teacherNotebook({
      entries: [
        { id: "o", kind: "own", phrase: "private", note: "mine", created_at: "2026-11-01T10:00:00Z", ...loc("l1") },
        said("a", "kept", "2026-11-01T10:00:00Z"),
      ],
      summaries: [],
    });
    expect(JSON.stringify(out)).not.toContain("private");
    expect(out![0].lessons[0].said.map((s) => s.phrase)).toEqual(["kept"]);
  });

  it("is empty for empty lists and null for an unexpected shape", () => {
    expect(teacherNotebook({ entries: [], summaries: [] })).toEqual([]);
    expect(teacherNotebook(null)).toBeNull();
    expect(teacherNotebook({ entries: [] })).toBeNull();
    expect(teacherNotebook([])).toBeNull();
  });

  it("drops rows that do not read and summaries with nothing to draw", () => {
    const out = teacherNotebook({
      entries: [{ id: "x", kind: "said", created_at: "2026-11-01T10:00:00Z", ...loc("l1") }],
      summaries: [{ kind: "first", summary: " ", goal: null, taken_at: "2026-11-01T10:00:00Z", ...loc("l1") }],
    });
    expect(out).toEqual([]);
  });
});
