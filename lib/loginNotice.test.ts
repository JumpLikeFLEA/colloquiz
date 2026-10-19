import { describe, expect, it } from "vitest";
import { loginNotice } from "./loginNotice";

describe("loginNotice", () => {
  it("keeps the Colloquiz wording on a Colloquiz entry", () => {
    expect(loginNotice("account_deleted", undefined)).toBe(
      "Your account has been closed and your personal details erased. Thanks for using Colloquiz.",
    );
    expect(loginNotice("account_deleted", "/app/settings")).toContain("Thanks for using Colloquiz");
  });

  it("drops the Colloquiz name on the English entry (/my/settings' destination)", () => {
    const text = loginNotice("account_deleted", "/");
    expect(text).toBe("Your account has been closed and your personal details erased.");
    expect(text).not.toContain("Colloquiz");
  });

  it("shows the other notices unchanged on either entry", () => {
    expect(loginNotice("confirmed_sign_in", "/")).toBe("Your email has been confirmed. Please sign in with your password.");
    expect(loginNotice("confirmed_sign_in", undefined)).toBe("Your email has been confirmed. Please sign in with your password.");
  });

  it("is null for no notice or an unknown one, including inherited keys", () => {
    expect(loginNotice(undefined, "/")).toBeNull();
    expect(loginNotice("nope", "/")).toBeNull();
    expect(loginNotice("toString", undefined)).toBeNull();
    expect(loginNotice("toString", "/")).toBeNull();
  });
});
