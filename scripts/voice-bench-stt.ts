/**
 * VOICE-009: AssemblyAI measured on owner takes (docs/decisions/0182).
 *
 *   npx tsx --env-file=.env.local scripts/voice-bench-stt.ts \
 *     --out=<dir> --model=universal-3-5-pro [--keep] <audio files...>
 *
 * For each file: upload to the EU endpoint, transcribe with `disfluencies:
 * true`, poll until done, then DELETE the transcript and GET it again. Prints
 * one JSON line per file and writes the full transcript (words included) to
 * <out>/<file>.<model>.json, which voice-bench-claude.ts reads. `--keep` skips
 * the DELETE (nothing in this repo needs that; it is there for re-runs).
 *
 * Raw fetch, not the AssemblyAI SDK: a bench is no reason for a dependency.
 * Owner recordings only; never point this at learner audio.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const BASE = "https://api.eu.assemblyai.com";
// USD per hour of audio, async, EU same as US (assemblyai.com/pricing, read 2026-10-21).
const PRICE_PER_HOUR: Record<string, number> = { "universal-3-5-pro": 0.21, "universal-2": 0.15 };
// AssemblyAI's default filler list (docs: pre-recorded-audio/filler-words) plus "er"/"erm".
const FILLERS = new Set(["um", "uh", "er", "erm", "hmm", "hm", "mhm", "mm", "m", "ah", "huh", "uh-huh", "eh"]);

const key = process.env.ASSEMBLYAI_API_KEY;
if (!key) throw new Error("ASSEMBLYAI_API_KEY is not set");

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const out = flag("out") ?? "";
const model = flag("model") ?? "universal-3-5-pro";
const keep = args.includes("--keep");
const files = args.filter((a) => !a.startsWith("--"));
if (!out || files.length === 0) throw new Error("usage: --out=<dir> [--model=] [--keep] <files...>");
if (!(model in PRICE_PER_HOUR)) throw new Error(`unknown model ${model}`);
mkdirSync(out, { recursive: true });

type Word = { text: string; start: number; end: number; confidence: number };
type Transcript = {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  error?: string;
  text: string | null;
  words: Word[] | null;
  confidence: number | null;
  audio_duration: number | null;
  speech_model_used?: string | null;
};

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE}${path}`, { ...init, headers: { authorization: key!, ...init.headers } });
}

const norm = (w: string) => w.toLowerCase().replace(/[^a-z'-]/g, "");

/**
 * Repeats and restarts the analysis cares about. Fillers are set aside first, so
 * "or uh or" counts as a repeat of "or".
 * - repeat: the same 1-3 words twice in a row ("I made I made").
 * - restart candidate: the same word two apart with a different word after it
 *   ("in this in the", "I go, I went"). Candidates only: "I think I will" matches
 *   too, so they are listed for a reader, never counted as errors.
 */
function disfluencies(words: Word[]) {
  const all = words.map((w) => norm(w.text));
  const fillers = all.filter((t) => FILLERS.has(t));
  const toks = all.filter((t) => t && !FILLERS.has(t));
  const repeats: string[] = [];
  const restarts: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    for (let n = 3; n >= 1; n--) {
      const a = toks.slice(i, i + n).join(" ");
      if (i + 2 * n <= toks.length && a === toks.slice(i + n, i + 2 * n).join(" ")) {
        repeats.push(`${a} ${a}`);
        i += 2 * n - 1;
        break;
      }
    }
  }
  for (let i = 0; i + 3 < toks.length; i++) {
    if (toks[i] === toks[i + 2] && toks[i + 1] !== toks[i + 3] && toks[i] !== toks[i + 1]) {
      restarts.push(toks.slice(i, i + 4).join(" "));
    }
  }
  return { fillers: fillers.length, fillerList: [...new Set(fillers)], repeats, restarts };
}

async function main() {
for (const file of files) {
  const name = basename(file);
  const body = readFileSync(file);
  const t0 = performance.now();
  const up = await api("/v2/upload", { method: "POST", body, headers: { "content-type": "application/octet-stream" } });
  if (!up.ok) throw new Error(`${name}: upload ${up.status} ${await up.text()}`);
  const { upload_url } = (await up.json()) as { upload_url: string };
  const t1 = performance.now();

  const create = await api("/v2/transcript", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ audio_url: upload_url, speech_models: [model], disfluencies: true, language_code: "en" }),
  });
  if (!create.ok) throw new Error(`${name}: create ${create.status} ${await create.text()}`);
  let tr = (await create.json()) as Transcript;
  while (tr.status === "queued" || tr.status === "processing") {
    await new Promise((r) => setTimeout(r, 500));
    tr = (await (await api(`/v2/transcript/${tr.id}`)).json()) as Transcript;
  }
  const t2 = performance.now();
  if (tr.status === "error") {
    console.log(JSON.stringify({ file: name, model, status: "error", error: tr.error }));
    continue;
  }
  writeFileSync(join(out, `${name}.${model}.json`), JSON.stringify(tr, null, 2));

  const words = tr.words ?? [];
  const confs = words.map((w) => w.confidence);
  const d = disfluencies(words);
  const audio = tr.audio_duration ?? 0;

  let deletion: Record<string, unknown> = { skipped: true };
  if (!keep) {
    const del = await api(`/v2/transcript/${tr.id}`, { method: "DELETE" });
    const after = await api(`/v2/transcript/${tr.id}`);
    const afterBody = after.ok ? ((await after.json()) as Transcript) : null;
    // The upload host is reported, not assumed: an EU-endpoint upload was handed a
    // cdn.assemblyai.com URL that served an S3 us-west-2 certificate (0182).
    const audioAfter = await fetch(upload_url, { headers: { authorization: key! } }).then(
      (r) => r.status,
      (e: { cause?: { code?: string } }) => e.cause?.code ?? "fetch failed",
    );
    deletion = {
      delete: del.status,
      getAfter: after.status,
      textAfter: afterBody ? (afterBody.text ?? null)?.slice(0, 40) : null,
      wordsAfter: afterBody ? (afterBody.words?.length ?? null) : null,
      uploadHost: new URL(upload_url).host,
      uploadGetAfter: audioAfter,
    };
  }

  console.log(
    JSON.stringify({
      file: name,
      model,
      modelUsed: tr.speech_model_used ?? null,
      audioS: audio,
      bytes: body.length,
      uploadS: +((t1 - t0) / 1000).toFixed(2),
      transcribeS: +((t2 - t1) / 1000).toFixed(2),
      rtf: audio ? +((t2 - t1) / 1000 / audio).toFixed(3) : null,
      costUsd: +((audio / 3600) * PRICE_PER_HOUR[model]).toFixed(5),
      words: words.length,
      wpm: audio ? +((words.length / audio) * 60).toFixed(1) : null,
      confidence: tr.confidence,
      meanWordConf: confs.length ? +(confs.reduce((a, b) => a + b, 0) / confs.length).toFixed(3) : null,
      lowConfShare: confs.length ? +(confs.filter((c) => c < 0.6).length / confs.length).toFixed(3) : null,
      fillers: d.fillers,
      fillerList: d.fillerList,
      repeats: d.repeats,
      restarts: d.restarts,
      deletion,
    }),
  );
}
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
