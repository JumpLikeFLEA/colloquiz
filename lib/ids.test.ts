import { describe, expect, it } from "vitest";
import { UUID_PATTERN, isUuid } from "./ids";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("isUuid", () => {
  it("accepts lower and upper case", () => {
    expect(isUuid(ID)).toBe(true);
    expect(isUuid(ID.toUpperCase())).toBe(true);
  });
  it("rejects braces, wrong length, empty and non-strings", () => {
    expect(isUuid(`{${ID}}`)).toBe(false);
    expect(isUuid(ID.slice(1))).toBe(false);
    expect(isUuid(`${ID}0`)).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(123)).toBe(false);
    expect(isUuid({})).toBe(false);
  });
  it("rejects non-hex characters", () => {
    expect(isUuid("zf8fad5b-d9cb-469f-a165-70867728950e")).toBe(false);
  });
});

describe("UUID_PATTERN", () => {
  it("composes into a case-sensitive regex", () => {
    const re = new RegExp(`^(${UUID_PATTERN})/(${UUID_PATTERN})$`);
    expect(re.test(`${ID}/${ID}`)).toBe(true);
    expect(re.test(`${ID.toUpperCase()}/${ID}`)).toBe(false);
  });
});
