import { describe, expect, it } from "vitest";
import { asThemePreference, englishThemeScript, THEME_STORAGE_KEY } from "./theme";

/** Runs the script against a fake window/document and reports what it did. */
function run(
  script: string,
  { stored = null, osDark = false, storageThrows = false }: { stored?: string | null; osDark?: boolean; storageThrows?: boolean } = {},
) {
  const store = new Map<string, string>();
  if (stored !== null) store.set(THEME_STORAGE_KEY, stored);
  const classes = new Set<string>();
  const window = {
    localStorage: {
      getItem: (key: string) => {
        if (storageThrows) throw new Error("blocked");
        return store.get(key) ?? null;
      },
      setItem: (key: string, value: string) => {
        if (storageThrows) throw new Error("blocked");
        store.set(key, value);
      },
    },
    matchMedia: (query: string) => ({ matches: osDark && query === "(prefers-color-scheme: dark)" }),
  };
  const document = { documentElement: { classList: { add: (c: string) => classes.add(c) } } };
  new Function("window", "document", script)(window, document);
  return { dark: classes.has("dark"), stored: store.get(THEME_STORAGE_KEY) ?? null };
}

describe("asThemePreference", () => {
  it("accepts the three values and nothing else", () => {
    expect(asThemePreference("dark")).toBe("dark");
    expect(asThemePreference("light")).toBe("light");
    expect(asThemePreference("system")).toBe("system");
    expect(asThemePreference("Dark")).toBeNull();
    expect(asThemePreference(null)).toBeNull();
    expect(asThemePreference(1)).toBeNull();
  });
});

describe("englishThemeScript", () => {
  it("with no server preference and nothing stored, follows the device", () => {
    expect(run(englishThemeScript(null), { osDark: true })).toEqual({ dark: true, stored: null });
    expect(run(englishThemeScript(null), { osDark: false })).toEqual({ dark: false, stored: null });
  });

  it("with no server preference, keeps this device's stored choice", () => {
    expect(run(englishThemeScript(null), { stored: "dark", osDark: false })).toEqual({ dark: true, stored: "dark" });
    expect(run(englishThemeScript(null), { stored: "light", osDark: true })).toEqual({ dark: false, stored: "light" });
    expect(run(englishThemeScript(null), { stored: "system", osDark: true })).toEqual({ dark: true, stored: "system" });
  });

  it("adopts and stores a server preference that differs from the device's", () => {
    expect(run(englishThemeScript("dark"), { stored: "light", osDark: false })).toEqual({ dark: true, stored: "dark" });
    expect(run(englishThemeScript("light"), { stored: "dark", osDark: true })).toEqual({ dark: false, stored: "light" });
    expect(run(englishThemeScript("system"), { stored: "light", osDark: true })).toEqual({ dark: true, stored: "system" });
    expect(run(englishThemeScript("dark"), { stored: null })).toEqual({ dark: true, stored: "dark" });
  });

  it("treats an unrecognised stored value as following the device", () => {
    expect(run(englishThemeScript(null), { stored: "purple", osDark: true }).dark).toBe(true);
    expect(run(englishThemeScript(null), { stored: "purple", osDark: false }).dark).toBe(false);
  });

  it("still applies the server preference when storage is blocked", () => {
    expect(run(englishThemeScript("dark"), { storageThrows: true, osDark: false }).dark).toBe(true);
    expect(run(englishThemeScript(null), { storageThrows: true, osDark: true }).dark).toBe(true);
  });

  it("embeds only a validated literal, so input cannot reach the script", () => {
    const hostile = `dark");alert(1);("`;
    const script = englishThemeScript(hostile);
    expect(script).toBe(englishThemeScript(null));
    expect(script).not.toContain("alert");
    expect(englishThemeScript("dark").endsWith(`})("dark")`)).toBe(true);
    expect(englishThemeScript(null).endsWith(`})(null)`)).toBe(true);
  });
});
