import { describe, expect, it } from "vitest";
import { courseSlugFromNextPath } from "./acquisition";

describe("courseSlugFromNextPath", () => {
  it("reads the slug from a course path", () => {
    expect(courseSlugFromNextPath("/courses/future-imperfect")).toBe("future-imperfect");
  });

  it("reads the slug from a lesson path", () => {
    expect(courseSlugFromNextPath("/courses/future-imperfect/will-vs-going-to")).toBe("future-imperfect");
  });

  it("ignores a trailing slash", () => {
    expect(courseSlugFromNextPath("/courses/future-imperfect/")).toBe("future-imperfect");
    expect(courseSlugFromNextPath("/courses/future-imperfect/lesson-1/")).toBe("future-imperfect");
  });

  it("ignores a query string and a hash", () => {
    expect(courseSlugFromNextPath("/courses/future-imperfect?utm_source=telegram")).toBe("future-imperfect");
    expect(courseSlugFromNextPath("/courses/future-imperfect/lesson-1?x=1#top")).toBe("future-imperfect");
    expect(courseSlugFromNextPath("/?next=/courses/future-imperfect")).toBeNull();
  });

  it("returns null for any path outside /courses/<slug>", () => {
    expect(courseSlugFromNextPath("/")).toBeNull();
    expect(courseSlugFromNextPath("/app")).toBeNull();
    expect(courseSlugFromNextPath("/app/courses/future-imperfect")).toBeNull();
    expect(courseSlugFromNextPath("/courses")).toBeNull();
    expect(courseSlugFromNextPath("/courses/")).toBeNull();
    expect(courseSlugFromNextPath("/courses//lesson-1")).toBeNull();
    expect(courseSlugFromNextPath("/coursesfuture-imperfect")).toBeNull();
    expect(courseSlugFromNextPath("")).toBeNull();
  });

  it("decodes percent-encoding once, like the route param", () => {
    expect(courseSlugFromNextPath("/courses/%66uture-imperfect/lesson-1")).toBe("future-imperfect");
    // %2F decodes to a slash, which is not a slug character.
    expect(courseSlugFromNextPath("/courses/future%2Fimperfect")).toBeNull();
    // Double-encoded stays encoded after one decode, so it is not a slug.
    expect(courseSlugFromNextPath("/courses/%2566uture")).toBeNull();
    // Malformed escape.
    expect(courseSlugFromNextPath("/courses/%E0%A4%A")).toBeNull();
  });

  it("rejects slugs outside the stored shape (garbage, case, unicode)", () => {
    expect(courseSlugFromNextPath("/courses/Future-Imperfect")).toBeNull();
    expect(courseSlugFromNextPath("/courses/future_imperfect")).toBeNull();
    expect(courseSlugFromNextPath("/courses/-future")).toBeNull();
    expect(courseSlugFromNextPath("/courses/курс")).toBeNull();
    expect(courseSlugFromNextPath("/courses/a'b")).toBeNull();
  });

  it("rejects other-origin and protocol-relative input", () => {
    expect(courseSlugFromNextPath("//evil.com/courses/future-imperfect")).toBeNull();
    expect(courseSlugFromNextPath("/\\evil.com/courses/future-imperfect")).toBeNull();
    expect(courseSlugFromNextPath("https://evil.com/courses/future-imperfect")).toBeNull();
    expect(courseSlugFromNextPath("@evil.com/courses/future-imperfect")).toBeNull();
    expect(courseSlugFromNextPath("javascript:alert(1)")).toBeNull();
  });

  it("resolves dot segments before checking the prefix", () => {
    expect(courseSlugFromNextPath("/courses/../app/settings")).toBeNull();
    expect(courseSlugFromNextPath("/app/../courses/future-imperfect")).toBe("future-imperfect");
  });
});
