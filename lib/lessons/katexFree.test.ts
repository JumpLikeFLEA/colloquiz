import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CNT-003 acceptance: "No block type, and nothing imported by `lib/lessons/`,
 * pulls KaTeX." Walks the REAL first-party module graph starting from
 * lib/lessons/index.ts — following only relative import specifiers, the only
 * kind a first-party dependency can arrive through — and fails if any
 * visited file's source text mentions "katex" (case-insensitive) or if any
 * import specifier anywhere in the graph names a "katex" package. This is
 * the module-graph-inspection alternative CNT-003 names explicitly (the
 * other being a printed `rg`); the visited set is printed below so the
 * check's own coverage is auditable, not just its pass/fail result.
 *
 * Bounded to first-party relative imports on purpose: a bare specifier
 * (zod, react, ...) is a package boundary, and no third-party package this
 * module tree actually imports (zod only) has any KaTeX dependency of its
 * own to walk into.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const ENTRY = path.resolve(__dirname, "index.ts");

// Anchored to the START of a (trimmed) line and requires "import"/"export"
// literally, not just any occurrence of `from "..."` — a prose comment like
// `distinguishable "client bug" from "legitimate zero score"` would
// otherwise be misread as an import specifier. Every import/export in this
// codebase's style is single-line, so a per-line match is exact, not a
// heuristic.
const IMPORT_LINE_RE = /^(?:import|export)\b[\s\S]*?\bfrom\s+["']([^"']+)["']/;

function resolveRelative(fromFile: string, specifier: string): string {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    try {
      readFileSync(candidate, "utf8");
      return candidate;
    } catch {
      // try the next candidate
    }
  }
  throw new Error(`could not resolve "${specifier}" from ${fromFile}`);
}

function walk(entry: string): { visited: Set<string>; bareSpecifiers: Set<string> } {
  const visited = new Set<string>();
  const bareSpecifiers = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || visited.has(file)) continue;
    visited.add(file);

    const source = readFileSync(file, "utf8");
    for (const line of source.split("\n")) {
      const match = IMPORT_LINE_RE.exec(line.trim());
      if (!match) continue;
      const specifier = match[1];
      if (specifier.startsWith(".")) {
        queue.push(resolveRelative(file, specifier));
      } else {
        bareSpecifiers.add(specifier);
      }
    }
  }

  return { visited, bareSpecifiers };
}

describe("lib/lessons is KaTeX-free", () => {
  it("no import specifier in the first-party module graph names a katex package or file", () => {
    const { visited, bareSpecifiers } = walk(ENTRY);

    const relativePaths = [...visited].map((f) => path.relative(ROOT, f)).sort();
    console.log("lib/lessons module graph (first-party, relative imports only):\n" + relativePaths.join("\n"));
    console.log("bare package specifiers imported: " + [...bareSpecifiers].sort().join(", "));

    // Checks IMPORT SPECIFIERS and resolved FILE PATHS only, not prose — this
    // file's own comments legitimately explain why the retired course
    // TheoryBlock's `formula` block (which DID pull KaTeX) has no Alliengll
    // equivalent, and a plain text scan would flag that explanation as a
    // violation of the rule it is describing.
    for (const specifier of bareSpecifiers) {
      expect(specifier.toLowerCase()).not.toContain("katex");
    }
    for (const file of visited) {
      expect(path.relative(ROOT, file).toLowerCase()).not.toContain("katex");
    }

    expect(visited.size).toBeGreaterThan(1);
  });
});
