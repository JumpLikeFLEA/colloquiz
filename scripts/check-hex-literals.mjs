#!/usr/bin/env node
// Guards against new hex-colour literals under app/ and lib/ (SHELL-003,
// docs/handoff.md "Visual work" §1: stop the debt growing, do not migrate
// the existing backlog in one big-bang commit).
//
// Two tiers:
// - EXEMPT: app/globals.css (the token definitions themselves), the vendored
//   app/components/ui/** and app/components/figma/** trees (already unlinted
//   for the same reason), and lib/site.ts + app/global-error.tsx (the
//   explicit allow-list in SHELL-003's acceptance — both are Satori/inline
//   contexts with no CSS custom-property access).
// - RATCHETED: every other file, checked against the per-file count frozen
//   in hex-literal-baseline.json when this guard was introduced. A file's
//   count may not exceed its baseline, and a file with no baseline entry may
//   not introduce any.
//
// Run with --update-baseline to regenerate the baseline file from the
// current tree (only after a deliberate, reviewed change to the debt, never
// as a way to silence a failing check).

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(fileURLToPath(import.meta.url), "..", "..");
const baselinePath = join(repoRoot, "scripts", "hex-literal-baseline.json");

const SCAN_DIRS = ["app", "lib"];
const EXTENSIONS = [".ts", ".tsx", ".css"];
const EXEMPT_PREFIXES = [
  join("app", "globals.css"),
  join("app", "components", "ui") + "\\",
  join("app", "components", "ui") + "/",
  join("app", "components", "figma") + "\\",
  join("app", "components", "figma") + "/",
  join("lib", "site.ts"),
  join("app", "global-error.tsx"),
];
const HEX_PATTERN = /#[0-9a-fA-F]{3,8}\b/g;

function isExempt(relPath) {
  return EXEMPT_PREFIXES.some((p) => relPath === p || relPath.startsWith(p));
}

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
}

function countHexLiterals() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    walk(join(repoRoot, dir), files);
  }

  const counts = {};
  for (const abs of files) {
    const rel = relative(repoRoot, abs);
    if (isExempt(rel)) continue;
    const text = readFileSync(abs, "utf8");
    const matches = text.match(HEX_PATTERN);
    if (matches && matches.length > 0) {
      counts[rel.split("\\").join("/")] = matches.length;
    }
  }
  return counts;
}

const current = countHexLiterals();

if (process.argv.includes("--update-baseline")) {
  writeFileSync(baselinePath, JSON.stringify(current, null, 2) + "\n");
  console.log(`Wrote ${Object.keys(current).length} file(s) to ${relative(repoRoot, baselinePath)}`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));

const failures = [];
for (const [file, count] of Object.entries(current)) {
  const allowed = baseline[file] ?? 0;
  if (count > allowed) {
    failures.push(`${file}: ${count} hex literal(s), baseline allows ${allowed}`);
  }
}

if (failures.length > 0) {
  console.error("New hex-colour literal(s) found outside the frozen baseline:\n");
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    "\nColours come from tokens in app/globals.css (see CLAUDE.md). If this " +
      "growth is deliberate and reviewed, regenerate the baseline with " +
      "`node scripts/check-hex-literals.mjs --update-baseline`.",
  );
  process.exit(1);
}

console.log(`Hex-literal guard: ${Object.keys(current).length} file(s) within baseline.`);
