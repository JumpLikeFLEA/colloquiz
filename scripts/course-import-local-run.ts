/**
 * CNT-018's local run with a real Anthropic key (docs/decisions/0203). Everything runs against
 * the LOCAL Supabase stack; it refuses any other URL, and it spends real money on Anthropic
 * (Opus, effort high, one plan call and one call per lesson, plus a repair when a draft fails).
 *
 *   LOCAL_API_URL=http://127.0.0.1:54321 LOCAL_ANON_KEY=... LOCAL_SERVICE_KEY=... \
 *   npx tsx --env-file=.env.local scripts/course-import-local-run.ts --file=<path> [--kill]
 *
 * (.env.local points at the HOSTED project; this script uses it only for ANTHROPIC_API_KEY and
 * hands the dev server the LOCAL_* values instead.)
 *
 * Through the real routes (`next dev`, COURSE_IMPORT_MODE=on): upload to the course-imports
 * bucket with a signed token, POST /api/studio/imports, poll GET .../[id] until done or failed.
 * With --kill the server is killed as soon as the row has left `pending`, then started again;
 * the next status poll, once the lease has run out, must finish the SAME import (same
 * Anthropic file, no second upload). At the end it prints the row, the course it made, the
 * bucket folder, and whether the Anthropic file is still listed. It seeds its own admin and
 * author and deletes them at the end.
 */
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const args = process.argv.slice(2);
const opt = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const file = opt("file");
const kill = args.includes("--kill");
if (!file) throw new Error("usage: --file=<pdf|docx|md|txt> [--kill]");

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
const LLM_KEY = process.env.ANTHROPIC_API_KEY ?? "";
if (!LLM_KEY) throw new Error("ANTHROPIC_API_KEY must be set");

const admin: SupabaseClient = createClient(URL, SERVICE, { auth: { persistSession: false } });
const anthropic = new Anthropic({ apiKey: LLM_KEY });
const say = (o: Record<string, unknown>) => console.log(JSON.stringify(o));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const BUCKET = "course-imports";
const tag = randomUUID().slice(0, 8);
const PASSWORD = `Pw-${randomUUID()}`;

async function makeUser(label: string) {
  const email = `cnt18-${label}-${tag}@verify.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  return { id: data.user.id, email };
}

async function signIn(email: string) {
  const jar = new Map<string, string>();
  const ssr = createServerClient(URL, ANON, {
    cookies: {
      getAll: () => [...jar].map(([n, v]) => ({ name: n, value: v })),
      setAll: (cs) => cs.forEach((c) => jar.set(c.name, c.value)),
    },
  });
  const { error } = await ssr.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`signIn: ${error.message}`);
  return { ssr, cookie: [...jar].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ") };
}

// ── next dev, started and killed by this script ─────────────────────────────
let server: ChildProcess | null = null;
let serverLog = "";
async function startServer(port: number) {
  serverLog = "";
  server = spawn("npx", ["next", "dev", "-p", String(port)], {
    shell: true,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE,
      COURSE_IMPORT_MODE: "on",
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

async function post(base: string, cookie: string, path: string, body: unknown) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function importRow(id: string) {
  const { data } = await admin
    .from("course_imports")
    .select("status, anthropic_file_id, object_name, lessons_done, lease_until, usage, failure, course_id, prompt_version, model")
    .eq("id", id)
    .maybeSingle();
  return data;
}

async function anthropicHas(fileId: string): Promise<boolean> {
  for await (const f of anthropic.beta.files.list({ betas: ["files-api-2025-04-14"] })) {
    if (f.id === fileId) return true;
  }
  return false;
}

async function main() {
  const adminUser = await makeUser("admin");
  await admin.from("profiles").update({ role: "admin" }).eq("id", adminUser.id);
  const author = await makeUser("author");
  const seat = await admin.from("author_seats").insert({
    user_id: author.id,
    kind: "teacher",
    public_name: `CNT18 ${tag}`,
    expires_at: null,
    granted_by: adminUser.id,
    can_import: true,
  });
  if (seat.error) throw new Error(`seat: ${seat.error.message}`);
  const me = await signIn(author.email);
  say({ seeded: { author: author.id, file: basename(file!) } });

  let importId: string | null = null;
  let fileId: string | null = null;
  try {
    let base = await startServer(3102);

    const bytes = readFileSync(file!);
    const up = await post(base, me.cookie, "/api/studio/imports/upload-url", { fileName: basename(file!), size: bytes.byteLength });
    say({ step: "upload-url", http: up.status, ok: up.body.ok, objectName: up.body.objectName });
    if (!up.body.ok) throw new Error(`upload-url: ${JSON.stringify(up.body)}`);
    const put = await me.ssr.storage
      .from(BUCKET)
      .uploadToSignedUrl(up.body.objectName as string, up.body.token as string, bytes, { contentType: up.body.contentType as string });
    if (put.error) throw new Error(`upload: ${put.error.message}`);

    const started = Date.now();
    const created = await post(base, me.cookie, "/api/studio/imports", {
      objectName: up.body.objectName,
      format: up.body.format,
      title: `CNT-018 run ${tag}`,
      slug: `cnt18-${tag}`,
      level: "B1",
    });
    say({ step: "create", http: created.status, ...created.body });
    importId = created.body.importId as string;
    if (!importId) throw new Error("create did not return an import id");

    if (kill) {
      let before: Awaited<ReturnType<typeof importRow>> = null;
      for (let i = 0; i < 1200; i++) {
        before = await importRow(importId);
        // Killed once the file is read (and, for a PDF, uploaded) and the model is being asked.
        if (before && before.status !== "pending") break;
        await sleep(200);
      }
      stopServer();
      fileId = before?.anthropic_file_id ?? null;
      say({
        step: "killed",
        status: before?.status,
        lessonsDone: before?.lessons_done,
        anthropicFileId: fileId,
        leaseUntil: before?.lease_until,
        sinceCreateS: +((Date.now() - started) / 1000).toFixed(1),
      });
      if (!before || before.status === "done") throw new Error("finished before it could be killed");
      base = await startServer(3102);
    }

    let last = "";
    let final: { state?: string; courseId?: string | null; failure?: unknown } = {};
    for (let i = 0; i < 400; i++) {
      const res = await fetch(`${base}/api/studio/imports/${importId}`, { headers: { cookie: me.cookie } });
      const text = await res.text();
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(text) as Record<string, unknown>;
      } catch {
        say({ step: "status-not-json", http: res.status, body: text.slice(0, 200), serverLogTail: serverLog.slice(-1500) });
      }
      const row = await importRow(importId);
      const mark = `${body.state}/${row?.status}/${row?.lessons_done}`;
      if (mark !== last) say({ step: "poll", state: body.state, rowStatus: row?.status, lessonsDone: row?.lessons_done, sinceS: +((Date.now() - started) / 1000).toFixed(1) });
      last = mark;
      if (body.state === "done" || body.state === "failed") {
        final = body as typeof final;
        break;
      }
      await sleep(kill ? 10_000 : 5_000);
    }

    const row = await importRow(importId);
    fileId ??= row?.anthropic_file_id ?? null;
    const usage = (row?.usage ?? []) as { step: string; model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; stopReason: string; fallbackRan: boolean; ms: number }[];
    say({
      step: "row",
      status: row?.status,
      failure: row?.failure,
      promptVersion: row?.prompt_version,
      model: row?.model,
      lessonsDone: row?.lessons_done,
      anthropicFileIdAfter: row?.anthropic_file_id,
      objectNameAfter: row?.object_name,
      usage: usage.map((u) => ({ step: u.step, model: u.model, in: u.inputTokens, out: u.outputTokens, cacheRead: u.cacheReadTokens, cacheWrite: u.cacheWriteTokens, stop: u.stopReason, fallback: u.fallbackRan, s: +(u.ms / 1000).toFixed(1) })),
    });

    if (row?.course_id) {
      const course = await admin.from("courses").select("slug, title, status, author_id, subtitle").eq("id", row.course_id).single();
      const lessons = await admin.from("lessons").select("id, ordinal, slug, title, access_level, published_version_id").eq("course_id", row.course_id).order("ordinal");
      const versions = await admin
        .from("lesson_versions")
        .select("source, document, lesson_id")
        .in("lesson_id", (lessons.data ?? []).map((l) => l.id as string));
      const editors = await admin.from("course_editors").select("user_id").eq("course_id", row.course_id);
      say({
        step: "course",
        course: course.data,
        authorIsSeeded: (course.data as { author_id?: string } | null)?.author_id === author.id,
        editors: (editors.data ?? []).length,
        lessons: (lessons.data ?? []).map((l) => ({ ordinal: l.ordinal, slug: l.slug, title: l.title, access: l.access_level, published: l.published_version_id !== null })),
        versions: (versions.data ?? []).map((v) => ({ source: v.source, blocks: (v.document as unknown[]).length })),
      });
    }

    const folder = await admin.storage.from(BUCKET).list(author.id);
    say({
      step: "gone",
      bucketObjectsLeft: (folder.data ?? []).length,
      anthropicFileStillListed: fileId ? await anthropicHas(fileId) : "no file id recorded (not a PDF)",
      anthropicFileId: fileId,
    });

    if (final.state !== "done") throw new Error(`the import ended ${final.state}: ${JSON.stringify(final.failure)}`);
    if (row?.anthropic_file_id !== null || row?.object_name !== null) throw new Error("the row still names the object or the Anthropic file");
    say({ result: "PASS" });
  } finally {
    stopServer();
    const { data: made } = await admin.from("course_imports").select("course_id").eq("user_id", author.id);
    const names = ((await admin.storage.from(BUCKET).list(author.id)).data ?? []).map((o) => `${author.id}/${o.name}`);
    if (names.length) await admin.storage.from(BUCKET).remove(names);
    if (fileId && (await anthropicHas(fileId))) await anthropic.beta.files.delete(fileId, { betas: ["files-api-2025-04-14"] });
    await admin.from("course_imports").delete().eq("user_id", author.id);
    for (const m of made ?? []) if (m.course_id) await admin.from("courses").delete().eq("id", m.course_id);
    await admin.from("author_seats").delete().eq("user_id", author.id);
    await admin.auth.admin.deleteUser(author.id);
    await admin.auth.admin.deleteUser(adminUser.id);
    const left = await Promise.all([
      admin.from("course_imports").select("id", { count: "exact", head: true }).eq("user_id", author.id),
      admin.from("courses").select("id", { count: "exact", head: true }).like("slug", `cnt18-${tag}%`),
      admin.from("author_seats").select("user_id", { count: "exact", head: true }).eq("user_id", author.id),
    ]);
    say({ cleanup: { imports: left[0].count, courses: left[1].count, seats: left[2].count, objects: names.length } });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
