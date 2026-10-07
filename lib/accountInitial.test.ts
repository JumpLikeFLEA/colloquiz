import { describe, expect, it } from "vitest";
import { accountInitial } from "./accountInitial";

describe("accountInitial", () => {
  it("upper-cases the first character of the email", () => {
    expect(accountInitial("gleb@example.com")).toBe("G");
  });

  it("keeps a Cyrillic first letter, upper-cased", () => {
    expect(accountInitial("анна@example.com")).toBe("А");
  });

  it("ignores surrounding whitespace", () => {
    expect(accountInitial("  maria@example.com")).toBe("M");
  });

  it("returns a whole astral character, not half a surrogate pair", () => {
    expect(accountInitial("𝒢x@example.com")).toBe("𝒢");
  });

  it("returns null when there is no email", () => {
    expect(accountInitial(null)).toBeNull();
    expect(accountInitial("")).toBeNull();
    expect(accountInitial("   ")).toBeNull();
  });

  it("returns null when the address has no local part", () => {
    expect(accountInitial("@example.com")).toBeNull();
  });
});
