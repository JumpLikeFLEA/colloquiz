import { describe, expect, it } from "vitest";
import { safeNext } from "./safeNext";

/**
 * Pre-push review of ANON-004 found `${origin}${next}` (the pattern every
 * caller of this function used to build directly) is a real open redirect:
 * `next = "@evil.com"` makes that concatenation
 * `"http://site.com@evil.com"`, which the WHATWG URL parser reads as
 * userinfo `site.com` followed by host `evil.com`. Every case below is
 * checked against what it ACTUALLY resolves to (`new URL(next, origin)`),
 * not against a pattern the string happens to match — see safeNext.ts's own
 * doc comment for why that distinction is the point of this module.
 */
const origin = "http://localhost:3000";

describe("safeNext", () => {
  describe("rejects everything that doesn't resolve same-origin", () => {
    it.each([
      // [label, input, expected output]
      ["@evil.com — the userinfo trick this function exists to stop", "@evil.com", "/@evil.com"],
      ["%40evil.com, unwrapped from inside a wrapped URL's own next=", "%40evil.com", "/%40evil.com"],
      ["protocol-relative //evil.com", "//evil.com", "/"],
      ["backslash-prefixed /\\evil.com", "/\\evil.com", "/"],
      ["a fully-qualified other-origin URL", "https://evil.com", "/"],
      ["a javascript: pseudo-URL", "javascript:alert(1)", "/"],
      ["a percent-encoded protocol-relative path", "/%2F%2Fevil.com", "/%2F%2Fevil.com"],
      ["a leading tab before //evil.com", "\t//evil.com", "/"],
      ["a leading newline before //evil.com", "\n//evil.com", "/"],
      ["a full URL with the userinfo trick already applied", "http://localhost:3000@evil.com", "/"],
    ] as const)("%s", (_label, input, expected) => {
      const result = safeNext(input, origin);
      // Every result must itself resolve same-origin — the actual property
      // that matters, not just a match against this table's expected value.
      expect(new URL(result, origin).origin).toBe(origin);
      expect(result).toBe(expected);
    });
  });

  describe("passes safe input through", () => {
    it("a same-origin relative path with a query string, unchanged", () => {
      expect(safeNext("/courses/x/lessons/y?claim=abc", origin)).toBe("/courses/x/lessons/y?claim=abc");
    });

    it("a same-origin absolute URL, reduced to path + search + hash", () => {
      expect(safeNext("http://localhost:3000/courses/x?claim=abc#frag", origin)).toBe(
        "/courses/x?claim=abc#frag",
      );
    });

    it("the bare root path", () => {
      expect(safeNext("/", origin)).toBe("/");
    });
  });
});
