import { describe, expect, it } from "vitest";
import {
  buildCourseOutline,
  OUTLINE_ABOUT_MAX,
  OUTLINE_EXPRESSION_MAX,
  OUTLINE_MAX_EXPRESSIONS,
  OUTLINE_MAX_LESSONS,
  OUTLINE_TITLE_MAX,
  type OutlineRow,
} from "./outline";

function voice(id: string, listenFor?: string[]) {
  return {
    id,
    kind: "task",
    type: "voice",
    prompt: [{ text: "Say it." }],
    maxSeconds: 60,
    ...(listenFor ? { listenFor } : {}),
  };
}
const prose = { id: "p1", kind: "theory", type: "prose", text: [{ text: "SECRET THEORY TEXT" }] };

function row(id: string, over: Partial<OutlineRow> = {}): OutlineRow {
  return {
    id,
    title: `Title ${id}`,
    description: `About ${id}`,
    published_version_id: `v-${id}`,
    archived_at: null,
    document: [prose],
    ...over,
  };
}

describe("buildCourseOutline (docs/decisions/0229 Decisions 17, 19)", () => {
  it("lists the lessons after the interim lesson, numbered by their place on the course page", () => {
    const rows = [row("a"), row("b"), row("c"), row("d")];
    const out = buildCourseOutline(rows, "b");
    expect(out.map((l) => [l.number, l.lessonId])).toEqual([
      [3, "c"],
      [4, "d"],
    ]);
  });

  it("numbers by position, not by ordinal: the rows carry no ordinal, so a gap in ordinals cannot show", () => {
    // Rows arrive in the page's order (ordinal, then slug); ordinals 1, 5, 9, 40 would still be 1..4.
    const out = buildCourseOutline([row("l1"), row("l5"), row("l9"), row("l40")], "l1");
    expect(out.map((l) => l.number)).toEqual([2, 3, 4]);
  });

  it("leaves out archived and unpublished lessons, and does not count them in the numbers", () => {
    const rows = [
      row("a"),
      row("gone", { archived_at: "2026-01-01T00:00:00Z" }),
      row("draft", { published_version_id: null }),
      row("b"),
      row("c"),
    ];
    const out = buildCourseOutline(rows, "a");
    expect(out.map((l) => [l.number, l.lessonId])).toEqual([
      [2, "b"],
      [3, "c"],
    ]);
  });

  it("is empty when the interim lesson is the last one, or is not on the page", () => {
    expect(buildCourseOutline([row("a"), row("b")], "b")).toEqual([]);
    expect(buildCourseOutline([row("a"), row("b", { archived_at: "2026-01-01T00:00:00Z" })], "b")).toEqual([]);
    expect(buildCourseOutline([row("a")], "missing")).toEqual([]);
  });

  it("never includes the interim lesson or earlier ones", () => {
    const ids = buildCourseOutline([row("a"), row("b"), row("c")], "b").map((l) => l.lessonId);
    expect(ids).not.toContain("a");
    expect(ids).not.toContain("b");
  });

  it("carries title, description and every voice task's expressions, de-duplicated, from the document", () => {
    const rows = [
      row("a"),
      row("b", {
        document: [prose, voice("v1", ["first of all", "after that"]), voice("v2", ["after that", "in the end"]), voice("v3")],
      }),
    ];
    const [l] = buildCourseOutline(rows, "a");
    expect(l).toMatchObject({
      number: 2,
      lessonId: "b",
      title: "Title b",
      about: "About b",
      expressions: ["first of all", "after that", "in the end"],
    });
  });

  it("sends nothing from a lesson's theory, exercises or answers", () => {
    const [l] = buildCourseOutline([row("a"), row("b")], "a");
    expect(JSON.stringify(l)).not.toContain("SECRET THEORY TEXT");
    expect(Object.keys(l).sort()).toEqual(["about", "expressions", "lessonId", "number", "title"]);
  });

  it("has no about for an empty description, and no expressions for a document that does not parse", () => {
    const rows = [row("a"), row("b", { description: "  ", document: { not: "an array" } })];
    const [l] = buildCourseOutline(rows, "a");
    expect(l.about).toBeNull();
    expect(l.expressions).toEqual([]);
  });

  it("caps the lessons, the title, the description and the expressions", () => {
    const many = Array.from({ length: OUTLINE_MAX_LESSONS + 5 }, (_, i) => row(`x${i}`));
    expect(buildCourseOutline(many, "x0")).toHaveLength(OUTLINE_MAX_LESSONS);

    const longLines = Array.from({ length: OUTLINE_MAX_EXPRESSIONS + 6 }, (_, i) => `e${i} ${"y".repeat(50)}`);
    const [l] = buildCourseOutline(
      [
        row("a"),
        row("b", {
          title: "t".repeat(500),
          description: "d".repeat(2000),
          document: [voice("v1", longLines.slice(0, 12)), voice("v2", longLines.slice(12, 24)), voice("v3", longLines.slice(24, 36))],
        }),
      ],
      "a",
    );
    expect(l.title).toHaveLength(OUTLINE_TITLE_MAX);
    expect(l.about).toHaveLength(OUTLINE_ABOUT_MAX);
    expect(l.expressions.length).toBeLessThanOrEqual(OUTLINE_MAX_EXPRESSIONS);
    expect(l.expressions.every((e) => e.length <= OUTLINE_EXPRESSION_MAX)).toBe(true);
  });
});
