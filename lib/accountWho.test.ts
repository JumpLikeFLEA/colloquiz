import { describe, expect, it } from "vitest";
import { accountWho } from "./accountWho";

describe("accountWho (SHELL-039)", () => {
  it("prefers the email", () => expect(accountWho({ email: "a@b.c", username: "x" })).toBe("a@b.c"));
  it("falls back to @username", () => expect(accountWho({ email: null, username: "probe" })).toBe("@probe"));
  it("is null with neither", () => expect(accountWho({ email: null, username: null })).toBeNull());
});
