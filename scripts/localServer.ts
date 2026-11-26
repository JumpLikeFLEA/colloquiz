/**
 * Build and serve the app against the local Supabase stack: the part of the
 * budget guard (OPS-042, docs/decisions/0245) that the phone-engine e2e runner
 * (OPS-045, docs/decisions/0247) needs too. Moved here from scripts/budget.ts,
 * not copied, so both runners read the same env, share one build stamp
 * (`.next/budget-source-fingerprint`) and reuse each other's build when the
 * sources and the Supabase URL match.
 *
 * Not pure: it spawns `npx supabase status`, `next build` and `next start`.
 * The staleness rule itself is scripts/budgetBuildStamp.ts, under vitest.
 */

import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { buildDecision, formatStamp, sourceFingerprint, type SourceEntry } from "./budgetBuildStamp";

export const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";

export function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

// `next start` (via `npx`) forks its own listener process. A plain
// `proc.kill()` only signals the immediate child — on Windows that's the cmd
// wrapper, not the Node process actually holding the port, so the server
// would leak past this script's exit and squat on the port for the next
// run. Kill the whole tree instead.
export function killProcessTree(proc: ChildProcess): void {
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

// `npm run seed:local` alone refuses: it reads `.env.local`'s hosted URL and the
// seed runs against a local URL only, so the hint names the env it needs.
export const SEED_HINT =
  "seed the local stack with scripts/seed-local-fixtures.ts, passing the local URL and service key " +
  "(`npx supabase@2.120.0 status -o env`) as NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
  "(.claude/skills/verify, \"Budget\")";

// ── The local Supabase stack's env (OPS-042) ─────────────────────────────
// The signed-in fixture accounts and the cohort run exist only where
// scripts/seed-local-fixtures.ts ran, which is the local stack (it refuses any
// other URL). `.env.local` points at the hosted project, so without this the
// server signs in against hosted, where the fixtures don't exist
// (docs/decisions/0245). The local URL and keys are put in this process's
// env, which `next build` and `next start` inherit and which wins over every
// `.env*` file (@next/env's processEnv keeps a key already in process.env).
const LOCAL_STACK_ENV: Record<string, string> = {
  API_URL: "NEXT_PUBLIC_SUPABASE_URL",
  ANON_KEY: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  SERVICE_ROLE_KEY: "SUPABASE_SERVICE_ROLE_KEY",
};

/** Puts the local stack's URL and keys in process.env, or stops with how to start and seed it. */
export function applyLocalStackEnv(flag: string): void {
  const result = spawnSync(npxBin, ["supabase@2.120.0", "status", "-o", "env"], { encoding: "utf8", shell: true });
  const values = new Map<string, string>();
  for (const line of (result.stdout ?? "").split(/\r?\n/)) {
    const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (m) values.set(m[1], m[2]);
  }
  const missing = Object.keys(LOCAL_STACK_ENV).filter((k) => !values.get(k));
  if (result.status !== 0 || missing.length > 0) {
    die(
      `${flag}: could not read the local Supabase stack (\`npx supabase@2.120.0 status -o env\`` +
        (missing.length > 0 ? `, missing ${missing.join(", ")}` : "") +
        `). Start it with \`npx supabase@2.120.0 start\`, then ${SEED_HINT}.`,
    );
  }
  for (const [from, to] of Object.entries(LOCAL_STACK_ENV)) process.env[to] = values.get(from);
}

// ── Build stamp (OPS-017, OPS-042) ──────────────────────────────────────
// The env files `next build` loads in production mode
// (node_modules/next/dist/docs/01-app/02-guides/environment-variables.md).
// They are gitignored, so `git ls-files` never lists them.
const BUILD_ENV_FILES = [".env", ".env.production", ".env.local", ".env.production.local"];
const STAMP_PATH = join(process.cwd(), ".next", "budget-source-fingerprint");
const BUILD_ID_PATH = join(process.cwd(), ".next", "BUILD_ID");

function currentSourceEntries(): SourceEntry[] {
  let listed: string;
  try {
    listed = execFileSync("git", ["ls-files", "-z", "-co", "--exclude-standard"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    // Without the file list there is no telling a fresh build from a stale
    // one, so refuse rather than reuse.
    die(`Cannot list sources with \`git ls-files\` to check .next for staleness: ${(e as Error).message}`);
  }
  // The phone specs and their config never reach the bundle, so editing one
  // must not cost a `next build` (OPS-045, docs/decisions/0247 Decision 4).
  const isE2eOnly = (p: string) => p.startsWith("e2e/") || p === "playwright.config.ts";
  const paths = [
    ...listed.split("\0").filter((p) => p && !isE2eOnly(p)),
    ...BUILD_ENV_FILES.filter((p) => existsSync(p)),
  ];
  return paths.map((path) => ({ path, content: existsSync(path) ? readFileSync(path) : null }));
}

function readBuildId(): string | null {
  return existsSync(BUILD_ID_PATH) ? readFileSync(BUILD_ID_PATH, "utf8").trim() : null;
}

/** Runs `next build` unless `.next` holds a build this stamp says matches the sources and `supabaseUrl`. */
export function buildIfNeeded(supabaseUrl: string): void {
  const current = sourceFingerprint(currentSourceEntries());
  const decision = buildDecision({
    buildId: readBuildId(),
    stamp: existsSync(STAMP_PATH) ? readFileSync(STAMP_PATH, "utf8") : null,
    current,
    supabaseUrl,
  });
  if (decision.action === "reuse") {
    console.log(`Reusing .next: ${decision.reason}.`);
    return;
  }
  console.log(`Rebuilding: ${decision.reason} — running \`next build\`...`);
  const result = spawnSync(npxBin, ["next", "build"], { stdio: "inherit", shell: true });
  if (result.status !== 0) die("`next build` failed.");
  // Stamp the fingerprint taken BEFORE the build: a file edited while the
  // build ran then mismatches next time and rebuilds, instead of being
  // recorded as built. The URL is the one this process handed the build
  // (OPS-042), and BUILD_ID is the one it produced.
  const buildId = readBuildId();
  if (buildId === null) die("`next build` succeeded but left no .next/BUILD_ID.");
  writeFileSync(STAMP_PATH, formatStamp({ fingerprint: current, supabaseUrl, buildId }));
}

// ── Server lifecycle ────────────────────────────────────────────────────
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

/** Builds if needed, then starts `next start -p <port>` and waits until it answers. */
export async function startLocalServer(port: number, supabaseUrl: string): Promise<{ origin: string; proc: ChildProcess }> {
  buildIfNeeded(supabaseUrl);
  const origin = `http://localhost:${port}`;
  console.log(`Starting \`next start -p ${port}\`...`);
  // shell: true is required to spawn npx's .cmd shim on Windows; the resulting
  // wrapper-process tree is why killProcessTree (above) kills by tree, not by
  // this immediate pid alone.
  const proc = spawn(npxBin, ["next", "start", "-p", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });
  let out = "";
  proc.stdout?.on("data", (d) => (out += d.toString()));
  proc.stderr?.on("data", (d) => (out += d.toString()));
  proc.on("exit", (code) => {
    // killProcessTree sets this before it kills the server, so its expected
    // non-zero exit isn't logged as if the server had crashed.
    if (!(proc as ChildProcess & { killedByUs?: boolean }).killedByUs && code !== null && code !== 0) {
      console.error(`next start exited early (code ${code}):\n${out}`);
    }
  });
  await waitForServer(origin, 30_000);
  return { origin, proc };
}
