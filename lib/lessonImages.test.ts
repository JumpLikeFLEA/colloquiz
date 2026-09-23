import { describe, expect, it } from "vitest";
import { LESSON_IMAGE_BUCKET, extractLessonImageUrls, lessonImagePathFromUrl } from "./lessonImages";

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

describe("extractLessonImageUrls", () => {
  it("finds a theory image block's url", () => {
    const document = [{ id: "b1", kind: "theory", type: "image", url: "https://cdn/lesson-images/c1/a.png", alt: "a" }];
    expect(extractLessonImageUrls(document)).toEqual(["https://cdn/lesson-images/c1/a.png"]);
  });

  it("finds matching item image content on both the left and right side", () => {
    const document = [
      {
        id: "q1",
        kind: "practice",
        type: "matching",
        payload: {
          left: [{ id: "l1", content: { kind: "image", src: "https://cdn/lesson-images/c1/left.png" } }],
          right: [
            { id: "r1", content: { kind: "image", src: "https://cdn/lesson-images/c1/right.png" } },
            { id: "r2", content: { kind: "text", text: "not an image" } },
          ],
        },
      },
    ];
    expect(extractLessonImageUrls(document)).toEqual([
      "https://cdn/lesson-images/c1/left.png",
      "https://cdn/lesson-images/c1/right.png",
    ]);
  });

  it("ignores theory blocks that aren't images and practice blocks that aren't matching", () => {
    const document = [
      { id: "b1", kind: "theory", type: "prose", text: [{ text: "hi" }] },
      { id: "q1", kind: "practice", type: "selection", payload: { prompt: "p", options: [] } },
    ];
    expect(extractLessonImageUrls(document)).toEqual([]);
  });

  it("skips malformed blocks instead of throwing", () => {
    const document = [null, "not an object", 42, { kind: "practice", type: "matching" /* no payload */ }];
    expect(extractLessonImageUrls(document)).toEqual([]);
  });

  it("returns an empty array for a non-array document", () => {
    expect(extractLessonImageUrls(null)).toEqual([]);
    expect(extractLessonImageUrls({})).toEqual([]);
  });
});
