import { describe, expect, it } from "vitest";
import { pluralize } from "./pluralCategory";

const ruLessons = { one: "урок", few: "урока", many: "уроков", other: "урока" };
const enLessons = { one: "lesson", other: "lessons" };

describe("pluralize", () => {
  it.each([
    [1, "урок"],
    [2, "урока"],
    [5, "уроков"],
    [11, "уроков"],
    [21, "урок"],
    [22, "урока"],
  ])("ru: %i → %s", (n, expected) => {
    expect(pluralize(n, "ru", ruLessons)).toBe(expected);
  });

  it.each([
    [1, "lesson"],
    [5, "lessons"],
  ])("en: %i → %s", (n, expected) => {
    expect(pluralize(n, "en", enLessons)).toBe(expected);
  });

  it("falls back to `other` when the locale's category has no form", () => {
    // ru 5 is "many"; this table deliberately omits it.
    expect(pluralize(5, "ru", { one: "урок", other: "уроки" })).toBe("уроки");
  });
});
