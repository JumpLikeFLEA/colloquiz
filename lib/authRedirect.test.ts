import { describe, expect, it } from "vitest";
import { authDest, isEnglishSurfaceEntry, oauthCallbackUrl, signupEmailRedirectTo } from "./authRedirect";

const ORIGIN = "https://colloquiz.app";

describe("authDest", () => {
  it("keeps a relative path and refuses anything else", () => {
    expect(authDest("/courses/c")).toBe("/courses/c");
    expect(authDest(undefined)).toBe("/");
    expect(authDest("//evil.com")).toBe("/");
    expect(authDest("https://evil.com")).toBe("/");
  });
});

describe("isEnglishSurfaceEntry", () => {
  it("is true for an explicit next outside /app", () => {
    expect(isEnglishSurfaceEntry("/")).toBe(true);
    expect(isEnglishSurfaceEntry("/courses/future-imperfect")).toBe(true);
    expect(isEnglishSurfaceEntry("/courses/future-imperfect/true-or-false")).toBe(true);
    expect(isEnglishSurfaceEntry("/application")).toBe(true);
  });

  it("is false for a bare /login and for every next under /app", () => {
    expect(isEnglishSurfaceEntry(undefined)).toBe(false);
    expect(isEnglishSurfaceEntry("/app")).toBe(false);
    expect(isEnglishSurfaceEntry("/app/")).toBe(false);
    expect(isEnglishSurfaceEntry("/app?x=1")).toBe(false);
    expect(isEnglishSurfaceEntry("/app/s/abc123")).toBe(false);
    expect(isEnglishSurfaceEntry("/courses/../app/groups")).toBe(false);
  });

  it("is false for a next AuthScreen would not follow", () => {
    expect(isEnglishSurfaceEntry("//evil.com")).toBe(false);
    expect(isEnglishSurfaceEntry("https://evil.com/")).toBe(false);
    expect(isEnglishSurfaceEntry("")).toBe(false);
  });
});

describe("signupEmailRedirectTo", () => {
  it("carries next and source to /auth/confirm", () => {
    const url = new URL(signupEmailRedirectTo(ORIGIN, "/courses/c", "telegram"));
    expect(url.origin + url.pathname).toBe(`${ORIGIN}/auth/confirm`);
    expect(url.searchParams.get("next")).toBe("/courses/c");
    expect(url.searchParams.get("source")).toBe("telegram");
  });

  it("omits source when it is null, but always carries next", () => {
    const url = new URL(signupEmailRedirectTo(ORIGIN, "/", null));
    expect(url.searchParams.get("next")).toBe("/");
    expect(url.searchParams.has("source")).toBe(false);
  });
});

describe("oauthCallbackUrl", () => {
  it("is a bare callback when there is nothing to carry", () => {
    expect(oauthCallbackUrl(ORIGIN, "/", null)).toBe(`${ORIGIN}/auth/callback`);
  });

  it("carries next and source", () => {
    const url = new URL(oauthCallbackUrl(ORIGIN, "/", "direct"));
    expect(url.pathname).toBe("/auth/callback");
    expect(url.searchParams.get("next")).toBe("/");
    expect(url.searchParams.get("source")).toBe("direct");
  });

  it("carries next alone, as before", () => {
    expect(oauthCallbackUrl(ORIGIN, "/app/s/abc", null)).toBe(`${ORIGIN}/auth/callback?next=%2Fapp%2Fs%2Fabc`);
  });
});
