import { describe, expect, it } from "vitest";
import { BOUNDARY_LANG, DEFAULT_SURFACE_LANG, footerLangForPath, pageLangForPath, parseSurfaceLang } from "./surfaceLang";

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

  it.each([["ru"], ["en"]] as const)("is always English on a lesson page, whatever was saved (%s)", (saved) => {
    expect(footerLangForPath("/courses/future-imperfect/true-or-false", saved)).toBe("en");
    expect(footerLangForPath("/courses/future-imperfect/true-or-false/", saved)).toBe("en");
  });

  it.each([["/courses"], ["/courses/a/b/c"], ["/privacy"], ["/no-such-page"]])(
    "stays Russian anywhere else (%s)",
    (path) => {
      expect(footerLangForPath(path, "en")).toBe("ru");
    },
  );
});

describe("pageLangForPath", () => {
  it.each([["ru"], ["en"]] as const)("follows the saved choice (%s) on the landing page", (saved) => {
    expect(pageLangForPath("/", saved)).toBe(saved);
  });

  it.each([["ru"], ["en"]] as const)("follows the saved choice (%s) on a course page", (saved) => {
    expect(pageLangForPath("/courses/future-imperfect", saved)).toBe(saved);
    expect(pageLangForPath("/courses/future-imperfect/", saved)).toBe(saved);
  });

  it.each([["ru"], ["en"]] as const)("is always English on a lesson page, whatever was saved (%s)", (saved) => {
    expect(pageLangForPath("/courses/future-imperfect/true-or-false", saved)).toBe("en");
    expect(pageLangForPath("/courses/future-imperfect/true-or-false/", saved)).toBe("en");
  });

  it.each([["/courses"], ["/courses/a/b/c"], ["/privacy"], ["/no-such-page"]])(
    "is the boundary language anywhere else (%s)",
    (path) => {
      expect(pageLangForPath(path, "en")).toBe(BOUNDARY_LANG);
    },
  );

  it("keeps the 404 and error pages Russian", () => {
    expect(BOUNDARY_LANG).toBe("ru");
  });

  it("agrees with the footer on every route but /", () => {
    for (const path of ["/courses/x", "/courses/x/y", "/privacy", "/no-such-page"]) {
      for (const saved of ["ru", "en"] as const) {
        expect(footerLangForPath(path, saved)).toBe(pageLangForPath(path, saved));
      }
    }
  });
});
