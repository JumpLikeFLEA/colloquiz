import { describe, expect, it } from "vitest";
import {
  LESSON_IMAGE_BUCKET,
  extractLessonImageUrls,
  lessonAudioMimeType,
  lessonImageObjectPath,
  lessonImagePathFromUrl,
  validateLessonAudioFile,
} from "./lessonImages";

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

  it("finds a theory audio block's url in authored order with the images (0217)", () => {
    const document = [
      { id: "i1", kind: "theory", type: "image", url: "https://cdn/lesson-images/c1/a.png", alt: "a" },
      { id: "a1", kind: "theory", type: "audio", url: "https://cdn/lesson-images/c1/b.mp3" },
    ];
    expect(extractLessonImageUrls(document)).toEqual([
      "https://cdn/lesson-images/c1/a.png",
      "https://cdn/lesson-images/c1/b.mp3",
    ]);
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

  it("carries no image in a voice task block (VOICE-003): only the image beside it is found", () => {
    const document = [
      { id: "v1", kind: "task", type: "voice", prompt: [{ text: "Say it." }], maxSeconds: 60, compare: "before" },
      { id: "i1", kind: "theory", type: "image", url: "https://example.com/a.png", alt: "a" },
    ];
    expect(extractLessonImageUrls(document)).toEqual(["https://example.com/a.png"]);
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

describe("lessonAudioMimeType", () => {
  it("keeps a listed type", () => {
    expect(lessonAudioMimeType({ type: "audio/mpeg", name: "a.mp3" })).toBe("audio/mpeg");
    expect(lessonAudioMimeType({ type: "audio/x-m4a", name: "a.m4a" })).toBe("audio/x-m4a");
    expect(lessonAudioMimeType({ type: "audio/mp4", name: "a.m4a" })).toBe("audio/mp4");
  });

  it("maps audio/mp3 and an empty type by extension", () => {
    expect(lessonAudioMimeType({ type: "audio/mp3", name: "Lesson 1.MP3" })).toBe("audio/mpeg");
    expect(lessonAudioMimeType({ type: "", name: "clip.m4a" })).toBe("audio/mp4");
    expect(lessonAudioMimeType({ type: "", name: "clip.aac" })).toBe("audio/aac");
  });

  it("refuses other audio and non-audio, whatever the extension says", () => {
    expect(lessonAudioMimeType({ type: "audio/wav", name: "clip.mp3" })).toBeNull();
    expect(lessonAudioMimeType({ type: "audio/ogg", name: "clip.ogg" })).toBeNull();
    expect(lessonAudioMimeType({ type: "image/png", name: "clip.mp3" })).toBeNull();
    expect(lessonAudioMimeType({ type: "", name: "clip.wav" })).toBeNull();
    expect(lessonAudioMimeType({ type: "", name: "noextension" })).toBeNull();
  });
});

describe("validateLessonAudioFile", () => {
  it("accepts an MP3 under the limit", () => {
    expect(validateLessonAudioFile({ type: "audio/mpeg", name: "a.mp3", size: 3_000_000 })).toBeNull();
  });

  it("names the allowed types for a WAV", () => {
    expect(validateLessonAudioFile({ type: "audio/wav", name: "a.wav", size: 1000 })).toBe(
      "That file is audio/wav. Lesson audio must be MP3 or M4A.",
    );
  });

  it("refuses a file over the bucket's 5 MB and an empty file", () => {
    expect(validateLessonAudioFile({ type: "audio/mpeg", name: "a.mp3", size: 8 * 1024 * 1024 })).toBe(
      "That file is 8 MB. The limit is 5 MB.",
    );
    // Just over the limit rounds to "5 MB", so the bytes are spelled out.
    expect(validateLessonAudioFile({ type: "audio/mpeg", name: "a.mp3", size: 5 * 1024 * 1024 + 1 })).toBe(
      `That file is ${(5 * 1024 * 1024 + 1).toLocaleString()} bytes. The limit is 5 MB.`,
    );
    expect(validateLessonAudioFile({ type: "audio/mpeg", name: "a.mp3", size: 0 })).toBe("That file is empty.");
  });
});

describe("lessonImageObjectPath for audio", () => {
  it("gives an MP3 or M4A its own extension under the course folder", () => {
    expect(lessonImageObjectPath("c1", "audio/mpeg", "u1")).toBe("c1/u1.mp3");
    expect(lessonImageObjectPath("c1", "audio/x-m4a", "u2")).toBe("c1/u2.m4a");
  });
});
