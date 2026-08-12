import { describe, it, expect } from "vitest";
import { buildPerfReport, DEFAULT_BUDGETS, type RunDoc, type StatRow } from "./perfReport";

// Helpers to build minimal RunDocs without repeating the whole shape each time.
function row(name: string, over: Partial<StatRow> = {}): StatRow {
  return { name, p50: 100, p95: 120, min: 90, max: 130, n: 20, okRate: 1, ...over };
}

function run(over: Partial<RunDoc> = {}): RunDoc {
  return {
    generatedAt: "2026-08-12T19:31:37.950Z",
    target: "prod",
    origin: "https://colloquiz.app",
    iters: 20,
    includeWrites: false,
    routes: [row("/"), row("/leaderboard")],
    routesTotal: [row("/"), row("/leaderboard")],
    rpcs: [row("get_subject_stats"), row("get_leaderboard")],
    ...over,
  };
}

describe("buildPerfReport", () => {
  it("clean run with no baseline flags nothing", () => {
    const { markdown, problems } = buildPerfReport(run(), undefined, DEFAULT_BUDGETS);
    expect(problems).toHaveLength(0);
    expect(markdown).toContain("Problems flagged: none");
    expect(markdown).toContain("Baseline: none (first run for this target)");
    // Tables still render.
    expect(markdown).toContain("## Layer A — routes (TTFB, ms)");
    expect(markdown).toContain("## Layer B — hot RPCs (ms)");
    // Digest collapses to a single "None" line.
    expect(markdown).toContain("None — all metrics within budget");
  });

  it("flags a route p50 over budget with a budget reason", () => {
    const doc = run({ routes: [row("/", { p50: 640, p95: 700 }), row("/leaderboard")] });
    const { problems, markdown } = buildPerfReport(doc, undefined, DEFAULT_BUDGETS);
    const p = problems.find((x) => x.name === "/");
    expect(p).toBeDefined();
    expect(p!.kind).toBe("route");
    expect(p!.reasons.some((r) => r.includes("over 400ms budget"))).toBe(true);
    expect(markdown).toContain("### route /");
    // Backing RPC evidence line is present for "/".
    expect(markdown).toContain("Backing RPCs: get_subject_stats");
  });

  it("flags an unstable tail when p95 exceeds the variance ratio", () => {
    // p50 stays under budget so ONLY the variance rule fires.
    const doc = run({ rpcs: [row("get_my_rank", { p50: 69, p95: 396, max: 396 }), row("get_leaderboard")] });
    const { problems } = buildPerfReport(doc, undefined, DEFAULT_BUDGETS);
    const p = problems.find((x) => x.name === "get_my_rank");
    expect(p).toBeDefined();
    expect(p!.reasons.some((r) => r.includes("unstable tail"))).toBe(true);
    // Not over the 150ms RPC budget, so no budget reason.
    expect(p!.reasons.some((r) => r.includes("budget"))).toBe(false);
  });

  it("flags a regression vs baseline with old→new numbers", () => {
    const baseline = run({ routes: [row("/", { p50: 401 }), row("/leaderboard")] });
    const current = run({ routes: [row("/", { p50: 497 }), row("/leaderboard")] });
    const { problems, markdown } = buildPerfReport(current, baseline, DEFAULT_BUDGETS);
    const p = problems.find((x) => x.name === "/");
    expect(p).toBeDefined();
    // +24% and both over budget → two reasons.
    expect(p!.reasons.some((r) => r.includes("regressed +") && r.includes("401.0→497.0ms"))).toBe(true);
    expect(markdown).toContain("Baseline: 2026-08-12T19:31:37.950Z");
    // Δ column populated in the table.
    expect(markdown).toMatch(/\| \/ \|.*\+96\.0ms/);
  });

  it("flags okRate < 1 as a failure", () => {
    const doc = run({ routes: [row("/", { okRate: 0.9 }), row("/leaderboard")] });
    const { problems } = buildPerfReport(doc, undefined, DEFAULT_BUDGETS);
    const p = problems.find((x) => x.name === "/");
    expect(p).toBeDefined();
    expect(p!.reasons.some((r) => r.includes("ok rate 90%"))).toBe(true);
  });

  it("paste-ready digest lists each problem verbatim inside a fenced block", () => {
    const doc = run({
      routes: [row("/", { p50: 497, p95: 559 }), row("/leaderboard")],
      rpcs: [row("get_my_rank", { p50: 69, p95: 396, max: 396 }), row("get_leaderboard")],
    });
    const { markdown } = buildPerfReport(doc, undefined, DEFAULT_BUDGETS);
    // The digest section and fence exist.
    expect(markdown).toContain("## Paste-ready problem digest");
    const fenceStart = markdown.indexOf("## Paste-ready problem digest");
    const digest = markdown.slice(fenceStart);
    expect(digest).toContain("PERF PROBLEMS — prod (https://colloquiz.app), 2026-08-12, 20 iters");
    expect(digest).toContain("- route /: TTFB p50 497.0ms (budget 400)");
    // The RPC digest line carries p50/p95/max evidence (no guessed cause).
    expect(digest).toContain("- rpc get_my_rank: p50 69.0ms, p95 396.0ms, max 396.0ms.");
  });

  it("respects overridden budgets", () => {
    // With a 200ms route budget, a 250ms p50 route flags; with the default it would not.
    const doc = run({ routes: [row("/", { p50: 250, p95: 280 }), row("/leaderboard")] });
    const strict = buildPerfReport(doc, undefined, { ...DEFAULT_BUDGETS, routeP50Ms: 200 });
    expect(strict.problems.some((p) => p.name === "/")).toBe(true);
    const lax = buildPerfReport(doc, undefined, DEFAULT_BUDGETS);
    expect(lax.problems.some((p) => p.name === "/")).toBe(false);
  });
});
