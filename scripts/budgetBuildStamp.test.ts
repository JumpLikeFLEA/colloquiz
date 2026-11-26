import { describe, expect, it } from "vitest";
import {
  buildDecision,
  describeSupabaseUrl,
  formatStamp,
  parseStamp,
  sourceFingerprint,
  type SourceEntry,
} from "./budgetBuildStamp";

const bytes = (s: string) => new TextEncoder().encode(s);

const base: SourceEntry[] = [
  { path: "app/page.tsx", content: bytes("export default 1;") },
  { path: "lib/a.ts", content: bytes("a") },
  { path: ".env.local", content: bytes("NEXT_PUBLIC_SUPABASE_URL=https://one.example") },
];

describe("sourceFingerprint", () => {
  it("is stable for the same files in any listing order", () => {
    expect(sourceFingerprint([...base].reverse())).toBe(sourceFingerprint(base));
  });

  it("changes when one file's content changes", () => {
    const edited = base.map((e) => (e.path === "app/page.tsx" ? { ...e, content: bytes("export default 2;") } : e));
    expect(sourceFingerprint(edited)).not.toBe(sourceFingerprint(base));
  });

  it("changes when an env file's value changes", () => {
    const edited = base.map((e) =>
      e.path === ".env.local" ? { ...e, content: bytes("NEXT_PUBLIC_SUPABASE_URL=https://two.example") } : e,
    );
    expect(sourceFingerprint(edited)).not.toBe(sourceFingerprint(base));
  });

  it("changes when a file is added", () => {
    expect(sourceFingerprint([...base, { path: "app/new.tsx", content: bytes("") }])).not.toBe(
      sourceFingerprint(base),
    );
  });

  it("changes when a listed file is missing from disk", () => {
    const deleted = base.map((e) => (e.path === "lib/a.ts" ? { ...e, content: null } : e));
    expect(sourceFingerprint(deleted)).not.toBe(sourceFingerprint(base));
  });

  it("changes when content moves between files (entries are framed)", () => {
    const a: SourceEntry[] = [
      { path: "x", content: bytes("ab") },
      { path: "y", content: bytes("c") },
    ];
    const b: SourceEntry[] = [
      { path: "x", content: bytes("a") },
      { path: "y", content: bytes("bc") },
    ];
    expect(sourceFingerprint(a)).not.toBe(sourceFingerprint(b));
  });

  it("hashes a duplicated path once", () => {
    expect(sourceFingerprint([...base, base[0]])).toBe(sourceFingerprint(base));
  });
});

describe("buildDecision", () => {
  const current = sourceFingerprint(base);
  const local = "http://127.0.0.1:54321";
  const hosted = "https://abcdefghijklmnop.supabase.co";
  const stamp = (over: Partial<{ fingerprint: string; supabaseUrl: string; buildId: string }> = {}) =>
    formatStamp({ fingerprint: current, supabaseUrl: local, buildId: "B1", ...over });
  const decide = (stampRaw: string | null, buildId: string | null = "B1", supabaseUrl = local) =>
    buildDecision({ buildId, stamp: stampRaw, current, supabaseUrl });

  it("builds when there is no .next build", () => {
    expect(decide(stamp(), null).action).toBe("build");
  });

  it("builds when .next exists but carries no stamp", () => {
    expect(decide(null).action).toBe("build");
  });

  it("builds on an older guard's bare-hash stamp, which records no Supabase URL", () => {
    const decision = decide(`${current}\n`);
    expect(decision.action).toBe("build");
    expect(decision.reason).toMatch(/no Supabase URL/);
  });

  it("builds when BUILD_ID changed since the stamp (a `next build` run outside the guard)", () => {
    const decision = decide(stamp(), "B2");
    expect(decision.action).toBe("build");
    expect(decision.reason).toMatch(/outside `npm run budget`/);
  });

  it("builds when the build was made against another Supabase URL, naming both (ref masked)", () => {
    const decision = decide(stamp({ supabaseUrl: hosted }), "B1", local);
    expect(decision).toEqual({
      action: "build",
      reason: "the build was made against https://*.supabase.co, and this run serves http://127.0.0.1:54321",
    });
  });

  it("builds when the stamp differs from the current sources", () => {
    expect(decide(stamp({ fingerprint: "0".repeat(64) }))).toEqual({
      action: "build",
      reason: "sources changed since the last budget build",
    });
  });

  it("reuses only when build id, URL and sources all match, tolerating a trailing newline", () => {
    expect(decide(`${stamp()}\n`).action).toBe("reuse");
  });

  it("treats a trailing slash on the URL as the same URL", () => {
    expect(decide(stamp({ supabaseUrl: `${local}/` })).action).toBe("reuse");
  });
});

describe("parseStamp / formatStamp", () => {
  it("round-trips", () => {
    const s = { fingerprint: "f", supabaseUrl: "http://127.0.0.1:54321", buildId: "B" };
    expect(parseStamp(formatStamp(s))).toEqual(s);
  });

  it("reads a bare hash as a stamp with no URL and no build id", () => {
    expect(parseStamp("abc123\n")).toEqual({ fingerprint: "abc123", supabaseUrl: null, buildId: null });
  });
});

describe("describeSupabaseUrl", () => {
  it("masks a hosted project ref", () => {
    expect(describeSupabaseUrl("https://abcdefghijklmnop.supabase.co")).toBe("https://*.supabase.co");
  });

  it("leaves a local URL as it is", () => {
    expect(describeSupabaseUrl("http://127.0.0.1:54321/")).toBe("http://127.0.0.1:54321");
  });

  it("names a missing URL", () => {
    expect(describeSupabaseUrl(null)).toBe("(no NEXT_PUBLIC_SUPABASE_URL)");
  });
});
