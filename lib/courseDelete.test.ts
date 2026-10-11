import { describe, expect, it } from "vitest";
import { COURSE_DELETE_BLOCKERS, courseDeleteBlockedMessage, courseImageObjectPaths } from "./courseDelete";

const ID = "3f2b8c1e-5d4a-4b7e-9c6f-1a2b3c4d5e6f";

describe("courseImageObjectPaths", () => {
  it("prefixes each file with the course id", () => {
    expect(courseImageObjectPaths(ID, [{ name: "a.webp" }, { name: "b.png" }])).toEqual([
      `${ID}/a.webp`,
      `${ID}/b.png`,
    ]);
  });

  it("returns nothing for an empty folder", () => {
    expect(courseImageObjectPaths(ID, [])).toEqual([]);
  });

  it("skips names that could leave the folder", () => {
    expect(
      courseImageObjectPaths(ID, [{ name: "" }, { name: "." }, { name: ".." }, { name: "x/y.png" }, { name: "ok.png" }]),
    ).toEqual([`${ID}/ok.png`]);
  });

  it.each(["", "/", "..", "not-a-uuid", `${ID}/`, ` ${ID}`, `${ID}/../other`])(
    "throws for a course id that isn't a bare UUID: %j",
    (bad) => {
      expect(() => courseImageObjectPaths(bad, [{ name: "a.png" }])).toThrow(/not a course id/);
    },
  );
});

describe("courseDeleteBlockedMessage", () => {
  it("is null when nothing blocks", () => {
    expect(courseDeleteBlockedMessage([])).toBeNull();
  });

  it("names the first blocker", () => {
    expect(courseDeleteBlockedMessage(["published", "opens"])).toBe(
      "This course can't be deleted because it is published. Unpublish it first.",
    );
  });

  it("has copy for every code 068 returns", () => {
    for (const code of COURSE_DELETE_BLOCKERS) {
      expect(courseDeleteBlockedMessage([code])).toMatch(/^This course can't be deleted because .+\.$/);
    }
  });

  it("falls back for an unknown code", () => {
    expect(courseDeleteBlockedMessage(["something_new"])).toBe("This course can't be deleted.");
  });
});
