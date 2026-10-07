import { describe, expect, it } from "vitest";
import { DEFAULT_SURFACE_LANG, footerLangForPath, parseSurfaceLang } from "./surfaceLang";

describe("parseSurfaceLang", () => {
  it.each([
    ["ru", "ru"],
    ["en", "en"],
  ] as const)("keeps a saved %s", (value, expected) => {
    expect(parseSurfaceLang(value)).toBe(expected);
  });

  it.each([[undefined], [""], ["RU"], ["de"], ["ru;"]])("falls back to the default for %j", (value) => {
    expect(parseSurfaceLang(value)).toBe(DEFAULT_SURFACE_LANG);
  });

  it("defaults to English", () => {
    expect(DEFAULT_SURFACE_LANG).toBe("en");
  });
});

describe("footerLangForPath", () => {
  it("renders no shared footer on the landing page", () => {
    expect(footerLangForPath("/", "ru")).toBeNull();
    expect(footerLangForPath("/", "en")).toBeNull();
  });

  it.each([["ru"], ["en"]] as const)("follows the saved choice (%s) on a course page", (saved) => {
    expect(footerLangForPath("/courses/future-imperfect", saved)).toBe(saved);
    expect(footerLangForPath("/courses/future-imperfect/", saved)).toBe(saved);
  });

  it.each([["/courses"], ["/courses/future-imperfect/true-or-false"], ["/courses/a/b/c"], ["/privacy"], ["/no-such-page"]])(
    "stays Russian anywhere else (%s)",
    (path) => {
      expect(footerLangForPath(path, "en")).toBe("ru");
    },
  );
});
