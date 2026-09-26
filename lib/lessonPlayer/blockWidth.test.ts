import { describe, expect, it } from "vitest";
import type { Item } from "../items";
import type { LessonBlock, LessonPracticeBlock } from "../lessons";
import { lessonBlockWidth } from "./blockWidth";

const text = [{ text: "hello" }];

function theory<T extends LessonBlock>(block: T): T {
  return block;
}

const practiceBlock: LessonPracticeBlock = {
  id: "practice-1",
  kind: "practice",
  // Width only branches on `kind`, never on item shape — a minimal stand-in
  // is enough here; the item registry's own tests cover `Item` shapes.
  item: {} as Item,
};

describe("lessonBlockWidth", () => {
  it("puts every theory type except table/image/video at reading width", () => {
    const readingBlocks: LessonBlock[] = [
      theory({ id: "1", kind: "theory", type: "heading", level: 1, text }),
      theory({ id: "2", kind: "theory", type: "prose", text }),
      theory({ id: "3", kind: "theory", type: "example", text }),
      theory({ id: "4", kind: "theory", type: "callout", variant: "tip", text }),
      theory({ id: "5", kind: "theory", type: "list", ordered: false, items: [text] }),
      theory({
        id: "6",
        kind: "theory",
        type: "self_check",
        prompt: text,
        response: "none",
        modelAnswer: text,
      }),
    ];

    for (const block of readingBlocks) {
      expect(lessonBlockWidth(block)).toBe("reading");
    }
  });

  it("puts table, image and video at wide width", () => {
    const wideBlocks: LessonBlock[] = [
      theory({ id: "7", kind: "theory", type: "table", header: [text], rows: [[text]] }),
      theory({ id: "8", kind: "theory", type: "image", url: "https://example.com/a.png", alt: "an image" }),
      theory({ id: "9", kind: "theory", type: "video", youtubeId: "dQw4w9WgXcQ" }),
    ];

    for (const block of wideBlocks) {
      expect(lessonBlockWidth(block)).toBe("wide");
    }
  });

  it("puts a practice block at reading width", () => {
    expect(lessonBlockWidth(practiceBlock)).toBe("reading");
  });
});
