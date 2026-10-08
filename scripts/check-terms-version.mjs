#!/usr/bin/env node
// Guards that the Terms version a new signup is stamped with agrees with the
// version the Terms page shows (OPS-022, docs/decisions/0095 Decision 4,
// following 0034's pattern: a plain Node script wired into `npm run check`).
//
// handle_new_user() (migration 054) calls public.current_terms_version(), so
// the stamped version is whatever the LATEST migration that defines that
// function returns. That must equal the "Version X.Y" header of
// docs/release/legal/terms-of-service.md.
//
// Fails on zero matches too: a guard that finds no definition, or no header,
// has checked nothing.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(fileURLToPath(import.meta.url), "..", "..");
const migrationsDir = join(repoRoot, "supabase", "migrations");
const termsPath = join(repoRoot, "docs", "release", "legal", "terms-of-service.md");

const DEFINITION =
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?current_terms_version\s*\(\s*\)[\s\S]*?\$\$\s*SELECT\s+'([^']+)'/i;

function fail(message) {
  console.error(`Terms-version guard: ${message}`);
  process.exit(1);
}

// Migrations are NNN_name.sql, so a name sort is the apply order.
const files = readdirSync(migrationsDir)
  .filter((f) => /^\d+_.*\.sql$/.test(f))
  .sort();

let latest = null;
for (const file of files) {
  const match = readFileSync(join(migrationsDir, file), "utf8").match(DEFINITION);
  if (match) latest = { file, version: match[1] };
}
if (!latest) {
  fail("no migration defines current_terms_version(); expected one returning the Terms version.");
}

const header = readFileSync(termsPath, "utf8").match(/^Version (\d+\.\d+) · Last updated /m);
if (!header) {
  fail(`no "Version X.Y · Last updated …" line found in ${termsPath}.`);
}

if (latest.version !== header[1]) {
  fail(
    `${latest.file} makes current_terms_version() return '${latest.version}', ` +
      `but terms-of-service.md is version ${header[1]}. A Terms bump replaces ` +
      "current_terms_version() in a new migration, in the same commit.",
  );
}

console.log(`Terms-version guard: ${latest.file} and terms-of-service.md agree on ${header[1]}.`);
