import { describe, expect, it } from "vitest";
import { identityLabel, isOnlySignInMethod } from "./signInMethods";

describe("identityLabel", () => {
  it("names an identity by its email", () => {
    expect(identityLabel({ email: "gleb@example.com", preferred_username: "gleb" })).toBe("gleb@example.com");
  });

  it("names a Telegram identity, which has no email, by its @username", () => {
    expect(identityLabel({ preferred_username: "alina_cher" })).toBe("@alina_cher");
  });

  it("is null with neither", () => {
    expect(identityLabel({})).toBeNull();
    expect(identityLabel(null)).toBeNull();
    expect(identityLabel(undefined)).toBeNull();
  });
});

describe("isOnlySignInMethod", () => {
  it("refuses to disconnect the last identity, and allows it with two", () => {
    expect(isOnlySignInMethod(0)).toBe(true);
    expect(isOnlySignInMethod(1)).toBe(true);
    expect(isOnlySignInMethod(2)).toBe(false);
  });
});
