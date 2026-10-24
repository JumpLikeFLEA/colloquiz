import { describe, expect, it } from "vitest";
import { welcomeMessage } from "./welcome";

describe("welcomeMessage", () => {
  it("names the sign-in address and Studio's entry points", () => {
    const m = welcomeMessage({ name: "Maria", siteUrl: "https://colloquiz.app/", expiresOn: null });
    expect(m).toContain("Hi Maria,");
    expect(m).toContain("https://colloquiz.app/login");
    expect(m).toContain("Get started");
    expect(m).toContain("Guide");
    expect(m).not.toContain("through");
  });
  it("greets without a name and states the end date when there is one", () => {
    const m = welcomeMessage({ name: "  ", siteUrl: "https://colloquiz.app", expiresOn: "13 Oct 2027" });
    expect(m.startsWith("Hi,\n")).toBe(true);
    expect(m).toContain("Your seat runs through 13 Oct 2027.");
  });
});
