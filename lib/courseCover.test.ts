import { describe, expect, it } from "vitest";
import {
  COVER_SOURCE_MAX_BYTES,
  coverCropQuality,
  coverOutputSize,
  isOgDecodableCoverUrl,
  validateCoverSource,
} from "./courseCover";

describe("coverOutputSize", () => {
  it("caps a large crop at the max output width", () => {
    expect(coverOutputSize({ width: 4000, height: 2250 })).toEqual({ width: 1920, height: 1080 });
  });

  it("never upscales a smaller crop", () => {
    expect(coverOutputSize({ width: 1200, height: 675 })).toEqual({ width: 1200, height: 675 });
  });

  it("rounds an odd width's derived height", () => {
    expect(coverOutputSize({ width: 1001, height: 563 })).toEqual({ width: 1001, height: 563 });
  });
});

describe("coverCropQuality", () => {
  it("is too_small just below the minimum crop width", () => {
    expect(coverCropQuality({ width: 959, height: 540 })).toBe("too_small");
  });

  it("is low right at the minimum crop width", () => {
    expect(coverCropQuality({ width: 960, height: 540 })).toBe("low");
  });

  it("is low just below the recommended width", () => {
    expect(coverCropQuality({ width: 1599, height: 900 })).toBe("low");
  });

  it("is ok right at the recommended width", () => {
    expect(coverCropQuality({ width: 1600, height: 900 })).toBe("ok");
  });
});

describe("validateCoverSource", () => {
  it("rejects a file one byte over the source cap", () => {
    expect(validateCoverSource({ type: "image/png", size: COVER_SOURCE_MAX_BYTES + 1 })).not.toBeNull();
  });

  it("accepts a file exactly at the source cap", () => {
    expect(validateCoverSource({ type: "image/png", size: COVER_SOURCE_MAX_BYTES })).toBeNull();
  });

  it("rejects an unsupported mime type", () => {
    expect(validateCoverSource({ type: "image/gif", size: 1024 })).not.toBeNull();
  });

  it("rejects an empty file", () => {
    expect(validateCoverSource({ type: "image/png", size: 0 })).not.toBeNull();
  });
});

describe("isOgDecodableCoverUrl", () => {
  it("rejects a .webp URL", () => {
    expect(isOgDecodableCoverUrl("https://x.test/cover.webp")).toBe(false);
  });

  it("accepts a .JPG URL case-insensitively", () => {
    expect(isOgDecodableCoverUrl("https://x.test/cover.JPG")).toBe(true);
  });

  it("accepts a .png URL with a query string", () => {
    expect(isOgDecodableCoverUrl("https://x.test/cover.png?token=abc")).toBe(true);
  });

  it("rejects null", () => {
    expect(isOgDecodableCoverUrl(null)).toBe(false);
  });
});
