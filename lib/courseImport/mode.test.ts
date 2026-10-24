import { describe, expect, it } from "vitest";
import { parseCourseImportMode } from "./mode";

describe("parseCourseImportMode", () => {
  it("is on only for the word on, in any case and with spaces", () => {
    expect(parseCourseImportMode("on")).toBe("on");
    expect(parseCourseImportMode(" ON ")).toBe("on");
  });

  it("fails closed: anything else, a misspelling and nothing at all are off", () => {
    for (const v of ["off", "true", "1", "yes", "onn", "", "  ", undefined, null]) {
      expect(parseCourseImportMode(v as string | undefined)).toBe("off");
    }
  });
});
