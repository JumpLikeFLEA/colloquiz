import { describe, expect, it } from "vitest";
import { listingHint, toCourseListingRow, LISTING_ERRORS } from "./listedCourses";

describe("toCourseListingRow", () => {
  it("maps a listed published course with a house author", () => {
    expect(
      toCourseListingRow({ course_id: "c1", slug: "s", title: "T", status: "published", listed: true, author_name: "Alina", author_kind: "house" }),
    ).toEqual({ courseId: "c1", slug: "s", title: "T", published: true, listed: true, authorName: "Alina", authorKind: "house" });
  });
  it("maps a draft with no author seat", () => {
    const r = toCourseListingRow({ course_id: "c2", slug: "d", title: "D", status: "draft", listed: false, author_name: null, author_kind: null });
    expect(r.published).toBe(false);
    expect(r.listed).toBe(false);
    expect(r.authorName).toBeNull();
    expect(r.authorKind).toBeNull();
  });
});

describe("listingHint", () => {
  it("says the three states differently", () => {
    const draft = listingHint({ published: false, listed: false });
    const unlisted = listingHint({ published: true, listed: false });
    const listed = listingHint({ published: true, listed: true });
    expect(new Set([draft, unlisted, listed]).size).toBe(3);
  });
});

describe("LISTING_ERRORS", () => {
  it("covers every code set_course_listed returns", () => {
    for (const code of ["forbidden", "course_not_found", "not_published"]) expect(LISTING_ERRORS[code]).toBeDefined();
  });
});
