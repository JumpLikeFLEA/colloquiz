import { describe, expect, it } from "vitest";
import { courseLinkLessonIds, parseLessonTargets, toLessonTargets } from "./lessonTargets";

const row = (over: Record<string, unknown> = {}) => ({
  id: "L3",
  slug: "plans",
  title: "Plans for the weekend",
  published_version_id: "v1",
  archived_at: null,
  courses: { slug: "english-a2" },
  ...over,
});

describe("courseLinkLessonIds", () => {
  it("reads the ids of an interim result, once each", () => {
    const r = { kind: "interim", courseLinks: [{ lessonId: "a" }, { lessonId: "b" }, { lessonId: "a" }, { lesson: 4 }] };
    expect(courseLinkLessonIds(r)).toEqual(["a", "b"]);
  });
  it("is empty for any other kind, and for junk", () => {
    expect(courseLinkLessonIds({ kind: "final", courseLinks: [{ lessonId: "a" }] })).toEqual([]);
    expect(courseLinkLessonIds(null)).toEqual([]);
    expect(courseLinkLessonIds({ kind: "interim", courseLinks: "x" })).toEqual([]);
  });
});

describe("toLessonTargets", () => {
  it("gives the current title and the lesson's path", () => {
    expect(toLessonTargets([row()])).toEqual({ L3: { title: "Plans for the weekend", href: "/courses/english-a2/plans" } });
  });
  it("tolerates an array embed", () => {
    expect(toLessonTargets([row({ courses: [{ slug: "c" }] })]).L3.href).toBe("/courses/c/plans");
  });
  it("gives an archived or unpublished lesson no target (control: the same row published is there)", () => {
    expect(Object.keys(toLessonTargets([row()]))).toEqual(["L3"]);
    expect(toLessonTargets([row({ archived_at: "2026-11-01T00:00:00Z" })])).toEqual({});
    expect(toLessonTargets([row({ published_version_id: null })])).toEqual({});
  });
  it("skips a row missing its course or slug", () => {
    expect(toLessonTargets([row({ courses: null }), row({ slug: "" })])).toEqual({});
  });
});

describe("parseLessonTargets", () => {
  it("keeps same-site lesson paths only", () => {
    expect(
      parseLessonTargets({
        ok: { title: "T", href: "/courses/c/l" },
        evil: { title: "T", href: "https://example.com/x" },
        js: { title: "T", href: "javascript:alert(1)" },
        deep: { title: "T", href: "/courses/c/l/extra" },
      }),
    ).toEqual({ ok: { title: "T", href: "/courses/c/l" } });
  });
  it("is empty for anything that is not an object", () => {
    expect(parseLessonTargets(undefined)).toEqual({});
    expect(parseLessonTargets("x")).toEqual({});
  });
});
