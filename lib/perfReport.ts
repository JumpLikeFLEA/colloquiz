/**
 * Human-readable Markdown report for a bench run (scripts/bench.ts).
 *
 * Pure and I/O-free: it consumes the persisted RunDoc (the JSON bench.ts already
 * writes to .perf/) plus an optional prior baseline, and returns a Markdown
 * string together with the structured list of flagged problems. scripts/bench.ts
 * loads the files and writes the .md; this module just decides what the report
 * says, so it can be unit tested without a network or a Supabase project.
 *
 * A row is flagged as a PROBLEM when ANY of these hold:
 *   - route TTFB p50 over the route budget, or RPC p50 over the RPC budget;
 *   - okRate < 1 (any sample failed);
 *   - p95 / p50 exceeds the variance ratio (an unstable tail);
 *   - p50 regressed vs the baseline row by more than regressionPct.
 * The last rule is the SAME comparison the console Δ column uses in bench.ts, so
 * the report and the console never disagree about what "regressed" means.
 *
 * The report is EVIDENCE-ONLY by design: it states the flagged metric, its
 * numbers, and the correlated backing-RPC timings, but never guesses a cause or
 * points at a file — the fixing agent investigates from the facts.
 */

export type StatRow = {
  name: string;
  p50: number;
  p95: number;
  min: number;
  max: number;
  n: number;
  okRate: number;
};

/** Mirror of the object scripts/bench.ts persists (the single source of truth). */
export type RunDoc = {
  generatedAt: string;
  target: string;
  origin: string;
  iters: number;
  includeWrites: boolean;
  routes: StatRow[]; // Layer A — TTFB
  routesTotal: StatRow[]; // Layer A — total (present but not the report's focus)
  rpcs: StatRow[]; // Layer B — direct hot RPCs
};

export type BudgetConfig = {
  routeP50Ms: number; // route TTFB p50 over this is a problem
  rpcP50Ms: number; // RPC p50 over this is a problem
  varianceRatio: number; // p95/p50 above this = "unstable tail"
  regressionPct: number; // p50 regressed by more than this vs baseline
};

export const DEFAULT_BUDGETS: BudgetConfig = {
  routeP50Ms: 400,
  rpcP50Ms: 150,
  varianceRatio: 2.0,
  regressionPct: 0.15,
};

export type Problem = {
  kind: "route" | "rpc";
  name: string;
  p50: number;
  p95: number;
  max: number;
  n: number;
  okRate: number;
  budget?: number;
  baselineP50?: number;
  regressionPct?: number;
  reasons: string[];
};

// Best-effort map from a route to the hot RPCs that back its render, so a
// flagged route can show whether its data layer is healthy (i.e. whether the
// cost is DB-bound). Conservative on purpose — a route absent here, or mapped to
// [], simply shows no "backing RPCs" line rather than claiming false precision.
// Derived from the data-access layer (lib/questions.ts, lib/leaderboard.ts,
// lib/duels.ts, lib/history.ts); update alongside those call sites.
const ROUTE_BACKING_RPCS: Record<string, string[]> = {
  "/": ["get_subject_stats"],
  "/leaderboard": ["get_leaderboard", "get_leaderboard_subjects", "get_my_rank"],
  "/duels": ["get_my_duels", "get_my_tier"],
  "/dashboard": ["get_quiz_history", "get_quiz_history_subjects", "get_my_rank"],
  "/progress": ["get_quiz_history", "get_quiz_history_subjects", "get_my_rank"],
  "/settings": [],
  "/groups": [],
  "/achievements": [],
};

function round1(v: number): string {
  return Number.isFinite(v) ? v.toFixed(1) : "—";
}

/** The exact regression test the console Δ column uses (bench.ts). */
function regression(cur: number, base: number | undefined): number | undefined {
  if (base == null || !Number.isFinite(base) || base === 0 || !Number.isFinite(cur)) {
    return undefined;
  }
  return (cur - base) / base;
}

function evaluate(
  kind: "route" | "rpc",
  row: StatRow,
  budgetMs: number,
  budgets: BudgetConfig,
  baseP50: number | undefined,
): Problem | null {
  const reasons: string[] = [];

  if (Number.isFinite(row.p50) && row.p50 > budgetMs) {
    reasons.push(`p50 ${round1(row.p50)}ms over ${budgetMs}ms budget`);
  }
  if (row.okRate < 1) {
    reasons.push(`ok rate ${(row.okRate * 100).toFixed(0)}% (${row.n} samples, some failed)`);
  }
  if (Number.isFinite(row.p50) && row.p50 > 0 && Number.isFinite(row.p95)) {
    const ratio = row.p95 / row.p50;
    if (ratio > budgets.varianceRatio) {
      reasons.push(`p95 ${round1(row.p95)}ms is ${ratio.toFixed(1)}× p50 (unstable tail)`);
    }
  }
  const reg = regression(row.p50, baseP50);
  if (reg != null && reg > budgets.regressionPct) {
    reasons.push(
      `regressed +${(reg * 100).toFixed(1)}% vs baseline (${round1(baseP50!)}→${round1(row.p50)}ms)`,
    );
  }

  if (reasons.length === 0) return null;
  return {
    kind,
    name: row.name,
    p50: row.p50,
    p95: row.p95,
    max: row.max,
    n: row.n,
    okRate: row.okRate,
    budget: budgetMs,
    baselineP50: baseP50,
    regressionPct: reg,
    reasons,
  };
}

function deltaCell(cur: number, base: number | undefined): string {
  const reg = regression(cur, base);
  if (reg == null) return "—";
  const delta = cur - base!;
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${round1(delta)}ms (${sign}${(reg * 100).toFixed(1)}%)`;
}

function statsTable(rows: StatRow[], firstCol: string, baseByName: Map<string, StatRow>): string {
  const lines = [
    `| ${firstCol} | p50 | p95 | min | max | ok% | Δ p50 |`,
    `| --- | ---: | ---: | ---: | ---: | ---: | --- |`,
  ];
  for (const r of rows) {
    const base = baseByName.get(r.name)?.p50;
    lines.push(
      `| ${r.name} | ${round1(r.p50)} | ${round1(r.p95)} | ${round1(r.min)} | ${round1(r.max)} | ` +
        `${(r.okRate * 100).toFixed(0)} | ${deltaCell(r.p50, base)} |`,
    );
  }
  return lines.join("\n");
}

function backingRpcLine(routeName: string, rpcByName: Map<string, StatRow>): string | null {
  const names = ROUTE_BACKING_RPCS[routeName];
  if (!names || names.length === 0) return null;
  const parts = names
    .map((n) => {
      const row = rpcByName.get(n);
      return row ? `${n} ${round1(row.p50)}ms` : null;
    })
    .filter((x): x is string => x !== null);
  if (parts.length === 0) return null;
  return `- Backing RPCs: ${parts.join(", ")}`;
}

function problemBlock(p: Problem, rpcByName: Map<string, StatRow>): string {
  const lines: string[] = [];
  if (p.kind === "route") {
    lines.push(`### route ${p.name}`);
    lines.push(
      `- TTFB p50 **${round1(p.p50)}ms**` +
        (p.budget != null ? ` (budget ${p.budget}ms)` : "") +
        ` · p95 ${round1(p.p95)}ms · n=${p.n} · ok ${(p.okRate * 100).toFixed(0)}%`,
    );
    lines.push(`- Reasons: ${p.reasons.join("; ")}`);
    const backing = backingRpcLine(p.name, rpcByName);
    if (backing) lines.push(backing);
  } else {
    lines.push(`### rpc ${p.name}`);
    lines.push(
      `- p50 **${round1(p.p50)}ms**` +
        (p.budget != null ? ` (budget ${p.budget}ms)` : "") +
        ` · p95 ${round1(p.p95)}ms · max ${round1(p.max)}ms · n=${p.n} · ok ${(p.okRate * 100).toFixed(0)}%`,
    );
    lines.push(`- Reasons: ${p.reasons.join("; ")}`);
  }
  return lines.join("\n");
}

/** The compact, copy-whole block meant to be pasted into a fixing prompt. */
function pasteDigest(run: RunDoc, problems: Problem[], rpcByName: Map<string, StatRow>): string {
  const date = run.generatedAt.slice(0, 10);
  const header = `PERF PROBLEMS — ${run.target} (${run.origin}), ${date}, ${run.iters} iters`;
  if (problems.length === 0) {
    return `${header}\nNone — all metrics within budget and no regressions vs baseline.`;
  }
  const lines = [header];
  for (const p of problems) {
    if (p.kind === "route") {
      let line = `- route ${p.name}: TTFB p50 ${round1(p.p50)}ms`;
      if (p.budget != null && p.p50 > p.budget) line += ` (budget ${p.budget})`;
      line += `, p95 ${round1(p.p95)}ms`;
      if (p.regressionPct != null && p.regressionPct > 0) {
        line += `, regressed +${(p.regressionPct * 100).toFixed(1)}% vs baseline`;
      }
      line += ".";
      lines.push(line);
      const backing = ROUTE_BACKING_RPCS[p.name] ?? [];
      const parts = backing
        .map((n) => {
          const row = rpcByName.get(n);
          return row ? `${n} ${round1(row.p50)}ms` : null;
        })
        .filter((x): x is string => x !== null);
      if (parts.length > 0) lines.push(`  Backing RPCs: ${parts.join(", ")}.`);
    } else {
      let line = `- rpc ${p.name}: p50 ${round1(p.p50)}ms`;
      if (p.budget != null && p.p50 > p.budget) line += ` (budget ${p.budget})`;
      line += `, p95 ${round1(p.p95)}ms, max ${round1(p.max)}ms`;
      if (p.regressionPct != null && p.regressionPct > 0) {
        line += `, regressed +${(p.regressionPct * 100).toFixed(1)}% vs baseline`;
      }
      line += ".";
      lines.push(line);
    }
  }
  return lines.join("\n");
}

export function buildPerfReport(
  run: RunDoc,
  baseline: RunDoc | undefined,
  budgets: BudgetConfig = DEFAULT_BUDGETS,
): { markdown: string; problems: Problem[] } {
  const baseRoutes = new Map<string, StatRow>((baseline?.routes ?? []).map((r) => [r.name, r]));
  const baseRpcs = new Map<string, StatRow>((baseline?.rpcs ?? []).map((r) => [r.name, r]));
  const rpcByName = new Map<string, StatRow>(run.rpcs.map((r) => [r.name, r]));

  const problems: Problem[] = [];
  for (const r of run.routes) {
    const p = evaluate("route", r, budgets.routeP50Ms, budgets, baseRoutes.get(r.name)?.p50);
    if (p) problems.push(p);
  }
  for (const r of run.rpcs) {
    const p = evaluate("rpc", r, budgets.rpcP50Ms, budgets, baseRpcs.get(r.name)?.p50);
    if (p) problems.push(p);
  }

  const routeFailures = run.routes.filter((r) => r.okRate < 1).length;
  const md: string[] = [];

  md.push(`# Colloquiz perf report — ${run.target}`);
  md.push(`_${run.generatedAt} · ${run.iters} iters · ${run.origin}_`);
  md.push("");

  md.push("## Summary");
  md.push(`- Routes measured: ${run.routes.length} (${routeFailures} with failures)`);
  md.push(`- RPCs measured: ${run.rpcs.length}`);
  md.push(
    problems.length === 0
      ? "- Problems flagged: none — all within budget and no regressions."
      : `- Problems flagged: ${problems.length}`,
  );
  md.push(
    baseline
      ? `- Baseline: ${baseline.generatedAt}`
      : "- Baseline: none (first run for this target)",
  );
  md.push(
    `- Budgets: route p50 ≤ ${budgets.routeP50Ms}ms · rpc p50 ≤ ${budgets.rpcP50Ms}ms · ` +
      `variance ≤ ${budgets.varianceRatio}× · regression ≤ +${(budgets.regressionPct * 100).toFixed(0)}%`,
  );
  md.push("");

  if (problems.length === 0) {
    md.push("## Problems");
    md.push("No problems: all metrics within budget and no regressions vs baseline.");
  } else {
    md.push(`## ⚠ Problems (${problems.length})`);
    md.push("");
    for (const p of problems) {
      md.push(problemBlock(p, rpcByName));
      md.push("");
    }
  }

  md.push("## Layer A — routes (TTFB, ms)");
  md.push(statsTable(run.routes, "route", baseRoutes));
  md.push("");
  md.push("## Layer B — hot RPCs (ms)");
  md.push(statsTable(run.rpcs, "rpc", baseRpcs));
  md.push("");

  md.push("## Paste-ready problem digest");
  md.push("```");
  md.push(pasteDigest(run, problems, rpcByName));
  md.push("```");
  md.push("");

  return { markdown: md.join("\n"), problems };
}
