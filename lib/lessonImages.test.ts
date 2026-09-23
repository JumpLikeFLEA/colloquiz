import { describe, expect, it } from "vitest";
import { LESSON_IMAGE_BUCKET, lessonImagePathFromUrl } from "./lessonImages";

describe("lessonImagePathFromUrl", () => {
  it("extracts the object path from a public storage URL", () => {
    const url = `https://project.supabase.co/storage/v1/object/public/${LESSON_IMAGE_BUCKET}/course-1/abc.png`;
    expect(lessonImagePathFromUrl(url)).toBe("course-1/abc.png");
  });

  it("strips a query string", () => {
    const url = `https://project.supabase.co/storage/v1/object/public/${LESSON_IMAGE_BUCKET}/course-1/abc.png?x=1`;
    expect(lessonImagePathFromUrl(url)).toBe("course-1/abc.png");
  });

  it("returns null for a URL not in our bucket — an author-pasted external image", () => {
    expect(lessonImagePathFromUrl("https://example.com/photo.png")).toBeNull();
  });

  it("returns null for null/undefined", () => {
    expect(lessonImagePathFromUrl(null)).toBeNull();
    expect(lessonImagePathFromUrl(undefined)).toBeNull();
  });
});
