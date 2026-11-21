/**
 * AUTH-025 (docs/decisions/0233): run every inline field of every lesson
 * document through the Studio rich-text field's converters and report what
 * changes. Read-only; takes a JSON file of `[{ id, document }]` rows.
 *
 *   docker exec supabase_db_colloquiz psql -U postgres -d postgres -Atc \
 *     "select coalesce(json_agg(json_build_object('id', id, 'document', document)), '[]') from lesson_versions" > rows.json
 *   npx tsx scripts/rich-text-roundtrip.ts rows.json
 *
 * Exits 1 when a field's round trip differs from its canonical form, when a
 * field's characters change, or when a document that parsed stops parsing.
 */
import { readFileSync } from "node:fs";
import { parseLessonDocument } from "../lib/lessons/parseLessonDocument";
import { docToRuns, normalizeRuns, runsToDoc } from "../lib/lessons/richTextDoc";
import type { InlineContent } from "../lib/lessons/inline";

type Row = { id: string; document: unknown };

function isRunList(value: unknown): value is InlineContent {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (run) =>
        run !== null &&
        typeof run === "object" &&
        typeof (run as { text?: unknown }).text === "string" &&
        Object.keys(run).every((key) => key === "text" || key === "marks"),
    )
  );
}

const rows = JSON.parse(readFileSync(process.argv[2], "utf8")) as Row[];
let fields = 0;
let canonicalAlready = 0;
let withNewline = 0;
const failures: string[] = [];

for (const row of rows) {
  const before = parseLessonDocument(row.document).ok;
  const rewrite = (value: unknown, path: string): unknown => {
    if (isRunList(value)) {
      fields++;
      const trip = docToRuns(runsToDoc(value));
      const canon = normalizeRuns(value);
      if (JSON.stringify(trip) !== JSON.stringify(canon)) failures.push(`${row.id} ${path}: round trip != canonical`);
      if (trip.map((r) => r.text).join("") !== value.map((r) => r.text).join("").replace(/\r\n?/g, "\n")) {
        failures.push(`${row.id} ${path}: characters changed`);
      }
      if (JSON.stringify(trip) === JSON.stringify(value)) canonicalAlready++;
      if (value.some((r) => r.text.includes("\n"))) withNewline++;
      return trip;
    }
    if (Array.isArray(value)) return value.map((v, i) => rewrite(v, `${path}[${i}]`));
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v, `${path}.${k}`)]));
    }
    return value;
  };
  const after = rewrite(row.document, "document");
  const afterOk = parseLessonDocument(after).ok;
  if (before && !afterOk) failures.push(`${row.id}: parsed before, fails after the round trip`);
  console.log(`${row.id} parse before=${before} after=${afterOk}`);
}

console.log(
  `documents=${rows.length} inline_fields=${fields} unchanged=${canonicalAlready} ` +
    `normalized=${fields - canonicalAlready} with_line_feed=${withNewline} failures=${failures.length}`,
);
for (const failure of failures) console.log(`FAIL ${failure}`);
process.exit(failures.length > 0 || fields === 0 ? 1 : 0);
