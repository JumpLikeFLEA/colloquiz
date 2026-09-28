import { describe, expect, it } from "vitest";
import {
  COVER_SOURCE_MAX_BYTES,
  coverDrawPlan,
  coverFitZoom,
  coverOutputSize,
  coverQuality,
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

describe("coverQuality", () => {
  it("is too_small just below the block threshold", () => {
    expect(coverQuality(479)).toBe("too_small");
  });

  it("is soft right at the block threshold", () => {
    expect(coverQuality(480)).toBe("soft");
  });

  it("is soft just below the soft threshold", () => {
    expect(coverQuality(799)).toBe("soft");
  });

  it("is phone_ok right at the soft threshold", () => {
    expect(coverQuality(800)).toBe("phone_ok");
  });

  it("is phone_ok just below the phone_ok threshold", () => {
    expect(coverQuality(1599)).toBe("phone_ok");
  });

  it("is ok right at the phone_ok threshold", () => {
    expect(coverQuality(1600)).toBe("ok");
  });
});

describe("coverFitZoom", () => {
  it("is 1 for a 16:9 image", () => {
    expect(coverFitZoom({ width: 1920, height: 1080 })).toBe(1);
  });

  it("is 0.5625 for a square image", () => {
    expect(coverFitZoom({ width: 829, height: 829 })).toBe(0.5625);
  });

  it("is 0.31640625 for a portrait image", () => {
    expect(coverFitZoom({ width: 1080, height: 1920 })).toBe(0.31640625);
  });

  it("is 0.5 for a wide panorama", () => {
    expect(coverFitZoom({ width: 3840, height: 1080 })).toBe(0.5);
  });
});

describe("coverDrawPlan", () => {
  it("maps a crop fully inside the image straight through", () => {
    const plan = coverDrawPlan({ x: 100, y: 50, width: 1920, height: 1080 }, { width: 3000, height: 2000 });
    expect(plan.needsFill).toBe(false);
    expect(plan.output).toEqual({ width: 1920, height: 1080 });
    expect(plan.source).toEqual({ x: 100, y: 50, width: 1920, height: 1080 });
    expect(plan.dest).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it("centres an 829x829 image fitted into the 16:9 frame", () => {
    const crop = { x: -(1474 - 829) / 2, y: 0, width: 1474, height: 829 };
    const plan = coverDrawPlan(crop, { width: 829, height: 829 });
    expect(plan.output).toEqual({ width: 1474, height: 829 });
    expect(plan.source).toEqual({ x: 0, y: 0, width: 829, height: 829 });
    expect(plan.dest).toEqual({ x: 322.5, y: 0, width: 829, height: 829 });
    expect(plan.needsFill).toBe(true);
  });

  it("scales dest down for a crop wider than the output cap", () => {
    const plan = coverDrawPlan({ x: 0, y: 0, width: 2400, height: 1350 }, { width: 3000, height: 2000 });
    expect(plan.output).toEqual({ width: 1920, height: 1080 });
    expect(plan.source).toEqual({ x: 0, y: 0, width: 2400, height: 1350 });
    expect(plan.dest).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(plan.needsFill).toBe(false);
  });

  it("returns null source/dest for a crop entirely outside the image", () => {
    const plan = coverDrawPlan({ x: 2000, y: 2000, width: 500, height: 281.25 }, { width: 829, height: 829 });
    expect(plan.source).toBeNull();
    expect(plan.dest).toBeNull();
    expect(plan.needsFill).toBe(true);
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
