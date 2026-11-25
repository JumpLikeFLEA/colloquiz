/**
 * PROG-012's parity check (docs/decisions/0236 section 2): what migration 112's copy writes
 * equals what parseStoredAnalysis reads from the same stored rows. Local stack only; it talks to
 * the local container through docker, inside one transaction that is rolled back.
 *
 *   npx tsx scripts/notebook-parity-local-run.ts
 *
 * One case per stored result. Each is finished through voice_analysis_finish, then the notebook
 * rows are read back and compared with the TypeScript parse of the same JSON and transcript.
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { parseStoredAnalysis } from "@/lib/voice/analysis/parseStored";

const T = "I was about to leave. Well, I have went home, and I don’t mind. Он сказал <b>да</b>.";
const at = (quote: string) => {
  const start = T.indexOf(quote);
  if (start < 0) throw new Error(`fixture: "${quote}" is not in the transcript`);
  return { start, end: start + quote.length };
};
const said = (expression: string, quote: string, exact: boolean) => ({ expression, quote, exact, span: at(quote) });
const error = (quote: string, correction: string) => ({
  quote,
  correction,
  category: "grammar",
  explanation: "Because.",
  span: at(quote),
});
const invented = { ...error("I have went", "I went"), quote: "never said", span: { start: 0, end: 10 } };
const base = {
  v: 1,
  summary: "You told a clear story.",
  howItSounds: "Friendly.",
  goal: null as string | null,
  goalReached: null,
  nextStep: null as string | null,
  expressionsUsed: [said("be about to", "was about to", false), said("I don't mind", "I don’t mind", true)],
  highlights: [],
  errors: [error("I have went", "I went"), error("Well, I", "So I")],
  mainError: 0 as unknown,
  thenNow: [],
  courseLinks: [],
  counts: { expressionsListed: 2 },
  coverage: { analysedSeconds: 40, truncated: false },
};

const cases: Record<string, { instruction: string; result: unknown }> = {
  "first (goal)": { instruction: "first", result: { ...base, kind: "first", goal: "Use the past simple." } },
  "no slot (first, neither goal nor next step)": { instruction: "first", result: { ...base, kind: "first" } },
  "final (next step)": { instruction: "final", result: { ...base, kind: "final", nextStep: "Keep going.", mainError: 1 } },
  "interim (next step)": { instruction: "interim", result: { ...base, kind: "interim", nextStep: "Try a story." } },
  "a first carrying a stray next step, a goal too": {
    instruction: "first",
    result: { ...base, kind: "first", goal: "G", nextStep: "stray" },
  },
  "a final carrying a stray goal": { instruction: "final", result: { ...base, kind: "final", goal: "stray", nextStep: "N" } },
  "no error, no expression": { instruction: "first", result: { ...base, kind: "first", expressionsUsed: [], errors: [], mainError: null } },
  "quotes nobody said": {
    instruction: "first",
    result: {
      ...base,
      kind: "first",
      expressionsUsed: [{ ...said("x", "leave", true), quote: "never said" }, said("y", "leave", true)],
      errors: [invented, error("I have went", "I went")],
      mainError: 1,
    },
  },
  "the main error is the invented one": {
    instruction: "first",
    result: { ...base, kind: "first", errors: [invented, error("I have went", "I went")], mainError: 0 },
  },
  "malformed members shift the main error's index": {
    instruction: "final",
    result: {
      ...base,
      kind: "final",
      expressionsUsed: [null, "x", { expression: 1 }, { ...said("z", "leave", true), exact: "yes" }, { ...said("z", "leave", true), span: { start: 1.5, end: 3 } }, said("ok", "leave", true)],
      errors: [null, { ...error("I have went", "x"), category: "nope" }, { ...error("I have went", "x"), explanation: 4 }, error("Well, I", "So I"), error("I have went", "I went")],
      mainError: 1,
    },
  },
  "an empty quote and an empty span": {
    instruction: "first",
    result: {
      ...base,
      kind: "first",
      expressionsUsed: [{ ...said("e", "leave", true), quote: "" }, { ...said("e", "leave", true), span: { start: 5, end: 5 } }],
    },
  },
  "wrong types at the top": {
    instruction: "first",
    result: { kind: "first", summary: 4, goal: ["x"], expressionsUsed: "x", errors: {}, mainError: "0" },
  },
  "a negative main error": { instruction: "first", result: { ...base, kind: "first", mainError: -1 } },
  "a main error of 0.5": { instruction: "first", result: { ...base, kind: "first", mainError: 0.5 } },
  "not an analysis (string)": { instruction: "first", result: "nope" },
  "not an analysis (unknown kind)": { instruction: "first", result: { ...base, kind: "other" } },
  "not an analysis (array)": { instruction: "first", result: [] },
};

type Copied = {
  said: { phrase: string; quote: string; exact: boolean }[];
  fix: { quote: string; correction: string }[];
  summary: { kind: string; summary: string; goal: string | null; next_step: string | null } | null;
};

function fromTypeScript(result: unknown): Copied {
  const a = parseStoredAnalysis(result, T);
  if (!a) return { said: [], fix: [], summary: null };
  const main = a.mainError === null ? null : a.errors[a.mainError];
  return {
    said: a.expressionsUsed.map((e) => ({ phrase: e.expression, quote: e.quote, exact: e.exact })),
    fix: main ? [{ quote: main.quote, correction: main.correction }] : [],
    summary: { kind: a.kind, summary: a.summary, goal: a.goal, next_step: a.nextStep },
  };
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const user = randomUUID();
const course = randomUUID();
const lesson = randomUUID();
const version = randomUUID();
const takes = Object.entries(cases).map(([name, c]) => ({ name, ...c, id: randomUUID() }));

const sql = `
BEGIN;
INSERT INTO auth.users (id, aud, role, email) VALUES ('${user}', 'authenticated', 'authenticated', 'parity-${user}@verify.test');
INSERT INTO courses (id, slug, title, level, status, format) VALUES ('${course}', 'parity-${course}', 'P', 'A2', 'draft', 'self_paced');
INSERT INTO lessons (id, course_id, ordinal, title, slug) VALUES ('${lesson}', '${course}', 1, 'L', 'l');
INSERT INTO lesson_versions (id, lesson_id, document, source) VALUES ('${version}', '${lesson}', '[]', 'editor');
ALTER TABLE voice_analysis_sends DISABLE TRIGGER voice_analysis_caps;
${takes
  .map(
    (t, i) => `
INSERT INTO voice_submissions (id, user_id, course_id, lesson_id, block_id, lesson_version_id, object_name, content_type)
VALUES ('${t.id}', '${user}', '${course}', '${lesson}', 'b${i}', '${version}', 'parity/${t.id}', 'audio/webm');
WITH s AS (INSERT INTO voice_analysis_sends (user_id, lesson_id, block_id, submission_id, slot)
  VALUES ('${user}', '${lesson}', 'b${i}', '${t.id}', 'self_paced') RETURNING id)
INSERT INTO voice_analyses (submission_id, send_id) SELECT '${t.id}', id FROM s;
SELECT 'FIN ${t.id} ' || voice_analysis_finish('${t.id}', ${q(T)}, ${q(JSON.stringify(t.result))}::jsonb, '${t.instruction}', 'v0', 'm', '{}'::jsonb);
SELECT 'ST ${t.id} ' || status FROM voice_analyses WHERE submission_id = '${t.id}';
SELECT 'ROW ${t.id} ' || jsonb_build_object(
  'said', COALESCE((SELECT jsonb_agg(jsonb_build_object('phrase', phrase, 'quote', quote, 'exact', exact) ORDER BY ctid) FROM notebook_entries WHERE submission_id = '${t.id}' AND kind = 'said'), '[]'::jsonb),
  'fix', COALESCE((SELECT jsonb_agg(jsonb_build_object('quote', quote, 'correction', correction)) FROM notebook_entries WHERE submission_id = '${t.id}' AND kind = 'fix'), '[]'::jsonb),
  'summary', (SELECT jsonb_build_object('kind', kind, 'summary', summary, 'goal', goal, 'next_step', next_step) FROM notebook_summaries WHERE submission_id = '${t.id}'))::text;`,
  )
  .join("\n")}
ROLLBACK;
`;

const run = spawnSync(
  "docker",
  ["exec", "-i", "supabase_db_colloquiz", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
  { input: sql, encoding: "utf8" },
);
if (run.status !== 0) {
  console.error(run.stderr);
  process.exit(1);
}
const line = (tag: string, id: string) => {
  const l = run.stdout.split(/\r?\n/).find((x) => x.startsWith(`${tag} ${id} `));
  if (!l) throw new Error(`no ${tag} line for ${id}`);
  return l.slice(tag.length + id.length + 2);
};

let failed = 0;
let copied = 0;
for (const t of takes) {
  const fin = `${line("FIN", t.id)} ${line("ST", t.id)}`;
  const got = JSON.parse(line("ROW", t.id)) as Copied;
  const want = fromTypeScript(t.result);
  const ok = fin === "true done" && isDeepStrictEqual(got, want);
  if (got.summary) copied++;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${t.name}: said ${got.said.length}, fix ${got.fix.length}, summary ${got.summary ? 1 : 0}, goal ${got.summary?.goal ? "yes" : "no"}, next step ${got.summary?.next_step ? "yes" : "no"} (finish: ${fin})`);
  if (!ok) console.log("  sql:", JSON.stringify(got), "\n  ts: ", JSON.stringify(want));
}
console.log(`${failed === 0 ? "PASS" : "FAIL"}: ${takes.length - failed} of ${takes.length} cases equal; ${copied} copied`);
process.exit(failed === 0 && copied > 0 ? 0 : 1);
