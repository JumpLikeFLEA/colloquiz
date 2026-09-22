import { describe, expect, it } from "vitest";
import {
  CalloutBlockSchema,
  ExampleBlockSchema,
  HeadingBlockSchema,
  ImageBlockSchema,
  ListBlockSchema,
  ProseBlockSchema,
  TheoryBlockSchema,
  VideoBlockSchema,
} from "./theoryBlocks";

const text = [{ text: "hello" }];

describe("heading", () => {
  it("accepts a valid heading and defaults level to 1", () => {
    const result = HeadingBlockSchema.safeParse({ id: "h1", kind: "theory", type: "heading", text });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.level).toBe(1);
  });

  it("accepts level 2", () => {
    const result = HeadingBlockSchema.safeParse({ id: "h1", kind: "theory", type: "heading", text, level: 2 });
    expect(result.success).toBe(true);
  });

  it("rejects a level outside 1/2", () => {
    const result = HeadingBlockSchema.safeParse({ id: "h1", kind: "theory", type: "heading", text, level: 3 });
    expect(result.success).toBe(false);
  });
});

describe("prose", () => {
  it("accepts valid prose", () => {
    const result = ProseBlockSchema.safeParse({ id: "p1", kind: "theory", type: "prose", text });
    expect(result.success).toBe(true);
  });

  it("rejects empty text", () => {
    const result = ProseBlockSchema.safeParse({ id: "p1", kind: "theory", type: "prose", text: [] });
    expect(result.success).toBe(false);
  });
});

describe("example", () => {
  it("accepts with and without a label", () => {
    expect(ExampleBlockSchema.safeParse({ id: "e1", kind: "theory", type: "example", text }).success).toBe(true);
    expect(
      ExampleBlockSchema.safeParse({ id: "e1", kind: "theory", type: "example", text, label: "Example: past tense" })
        .success,
    ).toBe(true);
  });
});

describe("callout", () => {
  it("accepts each variant", () => {
    for (const variant of ["tip", "note", "warning"]) {
      const result = CalloutBlockSchema.safeParse({ id: "c1", kind: "theory", type: "callout", variant, text });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an unknown variant", () => {
    const result = CalloutBlockSchema.safeParse({ id: "c1", kind: "theory", type: "callout", variant: "danger", text });
    expect(result.success).toBe(false);
  });
});

describe("list", () => {
  it("accepts an ordered and an unordered list", () => {
    const items = [text, [{ text: "second item" }]];
    expect(ListBlockSchema.safeParse({ id: "l1", kind: "theory", type: "list", ordered: true, items }).success).toBe(
      true,
    );
    expect(ListBlockSchema.safeParse({ id: "l1", kind: "theory", type: "list", ordered: false, items }).success).toBe(
      true,
    );
  });

  it("rejects an empty items array", () => {
    const result = ListBlockSchema.safeParse({ id: "l1", kind: "theory", type: "list", ordered: true, items: [] });
    expect(result.success).toBe(false);
  });
});

describe("image", () => {
  const base = { id: "i1", kind: "theory" as const, type: "image" as const, url: "https://example.com/x.png", alt: "A cat" };

  it("accepts a valid image with required alt text", () => {
    expect(ImageBlockSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a non-URL", () => {
    const result = ImageBlockSchema.safeParse({ ...base, url: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing alt", () => {
    const { alt: _alt, ...rest } = base;
    const result = ImageBlockSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe("video", () => {
  const base = { id: "v1", kind: "theory" as const, type: "video" as const, youtubeId: "dQw4w9WgXcQ" };

  it("accepts a valid 11-character YouTube id", () => {
    expect(VideoBlockSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a full YouTube URL, per the acceptance line", () => {
    const result = VideoBlockSchema.safeParse({ ...base, youtubeId: "https://youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(result.success).toBe(false);
  });

  it("rejects a short or long id", () => {
    expect(VideoBlockSchema.safeParse({ ...base, youtubeId: "short" }).success).toBe(false);
    expect(VideoBlockSchema.safeParse({ ...base, youtubeId: "waytoolongforavalidid" }).success).toBe(false);
  });
});

describe("TheoryBlockSchema (the discriminated union)", () => {
  it("routes to the right member by `type`", () => {
    expect(TheoryBlockSchema.safeParse({ id: "h1", kind: "theory", type: "heading", text }).success).toBe(true);
    expect(
      TheoryBlockSchema.safeParse({ id: "v1", kind: "theory", type: "video", youtubeId: "dQw4w9WgXcQ" }).success,
    ).toBe(true);
  });

  it("rejects an unknown block type", () => {
    const result = TheoryBlockSchema.safeParse({ id: "f1", kind: "theory", type: "formula", text });
    expect(result.success).toBe(false);
  });
});
