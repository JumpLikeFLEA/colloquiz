/**
 * On-demand latency benchmark for Colloquiz.
 *
 * The project has no RUM, no Vercel Analytics, no OTel, and no request logging,
 * so "is it slower, and where?" could previously only be answered by reading code
 * and guessing (see [[duel-sweep-pg-cron]]). This script makes it measurable on
 * demand, against local or production, without adding production telemetry.
 *
 * Two layers:
 *   A — per-route TTFB via HTTP fetch (black-box). Detects real user-facing
 *       regressions and reflects the whole stack (proxy + RSC + data fetching).
 *   B — direct hot-RPC timing via @supabase/supabase-js authed with the bench
 *       user's JWT. Bypasses the Next unstable_cache wrappers so numbers reflect
 *       the DB path, not the cache. Explains WHY a Layer-A number moved.
 *
 * Auth uses @supabase/ssr's createServerClient with an in-memory cookie-jar
 * adapter, so the emitted sb-* cookies are byte-compatible with what proxy.ts
 * reads. The access_token is captured for Layer B.
 *
 * Write RPCs (only `expire_duels` today) are gated behind --include-writes AND
 * refused unless the target host is localhost/127.0.0.1: no flag combination
 * writes to prod.
 *
 * Output: a formatted console table per layer, plus JSON to
 * .perf/<target>-<ISO>.json and .perf/<target>-latest.json. If a prior -latest
 * exists (or --baseline=<file> is given), a Δ column diffs p50 against it and
 * flags any route/RPC that regressed more than the threshold (default +15%).
 * A human-readable Markdown report is also written to .perf/<target>-report.md
 * (lib/perfReport.ts): a summary, the flagged problems with evidence, the
 * tables, and a paste-ready digest for a fixing prompt.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/bench.ts \
 *     [--target=local|prod] [--url=<origin>] [--iters=20] [--route=/duels] \
 *     [--include-writes] [--baseline=<path>] [--threshold=0.15] \
 *     [--route-budget=400] [--rpc-budget=150] [--variance-ratio=2]
 *
 * --env-file=.env.local is required (tsx does not auto-load env).
 * Env: BENCH_EMAIL, BENCH_PASSWORD (must exist in the target Supabase project),
 * BENCH_PROD_URL (deployed origin), plus the existing NEXT_PUBLIC_SUPABASE_URL /
 * NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { performance } from "perf_hooks";
import { buildPerfReport, DEFAULT_BUDGETS, type RunDoc } from "../lib/perfReport";

// ── CLI ─────────────────────────────────────────────────────
function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const target = (getArg("target") ?? "local") as "local" | "prod";
if (target !== "local" && target !== "prod") {
  die(`Invalid --target "${target}". Must be "local" or "prod".`);
}

const iters = Number(getArg("iters") ?? "20");
if (!Number.isFinite(iters) || iters < 2) {
  die(`--iters must be an integer >= 2 (got "${getArg("iters")}").`);
}

const routeOverride = getArg("route");
const includeWrites = process.argv.includes("--include-writes");
const baselineOverride = getArg("baseline");
const threshold = Number(getArg("threshold") ?? "0.15");

// Budgets for the Markdown report (lib/perfReport.ts). All optional; the
// regression threshold reuses --threshold so the report and console agree.
const budgets = {
  routeP50Ms: Number(getArg("route-budget") ?? DEFAULT_BUDGETS.routeP50Ms),
  rpcP50Ms: Number(getArg("rpc-budget") ?? DEFAULT_BUDGETS.rpcP50Ms),
  varianceRatio: Number(getArg("variance-ratio") ?? DEFAULT_BUDGETS.varianceRatio),
  regressionPct: threshold,
};
for (const [k, v] of Object.entries(budgets)) {
  if (!Number.isFinite(v)) die(`Invalid numeric value for budget "${k}".`);
}

// ── Resolve target origin ────────────────────────────────────
const urlOverride = getArg("url");
const prodUrl = process.env.BENCH_PROD_URL;
const localUrl = "http://localhost:3000";
const resolvedOrigin = (urlOverride ?? (target === "prod" ? prodUrl : localUrl))?.replace(/\/$/, "");
if (!resolvedOrigin) {
  die(
    target === "prod"
      ? "Missing BENCH_PROD_URL in env (or pass --url=<origin>)."
      : "No origin resolved.",
  );
}
const origin: string = resolvedOrigin;

const originHost = new URL(origin).hostname;
const isLocalHost = originHost === "localhost" || originHost === "127.0.0.1";
if (includeWrites && !isLocalHost) {
  die(
    `Refusing --include-writes against non-local host "${originHost}". ` +
      `Write RPCs are only permitted when the target host is localhost/127.0.0.1.`,
  );
}

// ── Env ──────────────────────────────────────────────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const benchEmail = process.env.BENCH_EMAIL;
const benchPassword = process.env.BENCH_PASSWORD;
if (!supabaseUrl || !supabaseAnon) {
  die("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in env.");
}
if (!benchEmail || !benchPassword) {
  die("Missing BENCH_EMAIL / BENCH_PASSWORD in env (create a throwaway account).");
}

// ── Auth: sign the bench user in and capture the sb-* cookies proxy.ts reads ──
//
// Building createServerClient with an in-memory cookie-jar adapter reuses the
// exact same cookie encoder the app uses in proxy.ts / lib/supabase/server.ts,
// so the harness authenticates byte-identically to a browser. Hand-rolling the
// sb-* format would be a second implementation to drift.
type StoredCookie = { name: string; value: string; options?: CookieOptions };

async function signInAndCaptureSession(): Promise<{
  cookieHeader: string;
  accessToken: string;
  userId: string;
}> {
  const jar = new Map<string, StoredCookie>();

  const supabase = createServerClient(supabaseUrl!, supabaseAnon!, {
    cookies: {
      getAll() {
        return Array.from(jar.values()).map((c) => ({ name: c.name, value: c.value }));
      },
      setAll(cookiesToSet) {
        for (const c of cookiesToSet) {
          if (c.value === "") jar.delete(c.name);
          else jar.set(c.name, { name: c.name, value: c.value, options: c.options });
        }
      },
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: benchEmail!,
    password: benchPassword!,
  });
  if (error) die(`signInWithPassword failed: ${error.message}`);
  if (!data.session) die("signInWithPassword returned no session.");

  const cookieHeader = Array.from(jar.values())
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  if (!cookieHeader) die("Cookie jar is empty after sign-in — nothing to send to the app.");

  return {
    cookieHeader,
    accessToken: data.session.access_token,
    userId: data.user!.id,
  };
}

// ── Sampling ─────────────────────────────────────────────────
type Sample = { ok: boolean; ttfbMs: number; totalMs: number; status: number; note?: string };
type Stats = { name: string; n: number; p50: number; p95: number; min: number; max: number; okRate: number };

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarise(name: string, samples: Sample[], metric: "ttfbMs" | "totalMs"): Stats {
  const oks = samples.filter((s) => s.ok);
  const values = oks.map((s) => s[metric]).sort((a, b) => a - b);
  return {
    name,
    n: samples.length,
    p50: pct(values, 50),
    p95: pct(values, 95),
    min: values[0] ?? NaN,
    max: values[values.length - 1] ?? NaN,
    okRate: oks.length / samples.length,
  };
}

async function measureRoute(
  route: string,
  cookieHeader: string,
): Promise<{ ttfb: Stats; total: Stats; firstErrorNote?: string }> {
  const url = origin + route;
  const samples: Sample[] = [];
  let firstErrorNote: string | undefined;

  // One warmup, discarded — first request pays connection setup + JIT costs.
  for (let i = 0; i < iters + 1; i++) {
    const t0 = performance.now();
    try {
      let res = await fetch(url, {
        headers: { Cookie: cookieHeader, "user-agent": "colloquiz-bench/1" },
        redirect: "manual",
      });
      let ttfbMs = performance.now() - t0;
      await res.text();
      let totalMs = performance.now() - t0;
      // A same-origin 3xx (e.g. /dashboard → /progress?tab=stats) is not an auth
      // failure — the app just merged surfaces. Follow it once and time the
      // real page. A redirect to /login IS the auth failure and stays flagged.
      let status = res.status;
      let ok = status === 200;
      if ((status === 307 || status === 302) && res.headers.get("location")) {
        const loc = res.headers.get("location")!;
        const next = new URL(loc, url);
        const sameOrigin = next.origin === new URL(url).origin;
        const looksLikeLogin = next.pathname === "/login";
        if (sameOrigin && !looksLikeLogin) {
          res = await fetch(next.toString(), {
            headers: { Cookie: cookieHeader, "user-agent": "colloquiz-bench/1" },
            redirect: "manual",
          });
          ttfbMs = performance.now() - t0;
          await res.text();
          totalMs = performance.now() - t0;
          status = res.status;
          ok = status === 200;
        } else if (looksLikeLogin && !firstErrorNote) {
          firstErrorNote = `redirect to ${loc} — auth cookie rejected?`;
        }
      }
      if (!ok && !firstErrorNote && status !== 307 && status !== 302) {
        firstErrorNote = `HTTP ${status}`;
      }
      if (i > 0) samples.push({ ok, ttfbMs, totalMs, status });
    } catch (e) {
      const err = e as Error;
      if (!firstErrorNote) firstErrorNote = `fetch failed: ${err.message}`;
      if (i > 0) samples.push({ ok: false, ttfbMs: NaN, totalMs: NaN, status: 0, note: err.message });
    }
  }

  return {
    ttfb: summarise(route, samples, "ttfbMs"),
    total: summarise(route, samples, "totalMs"),
    firstErrorNote,
  };
}

async function measureRpc(
  label: string,
  call: () => PromiseLike<{ error: { message: string } | null }>,
): Promise<{ stats: Stats; firstErrorNote?: string }> {
  const samples: Sample[] = [];
  let firstErrorNote: string | undefined;

  for (let i = 0; i < iters + 1; i++) {
    const t0 = performance.now();
    try {
      const { error } = await call();
      const totalMs = performance.now() - t0;
      const ok = !error;
      if (!ok && !firstErrorNote) firstErrorNote = error!.message;
      if (i > 0) samples.push({ ok, ttfbMs: totalMs, totalMs, status: ok ? 200 : 500 });
    } catch (e) {
      const err = e as Error;
      if (!firstErrorNote) firstErrorNote = err.message;
      if (i > 0) samples.push({ ok: false, ttfbMs: NaN, totalMs: NaN, status: 0, note: err.message });
    }
  }

  return { stats: summarise(label, samples, "totalMs"), firstErrorNote };
}

// ── Routes (Layer A) ─────────────────────────────────────────
const DEFAULT_ROUTES = [
  "/",
  "/dashboard",
  "/progress",
  "/leaderboard",
  "/duels",
  "/groups",
  "/achievements",
  "/settings",
];

// ── Output rendering ─────────────────────────────────────────
// The baseline on disk is a full RunDoc; the console Δ column only needs
// (name, p50) per row, so it reads through this narrow view.
type BaselineRow = { name: string; p50: number; p95: number };

function pad(s: string, n: number, right = false): string {
  if (s.length >= n) return s.slice(0, n);
  return right ? s + " ".repeat(n - s.length) : " ".repeat(n - s.length) + s;
}

function fmtMs(v: number): string {
  return Number.isFinite(v) ? v.toFixed(1) : "—";
}

function fmtDelta(cur: number, base: number | undefined): string {
  if (base == null || !Number.isFinite(base) || base === 0 || !Number.isFinite(cur)) return "—";
  const delta = cur - base;
  const pctChange = delta / base;
  const sign = delta >= 0 ? "+" : "";
  const flagged = pctChange > threshold ? " ⚠" : "";
  return `${sign}${delta.toFixed(1)}ms (${sign}${(pctChange * 100).toFixed(1)}%)${flagged}`;
}

function printTable(title: string, rows: Stats[], baselineByName: Map<string, BaselineRow>): void {
  console.log(`\n${title}`);
  const header = [
    pad("name", 34, true),
    pad("n", 4),
    pad("p50", 8),
    pad("p95", 8),
    pad("min", 8),
    pad("max", 8),
    pad("ok%", 6),
    pad("Δ p50 vs baseline", 28, true),
  ].join("  ");
  console.log(header);
  console.log("-".repeat(header.length));
  for (const r of rows) {
    const base = baselineByName.get(r.name);
    console.log(
      [
        pad(r.name, 34, true),
        pad(String(r.n), 4),
        pad(fmtMs(r.p50), 8),
        pad(fmtMs(r.p95), 8),
        pad(fmtMs(r.min), 8),
        pad(fmtMs(r.max), 8),
        pad((r.okRate * 100).toFixed(0), 6),
        pad(fmtDelta(r.p50, base?.p50), 28, true),
      ].join("  "),
    );
  }
}

function loadBaseline(): RunDoc | undefined {
  const path = baselineOverride ?? join(process.cwd(), ".perf", `${target}-latest.json`);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as RunDoc;
  } catch (e) {
    console.warn(`Could not parse baseline at ${path}: ${(e as Error).message}`);
    return undefined;
  }
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log(
    `bench.ts — target=${target} origin=${origin} iters=${iters}` +
      (includeWrites ? " include-writes=true" : ""),
  );

  const session = await signInAndCaptureSession();
  console.log(`Signed in as ${benchEmail} (user_id=${session.userId.slice(0, 8)}…).`);

  // Layer A — per-route TTFB.
  const routes = routeOverride ? [routeOverride] : DEFAULT_ROUTES;
  const routeTtfb: Stats[] = [];
  const routeTotal: Stats[] = [];
  for (const route of routes) {
    process.stdout.write(`  A ${route}…`);
    const { ttfb, total, firstErrorNote } = await measureRoute(route, session.cookieHeader);
    process.stdout.write(
      ` p50 ttfb=${fmtMs(ttfb.p50)}ms total=${fmtMs(total.p50)}ms` +
        (firstErrorNote ? `  ⚠ ${firstErrorNote}` : "") +
        "\n",
    );
    routeTtfb.push(ttfb);
    routeTotal.push(total);
  }

  // Layer B — hot RPCs. A raw client, JWT in a header — no Next cache, no proxy.
  const rpcClient = createClient(supabaseUrl!, supabaseAnon!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.accessToken}` } },
  });

  const HISTORY_PAGE_SIZE = 25; // mirrors lib/historyFilters.ts
  type RpcSpec = { name: string; call: () => PromiseLike<{ error: { message: string } | null }> };
  const readOnlyRpcs: RpcSpec[] = [
    { name: "get_subject_stats", call: () => rpcClient.rpc("get_subject_stats") },
    {
      name: "get_leaderboard",
      // Defaults from lib/leaderboard.ts:52
      call: () =>
        rpcClient.rpc("get_leaderboard", {
          p_scope: "global",
          p_group_id: null,
          p_subject: null,
          p_window: "all",
          p_limit: 100,
          p_offset: 0,
        }),
    },
    { name: "get_leaderboard_subjects", call: () => rpcClient.rpc("get_leaderboard_subjects") },
    {
      name: "get_my_rank",
      // Defaults from lib/leaderboard.ts:66
      call: () =>
        rpcClient.rpc("get_my_rank", {
          p_scope: "global",
          p_group_id: null,
          p_subject: null,
          p_window: "all",
        }),
    },
    {
      name: "get_competitive_leaderboard",
      // Defaults from lib/duels.ts:109
      call: () =>
        rpcClient.rpc("get_competitive_leaderboard", {
          p_scope: "global",
          p_group_id: null,
          p_limit: 100,
          p_offset: 0,
        }),
    },
    { name: "get_my_duels", call: () => rpcClient.rpc("get_my_duels") },
    { name: "get_my_tier", call: () => rpcClient.rpc("get_my_tier") },
    {
      name: "get_quiz_history",
      // Defaults from lib/history.ts:51 — no filters, first page.
      call: () =>
        rpcClient.rpc("get_quiz_history", {
          p_subject: null,
          p_difficulty: null,
          p_limit: HISTORY_PAGE_SIZE,
          p_offset: 0,
        }),
    },
    { name: "get_quiz_history_subjects", call: () => rpcClient.rpc("get_quiz_history_subjects") },
  ];
  const writeRpcs: RpcSpec[] = includeWrites
    ? [{ name: "expire_duels", call: () => rpcClient.rpc("expire_duels") }]
    : [];

  const rpcStats: Stats[] = [];
  for (const spec of [...readOnlyRpcs, ...writeRpcs]) {
    process.stdout.write(`  B ${spec.name}…`);
    const { stats, firstErrorNote } = await measureRpc(spec.name, spec.call);
    process.stdout.write(
      ` p50=${fmtMs(stats.p50)}ms` + (firstErrorNote ? `  ⚠ ${firstErrorNote}` : "") + "\n",
    );
    rpcStats.push(stats);
  }

  // ── Report ─────────────────────────────────────────────────
  const baseline = loadBaseline();
  const baselineRoutes = new Map<string, BaselineRow>(
    (baseline?.routes ?? []).map((r) => [r.name, r]),
  );
  const baselineRpcs = new Map<string, BaselineRow>(
    (baseline?.rpcs ?? []).map((r) => [r.name, r]),
  );

  printTable("Layer A — route TTFB (ms)", routeTtfb, baselineRoutes);
  printTable("Layer A — route total (ms)", routeTotal, baselineRoutes);
  printTable("Layer B — direct hot-RPC (ms)", rpcStats, baselineRpcs);

  const flagged = [
    ...routeTtfb.filter((r) => {
      const b = baselineRoutes.get(r.name)?.p50;
      return b != null && Number.isFinite(b) && b !== 0 && (r.p50 - b) / b > threshold;
    }),
    ...rpcStats.filter((r) => {
      const b = baselineRpcs.get(r.name)?.p50;
      return b != null && Number.isFinite(b) && b !== 0 && (r.p50 - b) / b > threshold;
    }),
  ];
  if (baseline) {
    if (flagged.length === 0) {
      console.log(`\nNo p50 regression beyond +${(threshold * 100).toFixed(0)}%.`);
    } else {
      console.log(
        `\n⚠ ${flagged.length} name(s) regressed beyond +${(threshold * 100).toFixed(0)}% p50: ` +
          flagged.map((r) => r.name).join(", "),
      );
    }
  } else {
    console.log(`\nNo prior baseline found for target "${target}". This run seeds one.`);
  }

  // ── Persist ────────────────────────────────────────────────
  const outDir = join(process.cwd(), ".perf");
  mkdirSync(outDir, { recursive: true });
  const generatedAt = new Date().toISOString();
  const asStat = (r: Stats) => ({
    name: r.name,
    p50: r.p50,
    p95: r.p95,
    min: r.min,
    max: r.max,
    n: r.n,
    okRate: r.okRate,
  });
  const runDoc: RunDoc = {
    generatedAt,
    target,
    origin,
    iters,
    includeWrites,
    routes: routeTtfb.map(asStat),
    routesTotal: routeTotal.map(asStat),
    rpcs: rpcStats.map(asStat),
  };
  const stamp = generatedAt.replace(/[:.]/g, "-");
  writeFileSync(join(outDir, `${target}-${stamp}.json`), JSON.stringify(runDoc, null, 2));
  writeFileSync(join(outDir, `${target}-latest.json`), JSON.stringify(runDoc, null, 2));
  console.log(`\nWrote .perf/${target}-${stamp}.json and .perf/${target}-latest.json`);

  // ── Markdown report (lib/perfReport.ts) ────────────────────
  // The report uses the SAME baseline the console Δ column used above; the
  // persisted baseline JSON carries the full StatRow shape RunDoc needs.
  const { markdown, problems } = buildPerfReport(runDoc, baseline, budgets);
  writeFileSync(join(outDir, `${target}-report.md`), markdown);
  console.log(
    `Wrote .perf/${target}-report.md (${problems.length} problem${problems.length === 1 ? "" : "s"})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
