import { describe, expect, it, vi } from "vitest";
import { classifyFunnelSource, isFunnelOptedOut, resolveFunnelSource, type FunnelSourceEnv } from "./funnelSource";

describe("isFunnelOptedOut", () => {
  it("is false when neither signal is set", () => {
    expect(isFunnelOptedOut({})).toBe(false);
  });

  it("is true when doNotTrack is '1'", () => {
    expect(isFunnelOptedOut({ doNotTrack: "1" })).toBe(true);
  });

  it("is false when doNotTrack is '0' or unset", () => {
    expect(isFunnelOptedOut({ doNotTrack: "0" })).toBe(false);
    expect(isFunnelOptedOut({ doNotTrack: null })).toBe(false);
  });

  it("is true when globalPrivacyControl is true", () => {
    expect(isFunnelOptedOut({ globalPrivacyControl: true })).toBe(true);
  });

  it("is false when globalPrivacyControl is false", () => {
    expect(isFunnelOptedOut({ globalPrivacyControl: false })).toBe(false);
  });
});

describe("classifyFunnelSource", () => {
  it("classifies an instagram utm_source", () => {
    expect(classifyFunnelSource("instagram", "")).toBe("instagram");
  });

  it("classifies a telegram utm_source", () => {
    expect(classifyFunnelSource("telegram", "")).toBe("telegram");
  });

  it("is case-insensitive on utm_source", () => {
    expect(classifyFunnelSource("Instagram", "")).toBe("instagram");
  });

  it("utm_source wins over a conflicting referrer", () => {
    expect(classifyFunnelSource("instagram", "https://t.me/somechannel")).toBe("instagram");
  });

  it("falls back to an instagram.com referrer when utm_source is absent", () => {
    expect(classifyFunnelSource(null, "https://www.instagram.com/")).toBe("instagram");
  });

  it("falls back to a t.me referrer when utm_source is absent", () => {
    expect(classifyFunnelSource(null, "https://t.me/somechannel")).toBe("telegram");
  });

  it("returns direct for an unrelated referrer", () => {
    expect(classifyFunnelSource(null, "https://www.google.com/")).toBe("direct");
  });

  it("returns direct for no referrer and no utm_source", () => {
    expect(classifyFunnelSource(null, "")).toBe("direct");
  });

  it("returns direct for an unparseable referrer rather than throwing", () => {
    expect(classifyFunnelSource(null, "not a url")).toBe("direct");
  });

  it("returns direct for an unrecognized utm_source with no matching referrer", () => {
    expect(classifyFunnelSource("newsletter", "")).toBe("direct");
  });
});

describe("resolveFunnelSource", () => {
  function envFrom(overrides: Partial<FunnelSourceEnv> = {}): FunnelSourceEnv {
    const store = new Map<string, string>();
    return {
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
      navigator: {},
      location: { search: "" },
      referrer: "",
      ...overrides,
    };
  }

  it("classifies and caches on first call", () => {
    const setItem = vi.fn();
    const env = envFrom({
      location: { search: "?utm_source=instagram" },
      sessionStorage: { getItem: () => null, setItem },
    });
    expect(resolveFunnelSource(env)).toBe("instagram");
    expect(setItem).toHaveBeenCalledWith("colloquiz_funnel_source", "instagram");
  });

  it("returns the cached source without reclassifying from the current referrer", () => {
    const env = envFrom({
      // If this were re-read, it would classify as telegram — the cached
      // value must win instead, since a learner's second page is this same
      // site's own URL, not their original entry referrer.
      referrer: "https://t.me/somechannel",
      sessionStorage: { getItem: () => "instagram", setItem: vi.fn() },
    });
    expect(resolveFunnelSource(env)).toBe("instagram");
  });

  it("returns null and touches no storage when Do Not Track is set", () => {
    const getItem = vi.fn();
    const setItem = vi.fn();
    const env = envFrom({
      navigator: { doNotTrack: "1" },
      sessionStorage: { getItem, setItem },
    });
    expect(resolveFunnelSource(env)).toBeNull();
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("returns null and touches no storage when Global Privacy Control is set", () => {
    const getItem = vi.fn();
    const setItem = vi.fn();
    const env = envFrom({
      navigator: { globalPrivacyControl: true },
      sessionStorage: { getItem, setItem },
    });
    expect(resolveFunnelSource(env)).toBeNull();
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("ignores a corrupted cached value and reclassifies", () => {
    const env = envFrom({
      sessionStorage: { getItem: () => "not-a-real-source", setItem: vi.fn() },
    });
    expect(resolveFunnelSource(env)).toBe("direct");
  });
});
