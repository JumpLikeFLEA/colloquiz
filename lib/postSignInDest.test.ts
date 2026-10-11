import { describe, expect, it } from "vitest";
import { postSignInDest, signInDestDependsOnRole, STUDIO_HOME } from "./postSignInDest";

describe("postSignInDest", () => {
  it("sends an editor with next=/ to /studio", () => {
    expect(postSignInDest("/", true)).toBe(STUDIO_HOME);
    expect(STUDIO_HOME).toBe("/studio");
  });

  it("leaves a non-editor with next=/ on /", () => {
    expect(postSignInDest("/", false)).toBe("/");
  });

  it("lets an explicit deeper next win for an editor", () => {
    for (const next of [
      "/courses/future-imperfect/true-or-false",
      "/invite/00000000000000000000000000000000",
      "/app",
      "/app/admin/review",
      "/studio/reviews",
    ]) {
      expect(postSignInDest(next, true)).toBe(next);
      expect(postSignInDest(next, false)).toBe(next);
    }
  });

  it("treats a root with a query or hash as an explicit target", () => {
    expect(postSignInDest("/?source=reel", true)).toBe("/?source=reel");
    expect(postSignInDest("/#catalogue", true)).toBe("/#catalogue");
  });
});

describe("signInDestDependsOnRole", () => {
  it("is true only where postSignInDest can change the destination", () => {
    for (const next of ["/", "/?source=reel", "/#catalogue", "/courses/x", "/app", "/studio"]) {
      const changes = postSignInDest(next, true) !== postSignInDest(next, false);
      expect(signInDestDependsOnRole(next)).toBe(changes);
    }
  });
});
