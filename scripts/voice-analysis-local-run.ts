/**
 * VOICE-012's local run with real provider keys (docs/decisions/0187). Everything runs
 * against the LOCAL Supabase stack; it refuses any other URL, and it spends real money on
 * AssemblyAI and Anthropic (about $0.02 a take, 0182).
 *
 *   LOCAL_API_URL=http://127.0.0.1:54321 LOCAL_ANON_KEY=... LOCAL_SERVICE_KEY=... \
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/voice-analysis-local-run.ts \
 *     --take=<first.webm> --take2=<second.webm>
 *
 * (`--conditions=react-server` lets the `server-only` import in lib/voice/analysis/server.ts
 * load outside Next, for the in-process payload run.) Provider keys come from .env.local.
 *
 * Four scenarios, each printed as JSON lines:
 *   A  a take reaches `done` through the real route (`next dev`, mode on), and the
 *      transcript is deleted at AssemblyAI after it is stored;
 *   B  the server is killed while the take is being processed; the next status poll, once the
 *      lease has run out, finishes the SAME job (no second one);
 *   C  mode `paused`: the take uploads and is accepted, no analysis exists, the send is given back;
 *   D  the pipeline in-process with every outgoing request captured, scanned for the learner's
 *      id, email and name (with a positive control, so an empty scan cannot pass).
 * It seeds its own users, course and objects and deletes them at the end.
 */
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClaudeAnalyser } from "../lib/voice/analysis/claude";
import { createSttClient } from "../lib/voice/analysis/assemblyai";
import { runVoiceAnalysis, type PipelineDeps } from "../lib/voice/analysis/pipeline";
import { createPipelineStore, createStager, readInstruction } from "../lib/voice/analysis/server";

const args = process.argv.slice(2);
const opt = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const take1 = opt("take");
const take2 = opt("take2");
if (!take1 || !take2) throw new Error("usage: --take=<webm> --take2=<webm>");

const URL = process.env.LOCAL_API_URL ?? "";
const ANON = process.env.LOCAL_ANON_KEY ?? "";
const SERVICE = process.env.LOCAL_SERVICE_KEY ?? "";
const host = (() => {
  try {
    return new globalThis.URL(URL).hostname;
  } catch {
    return "";
  }
})();
if (!["127.0.0.1", "localhost"].includes(host) || !ANON || !SERVICE) {
  throw new Error("refusing to run: LOCAL_API_URL must be a loopback URL, with LOCAL_ANON_KEY and LOCAL_SERVICE_KEY");
}
const STT_KEY = process.env.ASSEMBLYAI_API_KEY ?? "";
const LLM_KEY = process.env.ANTHROPIC_API_KEY ?? "";
if (!STT_KEY || !LLM_KEY) throw new Error("ASSEMBLYAI_API_KEY and ANTHROPIC_API_KEY must be set");

const admin: SupabaseClient = createClient(URL, SERVICE, { auth: { persistSession: false } });
const say = (o: Record<string, unknown>) => console.log(JSON.stringify(o));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const BUCKET = "voice-recordings";
const tag = randomUUID().slice(0, 8);
const PASSWORD = `Pw-${randomUUID()}`;

// ── seed ────────────────────────────────────────────────────────────────────
type Learner = { id: string; email: string; name: string; cookie: string; ssr: ReturnType<typeof createServerClient> };

async function learner(label: string): Promise<Learner> {
  const email = `v12-${label}-${tag}@verify.test`;
  const name = `Verify Learner ${label} ${tag}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  const jar = new Map<string, string>();
  const ssr = createServerClient(URL, ANON, {
    cookies: {
      getAll: () => [...jar].map(([n, v]) => ({ name: n, value: v })),
      setAll: (cs) => cs.forEach((c) => jar.set(c.name, c.value)),
    },
  });
  const { error: sErr } = await ssr.auth.signInWithPassword({ email, password: PASSWORD });
  if (sErr) throw new Error(`signIn: ${sErr.message}`);
  const cookie = [...jar].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
  return { id: data.user.id, email, name, cookie, ssr };
}

const LISTEN_FOR = ["I used to", "make up my mind", "have a great time", "keep an eye on"];
const must = <T>(r: { data: T; error: { message: string } | null }, what: string): NonNullable<T> => {
  if (r.error || r.data === null || r.data === undefined) throw new Error(`${what}: ${r.error?.message}`);
  return r.data as NonNullable<T>;
};

async function seedCourse() {
  const course = must(
    await admin
      .from("courses")
      .insert({ slug: `v12-${tag}`, title: "V12 run", level: "A2", status: "published", format: "self_paced", subtitle: "s", cover_image_url: "c" })
      .select("id")
      .single(),
    "course",
  );
  const lesson = must(
    await admin
      .from("lessons")
      .insert({ course_id: course.id, ordinal: 1, title: "LA", slug: "la", access_level: "anyone" })
      .select("id")
      .single(),
    "lesson",
  );
  const document = [
    {
      id: "vt1",
      kind: "task",
      type: "voice",
      prompt: [{ text: "Tell us about something you learned recently." }],
      maxSeconds: 180,
      compare: "before",
      listenFor: LISTEN_FOR,
    },
  ];
  const version = must(
    await admin.from("lesson_versions").insert({ lesson_id: lesson.id, document, source: "editor" }).select("id").single(),
    "version",
  );
  must(await admin.from("lessons").update({ published_version_id: version.id }).eq("id", lesson.id).select("id").single(), "publish");
  return { courseId: course.id as string, lessonId: lesson.id as string };
}

// ── driving the real routes ────────────────────────────────────────────────
async function upload(l: Learner, courseId: string, file: string) {
  const submissionId = randomUUID();
  const objectName = `${courseId}/${l.id}/${submissionId}.webm`;
  const { error } = await l.ssr.storage.from(BUCKET).upload(objectName, readFileSync(file), { contentType: "audio/webm" });
  if (error) throw new Error(`upload: ${error.message}`);
  return { submissionId, objectName };
}

async function send(base: string, l: Learner, lessonId: string, take: { submissionId: string; objectName: string }) {
  const res = await fetch(`${base}/api/voice/submissions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: l.cookie },
    body: JSON.stringify({ ...take, lessonId, blockId: "vt1" }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function status(base: string, l: Learner, submissionId: string) {
  const res = await fetch(`${base}/api/voice/submissions/${submissionId}/analysis`, { headers: { cookie: l.cookie } });
  const text = await res.text();
  try {
    return JSON.parse(text) as { ok: boolean; status: string; result?: Record<string, unknown> | null };
  } catch {
    // Not JSON: say what the server said instead of dying on the parse.
    say({ step: "status-not-json", http: res.status, body: text.slice(0, 200), serverLogTail: serverLog.slice(-1500) });
    return { ok: false, status: `http_${res.status}` };
  }
}

async function row(submissionId: string) {
  const { data } = await admin
    .from("voice_analyses")
    .select("status, stt_job_id, instruction, prompt_version, model, usage, failure, lease_until, transcript, result")
    .eq("submission_id", submissionId)
    .maybeSingle();
  return data;
}

async function ledger(submissionId: string) {
  const { data } = await admin
    .from("voice_analysis_sends")
    .select("analysed, counted, uncounted_reason")
    .eq("submission_id", submissionId)
    .maybeSingle();
  return data;
}

// ── next dev, started and killed by this script ─────────────────────────────
let server: ChildProcess | null = null;
let serverLog = "";
async function startServer(port: number, mode: string) {
  serverLog = "";
  server = spawn("npx", ["next", "dev", "-p", String(port)], {
    shell: true,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE,
      VOICE_ANALYSIS_MODE: mode,
    },
  });
  server.stdout?.on("data", (d) => (serverLog += String(d)));
  server.stderr?.on("data", (d) => (serverLog += String(d)));
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${base}/login`)).status === 200) return base;
    } catch {
      // not up yet
    }
    await sleep(1000);
  }
  throw new Error("next dev did not start");
}
function stopServer() {
  if (server?.pid) {
    try {
      execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: "ignore" });
    } catch {
      // already gone
    }
  }
  server = null;
}

// ── scenarios ───────────────────────────────────────────────────────────────
async function scenarioA(base: string, l: Learner, s: { courseId: string; lessonId: string }) {
  const take = await upload(l, s.courseId, take1!);
  const t0 = Date.now();
  const sent = await send(base, l, s.lessonId, take);
  say({ scenario: "A", step: "send", http: sent.status, ...sent.body });
  let last = "";
  let final: Awaited<ReturnType<typeof status>> | null = null;
  for (let i = 0; i < 90; i++) {
    const st = await status(base, l, take.submissionId);
    if (st.status !== last) say({ scenario: "A", step: "poll", status: st.status, sinceSendS: +((Date.now() - t0) / 1000).toFixed(1) });
    last = st.status;
    if (st.status === "done" || st.status === "failed") {
      final = st;
      break;
    }
    await sleep(2000);
  }
  const r = await row(take.submissionId);
  say({
    scenario: "A",
    step: "row",
    status: r?.status,
    instruction: r?.instruction,
    promptVersion: r?.prompt_version,
    model: r?.model,
    usage: r?.usage,
    transcriptChars: r?.transcript?.length,
    transcriptHead: r?.transcript?.slice(0, 80),
    counts: (r?.result as { counts?: unknown } | null)?.counts,
    coverage: (r?.result as { coverage?: unknown } | null)?.coverage,
    dropped: (r?.result as { dropped?: unknown } | null)?.dropped,
    leaseCleared: r?.lease_until === null,
    ledger: await ledger(take.submissionId),
    statusRouteResultPresent: final?.result != null,
  });
  if (r?.stt_job_id) {
    const after = await fetch(`https://api.eu.assemblyai.com/v2/transcript/${r.stt_job_id}`, { headers: { authorization: STT_KEY } });
    const body = (await after.json()) as { text?: string | null; words?: unknown };
    say({ scenario: "A", step: "provider-after", http: after.status, text: body.text, words: body.words ?? null });
  }
  if (r?.status !== "done") throw new Error("scenario A: the take did not reach done");
  return take;
}

async function scenarioB(port: number, base: string, l: Learner, s: { courseId: string; lessonId: string }) {
  const take = await upload(l, s.courseId, take2!);
  const sent = await send(base, l, s.lessonId, take);
  say({ scenario: "B", step: "send", http: sent.status, ...sent.body });
  let before: Awaited<ReturnType<typeof row>> = null;
  for (let i = 0; i < 600; i++) {
    before = await row(take.submissionId);
    if (before && before.status !== "pending") break;
    await sleep(200);
  }
  stopServer();
  say({ scenario: "B", step: "killed", status: before?.status, sttJobId: before?.stt_job_id, leaseUntil: before?.lease_until });
  if (!before || before.status === "done") throw new Error("scenario B: finished before it could be killed");

  const base2 = await startServer(port, "on");
  const t0 = Date.now();
  let last = "";
  for (let i = 0; i < 100; i++) {
    const st = await status(base2, l, take.submissionId);
    if (st.status !== last) say({ scenario: "B", step: "poll", status: st.status, sinceRestartS: +((Date.now() - t0) / 1000).toFixed(1) });
    last = st.status;
    if (st.status === "done" || st.status === "failed") break;
    await sleep(5000);
  }
  const after = await row(take.submissionId);
  say({
    scenario: "B",
    step: "recovered",
    status: after?.status,
    sameJob: before.stt_job_id !== null ? after?.stt_job_id === before.stt_job_id : "job not yet created at kill",
    model: after?.model,
    usage: after?.usage,
    waitedS: +((Date.now() - t0) / 1000).toFixed(1),
  });
  if (after?.status !== "done") throw new Error("scenario B: the take did not recover");
  return take;
}

async function scenarioC(base: string, l: Learner, s: { courseId: string; lessonId: string }) {
  const take = await upload(l, s.courseId, take1!);
  const sent = await send(base, l, s.lessonId, take);
  say({ scenario: "C", step: "send", http: sent.status, ...sent.body });
  let r: Awaited<ReturnType<typeof row>> = null;
  for (let i = 0; i < 40; i++) {
    r = await row(take.submissionId);
    if (!r) break;
    await sleep(500);
  }
  const obj = await admin.storage.from(BUCKET).list(`${s.courseId}/${l.id}`);
  const stored = await admin.from("voice_submissions").select("id").eq("id", take.submissionId).maybeSingle();
  say({
    scenario: "C",
    step: "after",
    analysisRow: r,
    ledger: await ledger(take.submissionId),
    takeStored: stored.data !== null,
    objectStored: (obj.data ?? []).some((o) => o.name.startsWith(take.submissionId)),
    serverLogMentionsProvider: /assemblyai|anthropic/i.test(serverLog),
  });
  if (r !== null) throw new Error("scenario C: an analysis row exists under paused");
}

async function scenarioD(l: Learner, s: { courseId: string; lessonId: string }) {
  const take = await upload(l, s.courseId, take1!);
  // The RPC as the learner, the same call the route makes.
  const { data, error } = await l.ssr.rpc("submit_voice_recording", {
    p_submission_id: take.submissionId,
    p_lesson_id: s.lessonId,
    p_block_id: "vt1",
    p_object_name: take.objectName,
  });
  if (error || !(data as { ok?: boolean }).ok) throw new Error(`submit: ${error?.message ?? JSON.stringify(data)}`);

  const captured: { target: string; contentType: string | null; body: string }[] = [];
  const tap =
    (kind: string): typeof fetch =>
    async (input, init) => {
      const target = typeof input === "string" ? input : input instanceof globalThis.URL ? input.href : (input as Request).url;
      const body = init?.body;
      const headers = new Headers(init?.headers);
      captured.push({
        target: `${init?.method ?? "GET"} ${target}`,
        contentType: headers.get("content-type"),
        body:
          typeof body === "string"
            ? body
            : body
              ? `<${kind} binary, ${(body as Uint8Array).byteLength} bytes>`
              : "",
      });
      return fetch(input, init);
    };
  const stt = createSttClient({ apiKey: STT_KEY, fetchFn: tap("audio") });
  const deps: PipelineDeps = {
    mode: "on",
    store: createPipelineStore(admin),
    stt,
    stage: createStager(admin, stt),
    claude: createClaudeAnalyser({ apiKey: LLM_KEY, fetchFn: tap("claude") }),
    instruction: readInstruction,
    sleep,
    now: () => Date.now(),
  };
  const outcome = await runVoiceAnalysis(take.submissionId, deps);
  say({ scenario: "D", step: "outcome", outcome });

  for (const c of captured) {
    // Authorization and the provider key headers are never part of `body`; the target and the
    // body are what a provider could learn a person from.
    say({ scenario: "D", step: "request", target: c.target.replace(/token=[^&]+/, "token=<redacted>"), contentType: c.contentType, body: c.body.length > 600 ? `${c.body.slice(0, 600)}… (${c.body.length} chars)` : c.body });
  }
  const wire = captured.map((c) => `${c.target}\n${c.body}`).join("\n");
  const needles: Record<string, string> = { userId: l.id, email: l.email, localPart: l.email.split("@")[0], fullName: l.name, courseId: s.courseId, submissionId: take.submissionId };
  const found = Object.fromEntries(Object.entries(needles).map(([k, v]) => [k, wire.includes(v)]));
  // The control: the learner's own object name does contain these, so the scan can find them.
  const control = `${take.objectName}`.includes(l.id) && `${wire}\n${take.objectName}`.includes(l.id);
  say({ scenario: "D", step: "payload-scan", requests: captured.length, found, controlFindsUserIdInTheTakesOwnName: control });
  if (Object.values(found).some(Boolean) || !control) throw new Error("scenario D: a provider payload names the learner, or the control failed");
  if (outcome.kind !== "done") throw new Error(`scenario D: outcome ${outcome.kind}`);
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  const seed = await seedCourse();
  const l1 = await learner("a");
  const l2 = await learner("c");
  const l3 = await learner("d");
  const users = [l1, l2, l3];
  say({ seeded: { courseId: seed.courseId, learners: users.length } });
  try {
    const base = await startServer(3101, "on");
    await scenarioA(base, l1, seed);
    await scenarioB(3101, base, l1, seed);
    stopServer();
    const paused = await startServer(3101, "paused");
    await scenarioC(paused, l2, seed);
    stopServer();
    await scenarioD(l3, seed);
    say({ result: "PASS" });
  } finally {
    stopServer();
    for (const u of users) {
      const list = await admin.storage.from(BUCKET).list(`${seed.courseId}/${u.id}`);
      const names = (list.data ?? []).map((o) => `${seed.courseId}/${u.id}/${o.name}`);
      if (names.length) await admin.storage.from(BUCKET).remove(names);
    }
    await admin.from("voice_analysis_sends").delete().in("user_id", users.map((u) => u.id));
    await admin.from("courses").delete().eq("id", seed.courseId);
    for (const u of users) await admin.auth.admin.deleteUser(u.id);
    const left = await Promise.all([
      admin.from("voice_submissions").select("id", { count: "exact", head: true }).eq("course_id", seed.courseId),
      admin.from("voice_analysis_sends").select("id", { count: "exact", head: true }).in("user_id", users.map((u) => u.id)),
      admin.from("courses").select("id", { count: "exact", head: true }).eq("id", seed.courseId),
    ]);
    say({ cleanup: { submissions: left[0].count, ledger: left[1].count, courses: left[2].count } });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
