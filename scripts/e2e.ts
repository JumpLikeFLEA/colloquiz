/**
 * `npm run e2e`: the phone-engine specs (OPS-045, docs/decisions/0247).
 *
 *   npm run e2e                         build (if the stamp says so) and serve against the local stack, then test
 *   npm run e2e -- --url=<origin>       test an already-running server; builds and checks nothing
 *   npm run e2e -- --project=webkit-iphone e2e/smoke.spec.ts   any other argument goes to `playwright test`
 *
 * Without --url it reads the local Supabase stack's env, builds and serves exactly
 * as `npm run budget:local` does (scripts/localServer.ts, the same build stamp), on
 * its own port, and stops the server after. With the stack down it stops and says
 * how to start and seed it (docs/decisions/0245 Decision 1).
 */

import { spawnSync, type ChildProcess } from "node:child_process";
import { describeSupabaseUrl } from "./budgetBuildStamp";
import { applyLocalStackEnv, killProcessTree, npxBin, startLocalServer } from "./localServer";

const E2E_PORT = 4174; // beside the budget guard's 4173, so the two never collide

const args = process.argv.slice(2);
const urlArg = args.find((a) => a.startsWith("--url="))?.slice("--url=".length);
const passThrough = args.filter((a) => !a.startsWith("--url="));

async function main(): Promise<number> {
  let origin: string;
  let proc: ChildProcess | undefined;
  if (urlArg) {
    origin = urlArg.replace(/\/$/, "");
    console.log(`Using existing server at ${origin}. Supabase: whatever that server was started with (not checked by --url).`);
  } else {
    applyLocalStackEnv("npm run e2e");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    console.log(`Supabase: ${describeSupabaseUrl(supabaseUrl)} (the local stack).`);
    const started = await startLocalServer(E2E_PORT, supabaseUrl);
    origin = started.origin;
    proc = started.proc;
  }
  try {
    const result = spawnSync(npxBin, ["playwright", "test", ...passThrough], {
      stdio: "inherit",
      shell: true,
      env: { ...process.env, E2E_BASE_URL: origin },
    });
    return result.status ?? 1;
  } finally {
    if (proc) killProcessTree(proc);
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
