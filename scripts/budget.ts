/**
 * Cold-load JS byte-budget guard (OPS-006).
 *
 * Next 16 removed `next build`'s `First Load JS`/size columns ("we found
 * these to be inaccurate in server-driven architectures using React Server
 * Components... both our Turbopack and Webpack implementations had issues" —
 * node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md), so
 * docs/handoff.md's per-route performance budgets have nothing to cite. This
 * measures the replacement directly: a cold, cache-disabled `next start` load
 * through headless Chromium, summing the compressed bytes of every script
 * resource actually transferred over the network for each configured route.
 *
 * "Compressed" and "actually downloaded" come from Chrome DevTools Protocol's
 * `Network.loadingFinished` event `encodedDataLength` — the real wire byte
 * count post-compression, not a `Content-Length` header (absent on chunked
 * responses) and not the decoded/parsed size `response.body()` would give.
 *
 * A route is a hard failure — not a 0 KB pass — if:
 *   - navigation returns a non-2xx status,
 *   - navigation times out,
 *   - the page raises an uncaught error (`page.on("pageerror")`), or
 *   - any downloaded script chunk's content contains a forbidden-package
 *     signature (OPS-013) — see FORBIDDEN_SIGNATURES below. This catches a
 *     Turbopack commons-chunk leak that no explicit import statement causes,
 *     which is what the ESLint no-restricted-imports rule (eslint.config.mjs)
 *     cannot see.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/budget.ts [--url=<origin>]
 *
 * --url (or BUDGET_BASE_URL) points the guard at an already-running server —
 * e.g. OPS-010's launch rehearsal against the deployed production URL.
 * Without it, this script builds (if `.next` is missing or stale) and starts
 * its own local `next start` on an ephemeral port, then tears it down after.
 */

import { chromium, type CDPSession } from "@playwright/test";
import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";

// `next start` (via `npx`) forks its own listener process. A plain
// `proc.kill()` only signals the immediate child — on Windows that's the cmd
// wrapper, not the Node process actually holding the port, so the server
// would leak past this script's exit and squat on LOCAL_PORT for the next
// run. Kill the whole tree instead.
function killProcessTree(proc: ChildProcess): void {
  (proc as ChildProcess & { killedByUs?: boolean }).killedByUs = true;
  if (proc.pid == null) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(proc.pid), "/t", "/f"], { stdio: "ignore" });
    } catch {
      // Already exited.
    }
  } else {
    proc.kill();
  }
}

// ── Configured routes ───────────────────────────────────────────────────
// Each entry's budgetKB is a recorded decision, not a guess — re-derive it
// from a real `npm run budget` run before raising it. /login is the smallest
// route that exists today (no English route exists yet; see docs/handoff.md
// "Performance boundary") and its measured KB is the floor every English
// route budget in a future M2 card starts from.
//
// `guardForbiddenSignatures` (OPS-013) mirrors the ESLint no-restricted-imports
// rule's own file scope (eslint.config.mjs: app/(english)/**, lesson-player):
// only English-surface routes are checked for FORBIDDEN_SIGNATURES. A
// Colloquiz route like /login legitimately ships @supabase/ssr — flagging it
// there would be a false positive, not a leak.
type RouteBudget = { path: string; budgetKB: number; guardForbiddenSignatures: boolean };

const ROUTES: RouteBudget[] = [
  { path: "/login", budgetKB: 380, guardForbiddenSignatures: false },
  // SHELL-007: the placeholder at the URL shape SHELL-005 decided
  // (/courses/[course-slug]/[lesson-slug]). 210 KB is docs/decisions/0046's
  // addendum-corrected landing/course-page budget, reused here as a starting
  // point since no lesson-specific content exists yet — PLAY-006 ("Public
  // lesson page") re-measures this route for real once it reads actual
  // lesson data and raises the number with a printed run if it needs to.
  { path: "/courses/x/y", budgetKB: 210, guardForbiddenSignatures: true },
];

// ── CLI ──────────────────────────────────────────────────────────────────
function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const urlOverride = getArg("url") ?? process.env.BUDGET_BASE_URL;

// ── Local server lifecycle ──────────────────────────────────────────────
const LOCAL_PORT = 4173; // arbitrary, unlikely to collide with `next dev`'s 3000

async function waitForServer(origin: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(origin, { redirect: "manual" });
      // Any response at all (including a redirect) means the server is up.
      if (res.status > 0) return;
    } catch {
      // Not listening yet.
    }
    await delay(200);
  }
  die(`Server at ${origin} did not become ready within ${timeoutMs}ms.`);
}

function buildIfNeeded(): void {
  const buildIdPath = join(process.cwd(), ".next", "BUILD_ID");
  if (existsSync(buildIdPath)) return;
  console.log("No .next build found — running `next build` first...");
  const result = spawnSync(npxBin, ["next", "build"], { stdio: "inherit", shell: true });
  if (result.status !== 0) die("`next build` failed.");
}

async function startLocalServer(): Promise<{ origin: string; proc: ChildProcess }> {
  buildIfNeeded();
  const origin = `http://localhost:${LOCAL_PORT}`;
  console.log(`Starting \`next start -p ${LOCAL_PORT}\`...`);
  // shell: true is required to spawn npx's .cmd shim on Windows; the resulting
  // wrapper-process tree is why killProcessTree (below) kills by tree, not by
  // this immediate pid alone.
  const proc = spawn(npxBin, ["next", "start", "-p", String(LOCAL_PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });
  let out = "";
  proc.stdout?.on("data", (d) => (out += d.toString()));
  proc.stderr?.on("data", (d) => (out += d.toString()));
  proc.on("exit", (code) => {
    // killProcessTree below sets this before it kills the server, so its
    // expected non-zero exit isn't logged as if the server had crashed.
    if (!(proc as ChildProcess & { killedByUs?: boolean }).killedByUs && code !== null && code !== 0) {
      console.error(`next start exited early (code ${code}):\n${out}`);
    }
  });
  await waitForServer(origin, 30_000);
  return { origin, proc };
}

// ── Commons-chunk content-signature guard (OPS-013) ─────────────────────
// no-restricted-imports (eslint.config.mjs) catches an explicit import
// statement in app/(english)/** or app/components/lesson-player/**. It
// cannot see a package Turbopack's own commons-chunk splitting pulls into a
// *shared* chunk that an English route downloads regardless of whether that
// route's own code imports it — that's exactly how OPS-012 found lucide-react's
// Icon base leaking into the SHELL-006 stub. This scans the actual downloaded
// chunk bytes for each forbidden package's name, the same content-based method
// decision 0046's addendum used to isolate Sentry's chunk
// (`grep -l -i sentry .next/static/chunks/*.js`), rather than inferring a leak
// from a KB delta.
const FORBIDDEN_SIGNATURES = ["recharts", "katex", "framer-motion", "@supabase/ssr"];

// ── Per-route cold-load measurement ─────────────────────────────────────
type RouteResult =
  | { path: string; ok: true; scriptKB: number; leaks: string[] }
  | { path: string; ok: false; reason: string };

async function measureRoute(
  browser: import("@playwright/test").Browser,
  origin: string,
  path: string,
  guardForbiddenSignatures: boolean,
): Promise<RouteResult> {
  // A fresh, cache-disabled context per route: no cookies, no storage, no
  // cache carried over from a previous route or a previous run.
  const context = await browser.newContext();
  const page = await context.newPage();

  let pageError: string | undefined;
  page.on("pageerror", (err) => {
    if (!pageError) pageError = err.message;
  });

  const client: CDPSession = await context.newCDPSession(page);
  await client.send("Network.enable");

  const resourceTypeByRequestId = new Map<string, string>();
  const scriptUrlByRequestId = new Map<string, string>();
  let scriptBytes = 0;
  const bodyFetches: Promise<{ url: string; body: string } | undefined>[] = [];

  client.on("Network.responseReceived", (event) => {
    resourceTypeByRequestId.set(event.requestId, event.type);
    if (event.type === "Script") {
      scriptUrlByRequestId.set(event.requestId, event.response.url);
    }
  });
  client.on("Network.loadingFinished", (event) => {
    if (resourceTypeByRequestId.get(event.requestId) !== "Script") return;
    scriptBytes += event.encodedDataLength;
    if (!guardForbiddenSignatures) return;
    const url = scriptUrlByRequestId.get(event.requestId);
    if (!url) return;
    // Fetched while the response is still buffered by the CDP session (i.e.
    // before context.close() below), not re-requested over the network.
    bodyFetches.push(
      client
        .send("Network.getResponseBody", { requestId: event.requestId })
        .then((res) => ({ url, body: res.body }))
        .catch(() => undefined),
    );
  });

  try {
    const response = await page.goto(origin + path, {
      waitUntil: "networkidle",
      timeout: 15_000,
    });
    if (!response || !response.ok()) {
      return { path, ok: false, reason: `navigation returned ${response ? response.status() : "no response"}` };
    }
    if (pageError) {
      return { path, ok: false, reason: `page error: ${pageError}` };
    }

    const bodies = (await Promise.all(bodyFetches)).filter((b): b is { url: string; body: string } => b != null);
    const leaks: string[] = [];
    for (const { url, body } of bodies) {
      for (const signature of FORBIDDEN_SIGNATURES) {
        if (body.toLowerCase().includes(signature.toLowerCase())) {
          leaks.push(`${url} contains "${signature}"`);
        }
      }
    }

    return { path, ok: true, scriptKB: scriptBytes / 1024, leaks };
  } catch (e) {
    return { path, ok: false, reason: (e as Error).message };
  } finally {
    await context.close();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  let origin: string;
  let localProc: ChildProcess | undefined;

  if (urlOverride) {
    origin = urlOverride.replace(/\/$/, "");
    console.log(`Using existing server at ${origin}.`);
  } else {
    const started = await startLocalServer();
    origin = started.origin;
    localProc = started.proc;
  }

  const browser = await chromium.launch();
  let anyFailed = false;

  try {
    console.log("\nroute | KB | budget");
    console.log("-".repeat(40));
    for (const route of ROUTES) {
      const result = await measureRoute(browser, origin, route.path, route.guardForbiddenSignatures);
      if (!result.ok) {
        anyFailed = true;
        console.log(`${route.path} | FAIL (${result.reason}) | ${route.budgetKB}`);
        continue;
      }
      const kb = result.scriptKB;
      const overBudget = kb > route.budgetKB;
      if (overBudget) anyFailed = true;
      console.log(
        `${route.path} | ${kb.toFixed(1)} KB | ${route.budgetKB} KB${overBudget ? "  ⚠ OVER BUDGET" : ""}`,
      );
      if (result.leaks.length > 0) {
        anyFailed = true;
        console.log(`  ⚠ FORBIDDEN-PACKAGE SIGNATURE${result.leaks.length > 1 ? "S" : ""} FOUND:`);
        for (const leak of result.leaks) console.log(`    - ${leak}`);
      }
    }
  } finally {
    await browser.close();
    if (localProc) {
      killProcessTree(localProc);
    }
  }

  if (anyFailed) {
    console.error("\nBudget guard failed: see routes marked FAIL or OVER BUDGET above.");
    process.exit(1);
  }
  console.log("\nAll routes within budget.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
