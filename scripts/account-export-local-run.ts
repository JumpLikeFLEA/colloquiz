/**
 * OPS-044's measurement (docs/decisions/0250): the account export's reads, run as a real user
 * against the local stack, past and under PostgREST's max_rows. Local stack only.
 *
 *   npx tsx scripts/account-export-local-run.ts
 *
 * It runs lib/accountExportReads.ts, the code the route runs, under a user session made with the
 * anon key. Seeding and clean-up go through the local container with docker (as postgres).
 *
 * 1. Past the limit: a scratch account with 1,005 lesson_attempts and 1,005 messages, every
 *    group of rows sharing a timestamp, so a page boundary falls inside a tie. Each section must
 *    return exactly count(*) rows, no duplicate id, and the same id set as the table.
 * 2. Control: six seeded fixture accounts, under the limit everywhere. Every section must return
 *    the same rows as the unpaged read (one request per section, as before), compared as sorted
 *    JSON.
 * 3. A failing page: a second page that errors fails the whole read (no rows).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PostgrestTransformBuilder } from "@supabase/postgrest-js";
import { execFileSync } from "node:child_process";
import { readAccountExportSections } from "@/lib/accountExportReads";

const PASSWORD = "password123!";
const LESSON_VERSION = "27c51a62-4011-445e-ae4a-3eaaa4354f79";
const N = 1005;
const CONTROL_ACCOUNTS = ["prog002-learner@example.com", "prog007-learner@example.com", "play006-entitled@example.com", "hw-student@example.com", "hw-student2@example.com", "hw-teacher@example.com"];

function psql(sql: string): string {
  return execFileSync("docker", ["exec", "-i", "supabase_db_colloquiz", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], { encoding: "utf8" }).trim();
}

function localEnv(): Record<string, string> {
  const out = execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["supabase@2.120.0", "status", "-o", "env"], { encoding: "utf8", shell: true });
  return Object.fromEntries(
    out.split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
  );
}

async function signIn(url: string, anon: string, email: string): Promise<{ client: SupabaseClient; id: string }> {
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.user) throw new Error(`sign-in ${email}: ${error?.message}`);
  return { client, id: data.user.id };
}

type Sections = Extract<Awaited<ReturnType<typeof readAccountExportSections>>, { ok: true }>;
const SET_SECTIONS = ["resultsRes", "achievementsRes", "membershipsRes", "duelsRes", "lessonAttemptsRes", "lessonOpensRes", "entitlementsRes", "enrolmentsRes", "invitesRes", "voiceRes", "finalCommentsRes", "teacherLinksRes", "teacherGroupsRes", "conversationsRes", "homeworkRes", "authorSeatRes", "calendarFeedRes", "telegramLinkRes", "voiceAnalysesRes", "writingRes"] as const;
const ONE_SECTIONS = ["profileRes", "acquisitionRes", "notebookRes"] as const;

async function read(client: SupabaseClient, id: string): Promise<Sections> {
  const r = await readAccountExportSections(client, id);
  if (!r.ok) throw new Error(`export read failed: ${r.message}`);
  return r;
}

/**
 * The same reads as the route made before: the first page has no range (the server's max_rows
 * alone bounds it), and any later page asks for 0 rows, so readAllPages stops after one request.
 */
async function readUnpaged(client: SupabaseClient, id: string): Promise<Sections> {
  const proto = PostgrestTransformBuilder.prototype as unknown as { range: (from: number, to: number) => unknown };
  const original = proto.range;
  proto.range = function (this: { limit: (n: number) => unknown }, from: number) {
    return from > 0 ? this.limit(0) : this;
  };
  try {
    return await read(client, id);
  } finally {
    proto.range = original;
  }
}

const sortedJson = (rows: unknown) => JSON.stringify((Array.isArray(rows) ? rows : [rows]).map((r) => JSON.stringify(r)).sort());

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${detail}`);
  if (!ok) failures++;
}

async function main() {
  const env = localEnv();
  const url = env.API_URL, anon = env.ANON_KEY, service = env.SERVICE_ROLE_KEY;
  if (!url || !/127\.0\.0\.1|localhost/.test(url)) throw new Error(`local stack only, got ${url}`);
  console.log(`Supabase URL: ${url}`);
  const admin = createClient(url, service, { auth: { persistSession: false } });

  // 1. Past the limit.
  const email = `ops044-${Date.now()}@example.test`;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (cErr || !created.user) throw cErr ?? new Error("createUser");
  const uid = created.user.id;
  const teacher = psql(`select id from profiles where id <> '${uid}' order by created_at limit 1`);
  try {
    // 7 distinct timestamps for 1,005 rows: ~144 rows per tie, so row 1,000 sits inside one.
    psql(`insert into lesson_attempts (id, user_id, lesson_version_id, block_id, earned, possible, created_at)
      select gen_random_uuid(), '${uid}', '${LESSON_VERSION}', 'b' || g, 1, 1,
             '2026-11-01T00:00:00Z'::timestamptz + (g % 7) * interval '1 minute'
      from generate_series(1, ${N}) g`);
    // Messages: every one at the same instant, so the order rests on message_id alone.
    // session_replication_role skips the messages rate-limit trigger for this insert only.
    const conv = psql(`insert into teacher_conversations (teacher_id, student_id) values ('${teacher}', '${uid}') returning id`).split("\n")[0];
    psql(`set session_replication_role = replica;
      insert into teacher_messages (conversation_id, author_id, body, created_at)
      select '${conv}', '${uid}', '[{"text":"m"}]'::jsonb, '2026-11-01T00:00:00Z'
      from generate_series(1, ${N}) g`);

    const countAttempts = Number(psql(`select count(*) from lesson_attempts where user_id='${uid}'`));
    const countMessages = Number(psql(`select count(*) from teacher_messages where conversation_id='${conv}'`));
    const dbAttemptIds = psql(`select id from lesson_attempts where user_id='${uid}' order by id`).split("\n");
    const dbMessageIds = psql(`select id from teacher_messages where conversation_id='${conv}' order by id`).split("\n");

    const { client } = await signIn(url, anon, email);
    const before = await readUnpaged(client, uid);
    console.log(`before (unpaged): lesson_attempts count(*) ${countAttempts}, exported ${before.lessonAttemptsRes.data?.length}; messages count(*) ${countMessages}, exported ${before.conversationsRes.data?.length}`);
    const after = await read(client, uid);
    const attempts = (after.lessonAttemptsRes.data ?? []) as { id: string }[];
    const messages = (after.conversationsRes.data ?? []) as { message_id: string }[];
    const aIds = attempts.map((r) => r.id), mIds = messages.map((r) => r.message_id);
    check("lesson_attempts past the limit", attempts.length === countAttempts && new Set(aIds).size === countAttempts && JSON.stringify([...aIds].sort()) === JSON.stringify(dbAttemptIds),
      `count(*) ${countAttempts}, exported ${attempts.length}, distinct ids ${new Set(aIds).size}, id set equal to table ${JSON.stringify([...aIds].sort()) === JSON.stringify(dbAttemptIds)}`);
    check("messages past the limit (RPC)", messages.length === countMessages && new Set(mIds).size === countMessages && JSON.stringify([...mIds].sort()) === JSON.stringify(dbMessageIds),
      `count(*) ${countMessages}, exported ${messages.length}, distinct ids ${new Set(mIds).size}, id set equal to table ${JSON.stringify([...mIds].sort()) === JSON.stringify(dbMessageIds)}`);
  } finally {
    psql(`delete from teacher_messages where author_id='${uid}'; delete from teacher_conversations where student_id='${uid}'; delete from lesson_attempts where user_id='${uid}'`);
    await admin.auth.admin.deleteUser(uid);
    const left = psql(`select (select count(*) from lesson_attempts where user_id='${uid}') + (select count(*) from teacher_conversations where student_id='${uid}') + (select count(*) from auth.users where id='${uid}')`);
    console.log(`cleanup: ${left} rows left for the scratch account`);
    if (left !== "0") failures++;
  }

  // 2. Control: accounts under the limit read the same rows as before. Several fixture accounts,
  // so most sections have rows in at least one of them; the rest are named in the output.
  const withRows = new Set<string>();
  for (const controlEmail of CONTROL_ACCOUNTS) {
    const control = await signIn(url, anon, controlEmail);
    const old = await readUnpaged(control.client, control.id);
    const now = await read(control.client, control.id);
    const counts: string[] = [];
    for (const key of [...SET_SECTIONS, ...ONE_SECTIONS]) {
      const a = sortedJson(old[key].data), b = sortedJson(now[key].data);
      const n = Array.isArray(now[key].data) ? (now[key].data as unknown[]).length : now[key].data == null ? 0 : 1;
      if (n > 0) { withRows.add(key); counts.push(`${key.replace(/Res$/, "")} ${n}`); }
      if (a !== b) check(`control ${controlEmail} ${key}`, false, `${n} rows, differs from unpaged`);
    }
    check(`control ${controlEmail}`, true, `every section same as unpaged; rows: ${counts.join(", ") || "none"}`);
  }
  const empty = [...SET_SECTIONS, ...ONE_SECTIONS].filter((k) => !withRows.has(k));
  check("control covers sections", withRows.size >= 12, `${withRows.size} sections with rows in some control; empty in all: ${empty.join(", ") || "none"}`);

  // 3. A failing second page fails the read: break range() for offsets past 0.
  const proto = PostgrestTransformBuilder.prototype as unknown as { range: (from: number, to: number) => unknown };
  const original = proto.range;
  proto.range = function (this: { eq: (c: string, v: string) => unknown }, from: number, to: number) {
    return from > 0 ? original.call(this.eq("no_such_column", "x"), from, to) : original.call(this, from, to);
  };
  try {
    // The scratch account is gone; seed a short-lived one with 1,001 attempts.
    const e2 = `ops044-fail-${Date.now()}@example.test`;
    const { data: c2 } = await admin.auth.admin.createUser({ email: e2, password: PASSWORD, email_confirm: true });
    const u2 = c2.user!.id;
    try {
      psql(`insert into lesson_attempts (id, user_id, lesson_version_id, block_id, earned, possible) select gen_random_uuid(), '${u2}', '${LESSON_VERSION}', 'b' || g, 1, 1 from generate_series(1, 1001) g`);
      const s = await signIn(url, anon, e2);
      const r = await readAccountExportSections(s.client, u2);
      check("a failed second page fails the export", !r.ok, r.ok ? "read succeeded" : `refused: ${r.message}`);
    } finally {
      psql(`delete from lesson_attempts where user_id='${u2}'`);
      await admin.auth.admin.deleteUser(u2);
    }
  } finally {
    proto.range = original;
  }

  console.log(failures === 0 ? "OPS-044 local run: PASS" : `OPS-044 local run: FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
