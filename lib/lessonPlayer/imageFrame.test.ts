import { describe, expect, it } from "vitest";
import { IMAGE_SIZES } from "../lessons";
import { imageFrame } from "./imageFrame";

describe("imageFrame", () => {
  it("gives an image with no size the full column, as before sizes existed", () => {
    expect(imageFrame(undefined)).toEqual({
      maxWidthClass: "",
      sizes: "(min-width: 1024px) 672px, (min-width: 576px) 544px, 100vw",
    });
  });

  it("caps each size at its own maximum width", () => {
    expect(imageFrame("small").maxWidthClass).toBe("max-w-64");
    expect(imageFrame("medium").maxWidthClass).toBe("max-w-96");
    expect(imageFrame("large").maxWidthClass).toBe("max-w-lg");
  });

  it("has a frame for every size the schema allows, each one different", () => {
    const classes = IMAGE_SIZES.map((size) => imageFrame(size).maxWidthClass);
    expect(classes.every((c) => c.length > 0)).toBe(true);
    expect(new Set(classes).size).toBe(IMAGE_SIZES.length);
  });

  it("never asks for a source wider than the cap", () => {
    expect(imageFrame("small").sizes).toBe("256px");
    expect(imageFrame("medium").sizes).toContain("384px");
    expect(imageFrame("large").sizes).toContain("512px");
  });
});
