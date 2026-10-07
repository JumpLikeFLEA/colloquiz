import { describe, expect, it } from "vitest";
import { buildDecision, sourceFingerprint, type SourceEntry } from "./budgetBuildStamp";

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

  it("builds when there is no .next build", () => {
    expect(buildDecision({ buildIdExists: false, stamp: current, current }).action).toBe("build");
  });

  it("builds when .next exists but carries no stamp", () => {
    expect(buildDecision({ buildIdExists: true, stamp: null, current }).action).toBe("build");
  });

  it("builds when the stamp differs from the current sources", () => {
    const decision = buildDecision({ buildIdExists: true, stamp: "0".repeat(64), current });
    expect(decision).toEqual({ action: "build", reason: "sources changed since the last budget build" });
  });

  it("reuses only when the stamp matches, tolerating a trailing newline", () => {
    expect(buildDecision({ buildIdExists: true, stamp: `${current}\n`, current }).action).toBe("reuse");
  });
});
