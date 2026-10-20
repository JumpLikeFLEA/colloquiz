/**
 * VOICE-009: the voice analysis measured on Claude (docs/decisions/0182).
 *
 *   npx tsx --env-file=.env.local scripts/voice-bench-claude.ts \
 *     --stt=<dir from voice-bench-stt.ts> --out=<dir> [--reps=3] [--efforts=high,low]
 *
 * Five analyses: the three owner takes under the `first` instruction and two
 * `final` comparisons. Each runs `reps` times per effort level, sequentially,
 * so the cached system block is read back after the first call. Prints one
 * JSON line per call and a summary per case, and writes every parsed output to
 * <out>. Stops when its own cost tally passes $3 (the owner's cap).
 *
 * Every count here is computed by this script from the model's output, never
 * taken from it (0156 "Model output is checked before it is shown").
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const MODEL = process.env.ANTHROPIC_MODEL_VOICE ?? "claude-sonnet-5-5";
// USD per million tokens for claude-sonnet-5-5: input, output, 5-minute cache
// write (1.25x input), cache read (claude-api skill model table, cached 2026-10-06).
const PRICE = { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 };
const CAP_USD = 3;

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const sttDir = flag("stt") ?? "";
const out = flag("out") ?? "";
const reps = Number(flag("reps") ?? 3);
const efforts = (flag("efforts") ?? "high").split(",") as ("low" | "medium" | "high")[];
if (!sttDir || !out) throw new Error("usage: --stt=<dir> --out=<dir> [--reps=3] [--efforts=high,low]");
mkdirSync(out, { recursive: true });

const Quote = z.string().describe("Copied character for character from the transcript");
const Base = {
  summary: z.string(),
  expressions_used: z.array(z.object({ expression: z.string(), quote: Quote, exact: z.boolean() })),
  highlights: z.array(
    z.object({ quote: Quote, kind: z.enum(["strength", "self_correction", "hesitation"]), note: z.string() }),
  ),
  errors: z.array(
    z.object({
      quote: Quote,
      correction: z.string(),
      category: z.enum(["grammar", "vocabulary", "word_order", "collocation", "other"]),
      explanation: z.string(),
    }),
  ),
  main_error: z.number().int().nullable(),
  how_it_sounds: z.string(),
  goal: z.string(),
};
const FirstSchema = z.object(Base);
const FinalSchema = z.object({
  ...Base,
  then_now: z.array(z.object({ then: z.string(), now: z.string(), note: z.string() })),
});
type Analysis = z.infer<typeof FinalSchema> | z.infer<typeof FirstSchema>;

const TASK = "Talk for about a minute about something from your life: a recent event, a plan, or something you are learning.";
const EXPRESSIONS = [
  "I've always wanted to",
  "make up my mind",
  "have a great time",
  "I used to",
  "make ends meet",
  "save up for a rainy day",
  "keep an eye on",
  "fall through",
];

const instruction = (name: string) =>
  readFileSync(join("prompts/voice-analysis", `${name}-v0.md`), "utf8").replace(/^<!--[\s\S]*?-->\s*/, "");
const transcript = (take: string) =>
  (JSON.parse(readFileSync(join(sttDir, `${take}.webm.universal-3-5-pro.json`), "utf8")) as { text: string }).text;

type Case = { id: string; kind: "first" | "final"; first?: string; final: string };
const CASES: Case[] = [
  { id: "first-A2", kind: "first", final: "A2" },
  { id: "first-A2-B1", kind: "first", final: "A2-B1" },
  { id: "first-B1-B2", kind: "first", final: "B1-B2" },
  { id: "final-A2-to-A2-B1", kind: "final", first: "A2", final: "A2-B1" },
  { id: "final-A2-B1-to-B1-B2", kind: "final", first: "A2-B1", final: "B1-B2" },
];
// --long: the 600 s take alone (the three takes looped), for the worst-case latency.
if (args.includes("--long")) CASES.splice(0, CASES.length, { id: "first-long-600", kind: "first", final: "long-600" });

const client = new Anthropic();
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
const FILLERS = /\b(um|uh|er|erm|hmm|hm|mhm|mm|ah|eh)\b/gi;
const words = (s: string) => s.replace(FILLERS, " ").split(/\s+/).filter((w) => /[a-z]/i.test(w)).length;

function quotes(a: Analysis, kind: Case["kind"]) {
  const inFinal = [
    ...a.expressions_used.map((e) => e.quote),
    ...a.highlights.map((h) => h.quote),
    ...a.errors.map((e) => e.quote),
    ...("then_now" in a ? a.then_now.map((p) => p.now) : []),
  ];
  const inFirst = kind === "final" && "then_now" in a ? a.then_now.map((p) => p.then) : [];
  return { inFinal, inFirst };
}

async function main() {
  let spent = 0;
  const rows: Record<string, unknown>[] = [];
  for (const effort of efforts) {
    for (const c of CASES) {
      for (let rep = 1; rep <= reps; rep++) {
        if (spent > CAP_USD) throw new Error(`cost cap reached: $${spent.toFixed(4)}`);
        const finalText = transcript(c.final);
        const firstText = c.first ? transcript(c.first) : "";
        const user =
          `<task_prompt>${TASK}</task_prompt>\n<expressions>\n${EXPRESSIONS.join("\n")}\n</expressions>\n` +
          (c.kind === "first"
            ? `<transcript>${finalText}</transcript>`
            : `<first_transcript>${firstText}</first_transcript>\n<final_transcript>${finalText}</final_transcript>`);

        const t0 = performance.now();
        const res = await client.beta.messages.parse({
          model: MODEL,
          max_tokens: 16000,
          // The "default" form is newer than this SDK's types (0.104.1 types the array form only).
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default" as unknown as undefined,
          system: [{ type: "text", text: instruction(c.kind), cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: user }],
          output_config: { effort, format: betaZodOutputFormat(c.kind === "first" ? FirstSchema : FinalSchema) },
        });
        const ms = Math.round(performance.now() - t0);

        const u = res.usage;
        const cacheWrite = u.cache_creation_input_tokens ?? 0;
        const cacheRead = u.cache_read_input_tokens ?? 0;
        const cost =
          (u.input_tokens * PRICE.input + u.output_tokens * PRICE.output + cacheWrite * PRICE.cacheWrite + cacheRead * PRICE.cacheRead) /
          1e6;
        spent += cost;
        const fallbackRan = (u as { iterations?: { type: string }[] }).iterations?.some((i) => i.type === "fallback_message") ?? false;

        const a = res.parsed_output as Analysis | null;
        const row: Record<string, unknown> = {
          case: c.id,
          effort,
          rep,
          ms,
          stop: res.stop_reason,
          model: res.model,
          fallbackRan,
          input: u.input_tokens,
          output: u.output_tokens,
          cacheWrite,
          cacheRead,
          costUsd: +cost.toFixed(5),
          parsed: a !== null,
        };
        if (a) {
          const q = quotes(a, c.kind);
          const all = [...q.inFinal.map((s) => [s, finalText]), ...q.inFirst.map((s) => [s, firstText])];
          const exact = all.filter(([s, t]) => t.includes(s)).length;
          const loose = all.filter(([s, t]) => norm(t).includes(norm(s))).length;
          const n = words(finalText);
          Object.assign(row, {
            quotes: all.length,
            verbatimExact: exact,
            verbatimLoose: loose,
            misses: all.filter(([s, t]) => !norm(t).includes(norm(s))).map(([s]) => s),
            errors: a.errors.length,
            errorsPer100: +((a.errors.length / n) * 100).toFixed(2),
            mainError: a.main_error !== null && a.errors[a.main_error] ? a.errors[a.main_error].quote : null,
            mainErrorValid: a.main_error === null || a.main_error < a.errors.length,
            expressions: a.expressions_used.map((e) => `${e.expression}${e.exact ? "" : " (near)"}`),
            expressionsInList: a.expressions_used.every((e) => EXPRESSIONS.includes(e.expression)),
            highlights: a.highlights.length,
            hesitations: a.highlights.filter((h) => h.kind === "hesitation").length,
            thenNow: "then_now" in a ? a.then_now.length : null,
            words: n,
          });
          writeFileSync(join(out, `${c.id}.${effort}.${rep}.json`), JSON.stringify({ row, analysis: a }, null, 2));
        }
        rows.push(row);
        console.log(JSON.stringify(row));
      }
    }
  }

  // Stability across reps: does the main error stay the same, how much do error sets overlap.
  const jaccard = (x: string[], y: string[]) => {
    const a = new Set(x.map(norm)), b = new Set(y.map(norm));
    const inter = [...a].filter((v) => b.has(v)).length;
    return a.size + b.size - inter === 0 ? 1 : inter / (a.size + b.size - inter);
  };
  for (const effort of efforts) {
    for (const c of CASES) {
      const rs = rows.filter((r) => r.case === c.id && r.effort === effort && r.parsed);
      const outs = rs.map((r) => JSON.parse(readFileSync(join(out, `${c.id}.${effort}.${r.rep}.json`), "utf8")).analysis as Analysis);
      const pairs: number[] = [];
      for (let i = 0; i < outs.length; i++)
        for (let j = i + 1; j < outs.length; j++) pairs.push(jaccard(outs[i].errors.map((e) => e.quote), outs[j].errors.map((e) => e.quote)));
      console.log(
        JSON.stringify({
          summary: c.id,
          effort,
          runs: rs.length,
          errors: rs.map((r) => r.errors),
          mainErrors: rs.map((r) => r.mainError),
          errorQuoteJaccard: pairs.length ? +(pairs.reduce((s, v) => s + v, 0) / pairs.length).toFixed(2) : null,
          msP50: rs.map((r) => r.ms as number).sort((x, y) => x - y)[Math.floor(rs.length / 2)] ?? null,
          costMean: rs.length ? +(rs.reduce((s, r) => s + (r.costUsd as number), 0) / rs.length).toFixed(5) : null,
        }),
      );
    }
  }
  console.log(JSON.stringify({ totalUsd: +spent.toFixed(4), calls: rows.length }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
