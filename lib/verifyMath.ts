/**
 * TypeScript ↔ Python bridge to scripts/verify_math.py — the SymPy answer/option
 * verifier (plan §4, Layers 1 & 3, plus the `equiv` kind that Layer 2 uses).
 *
 * One process spawn handles a whole batch: the caller hands over every check, the
 * script runs them all (each with its own per-check wall clock) and returns one
 * result per check, in order. Course-import verification runs at author time, not
 * in a request path, so a subprocess round-trip is the right shape — the SymPy
 * engine stays in Python where sympy/lark live, and nothing pulls a CAS into the
 * app bundle.
 *
 * A `null` verdict means "could not decide" (unparseable, timed out, inconclusive);
 * `false` means a proven defect; `true` means verified. The importer treats `false`
 * and `null` alike — both keep an item out of `approved` — but preserves the
 * `reason` for the reviewer.
 */

import { spawn } from "child_process";
import { join } from "path";

export type VerifyCheck =
  | { id: string; kind: "answer"; sympy: string; answer: string }
  | { id: string; kind: "options"; options: string[] }
  | {
      id: string;
      kind: "equiv";
      a: string;
      a_fmt: "sympy" | "latex";
      b: string;
      b_fmt: "sympy" | "latex";
    };

export interface VerifyResult {
  id: string;
  kind: "answer" | "options" | "equiv";
  ok: boolean | null;
  reason?: string;
}

const SCRIPT_PATH = join(process.cwd(), "scripts", "verify_math.py");
const PYTHON = process.env.PYTHON ?? "python";
const DEFAULT_TIMEOUT = 10; // seconds per check, mirrors the script default

function runPython(input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON, [SCRIPT_PATH], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("error", (e) =>
      reject(
        new Error(
          `could not run "${PYTHON} scripts/verify_math.py" (${(e as NodeJS.ErrnoException).code}). ` +
            `Install Python and its deps: python -m pip install -r scripts/requirements.txt ` +
            `(or set PYTHON to the interpreter path).`,
        ),
      ),
    );
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`verify_math.py exited ${code}: ${stderr.slice(0, 500) || "(no stderr)"}`));
      } else {
        resolve(stdout);
      }
    });
    proc.stdin.write(input, "utf-8");
    proc.stdin.end();
  });
}

export async function runVerifyChecks(
  checks: VerifyCheck[],
  opts: { timeout?: number } = {},
): Promise<VerifyResult[]> {
  if (checks.length === 0) return [];

  const request = JSON.stringify({ timeout: opts.timeout ?? DEFAULT_TIMEOUT, checks });
  const stdout = await runPython(request);

  let parsed: { results?: VerifyResult[]; error?: string };
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`verify_math.py returned non-JSON output: ${stdout.slice(0, 300)}`);
  }
  if (parsed.error) throw new Error(`verify_math.py request error: ${parsed.error}`);
  return parsed.results ?? [];
}
