import { describe, expect, it } from "vitest";
import { lessonPublishStatus } from "./lessonPublishStatus";

describe("lessonPublishStatus", () => {
  it("is 'unpublished' when the lesson has never been published", () => {
    expect(lessonPublishStatus(null, null)).toBe("unpublished");
    expect(lessonPublishStatus("v1", null)).toBe("unpublished");
  });

  it("is 'published-current' when the published version is the latest draft", () => {
    expect(lessonPublishStatus("v1", "v1")).toBe("published-current");
  });

  it("is 'published-stale' when a newer draft exists than what's published", () => {
    expect(lessonPublishStatus("v2", "v1")).toBe("published-stale");
  });
});
