/**
 * PROG-007's local verification (docs/decisions/0191). Runs against the LOCAL Supabase stack only
 * (it refuses any other URL) and calls no AI provider: every analysis is written straight into
 * the tables, through the service role and the 097 functions, as VOICE-014's run does.
 *
 *   LOCAL_API_URL=http://127.0.0.1:54321 LOCAL_ANON_KEY=... LOCAL_SERVICE_KEY=... \
 *   npx tsx scripts/prog007-local-run.ts seed  [--out=state.json]
 *   (start the app against the same stack with VOICE_ANALYSIS_MODE=on, then)
 *   ... check --base=http://localhost:3123 [--off=http://localhost:3124] [--out=state.json]
 *   ... cleanup [--out=state.json]
 *
 * `seed` makes three learners on one course (A: a done, a hidden and a failed analysis; B: one
 * done; E: a course EDITOR who is also a learner, with one done of their own) and prints the
 * logins. `check` fetches `/my` as each of them and `/runs/<id>` as the seed's fixture learners
 * (scripts/seed-local-fixtures.ts must have been run), printing PASS/FAIL per cell, each denial
 * beside the positive control it is a denial of. `--off` is a second server with the mode `off`.
 * `cleanup` deletes every row and object the seed made and prints the counts.
 */
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const OUT = opt("out") ?? "prog007-state.json";

const URL_ = process.env.LOCAL_API_URL ?? "";
const ANON = process.env.LOCAL_ANON_KEY ?? "";
const SERVICE = process.env.LOCAL_SERVICE_KEY ?? "";
const host = (() => {
  try {
    return new URL(URL_).hostname;
  } catch {
    return "";
  }
})();
if (!["127.0.0.1", "localhost"].includes(host) || !ANON || !SERVICE) {
  throw new Error("refusing to run: LOCAL_API_URL must be a loopback URL, with LOCAL_ANON_KEY and LOCAL_SERVICE_KEY");
}
const admin: SupabaseClient = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const BUCKET = "voice-recordings";
const PASSWORD = "password123!";
const FIXTURE_RUN = "c0050000-0000-4000-8000-00000000f1a1";
const FIXTURE_LEARNER = "prog007-learner@example.com";
const OTHER_RUN_LEARNER = "prog002-learner@example.com";
const AFTER_TAKE = "f0070000-0000-4000-8000-0000000000b2";

const must = <T>(r: { data: T; error: { message: string } | null }, what: string): NonNullable<T> => {
  if (r.error || r.data === null || r.data === undefined) throw new Error(`${what}: ${r.error?.message}`);
  return r.data as NonNullable<T>;
};

type State = {
  tag: string;
  users: Record<"a" | "b" | "e", { id: string; email: string }>;
  courseId: string;
  courseSlug: string;
  userIds: string[];
  objects: string[];
};

const TEXT = "Yesterday I went to the shop with my friend and I had a great time.";
const result = () => ({
  v: 1,
  kind: "first",
  summary: "A clear story.",
  howItSounds: "Friendly.",
  goal: "Use the past simple two times.",
  goalReached: null,
  nextStep: null,
  expressionsUsed: [],
  highlights: [{ quote: "I had a great time", kind: "strength", note: "Natural.", span: { start: TEXT.indexOf("I had a great time"), end: TEXT.indexOf("I had a great time") + 18 } }],
  errors: [],
  mainError: null,
  thenNow: [],
  counts: { errors: 0, highlights: 1, hesitations: 0, expressionsUsed: 0, expressionsListed: 0, thenNow: 0 },
  coverage: { analysedSeconds: 10, truncated: false },
  dropped: { expressions: 0, highlights: 0, errors: 0, thenNow: 0 },
});

async function newUser(label: string, tag: string) {
  const email = `p7-${label}-${tag}@verify.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  return { id: data.user.id, email };
}

async function seed() {
  const tag = randomUUID().slice(0, 8);
  const users = { a: await newUser("a", tag), b: await newUser("b", tag), e: await newUser("e", tag) };
  const course = must(
    await admin
      .from("courses")
      .insert({ slug: `p7-${tag}`, title: `P7 ${tag}`, level: "A2", status: "published", format: "self_paced", subtitle: "s", cover_image_url: "c" })
      .select("id")
      .single(),
    "course",
  );
  must(await admin.from("course_editors").insert({ course_id: course.id, user_id: users.e.id }).select("course_id").single(), "editor");
  const st: State = {
    tag,
    users,
    courseId: course.id as string,
    courseSlug: `p7-${tag}`,
    userIds: [users.a.id, users.b.id, users.e.id],
    objects: [],
  };

  const voice = [{ id: "v", kind: "task", type: "voice", prompt: [{ text: "Tell us about your day." }], maxSeconds: 180 }];
  async function lesson(slug: string, ordinal: number) {
    const l = must(
      await admin
        .from("lessons")
        .insert({ course_id: course.id, ordinal, title: `Lesson ${slug}`, slug, access_level: "anyone" })
        .select("id")
        .single(),
      `lesson ${slug}`,
    );
    const v = must(await admin.from("lesson_versions").insert({ lesson_id: l.id, document: voice, source: "editor" }).select("id").single(), "version");
    must(await admin.from("lessons").update({ published_version_id: v.id }).eq("id", l.id).select("id").single(), "publish");
    return { lessonId: l.id as string, versionId: v.id as string };
  }

  async function take(userId: string, slug: string, ordinal: number, how: "done" | "hidden" | "failed") {
    const l = await lesson(slug, ordinal);
    const id = randomUUID();
    const objectName = `${course.id}/${userId}/${id}.webm`;
    const up = await admin.storage.from(BUCKET).upload(objectName, new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]), { contentType: "audio/webm" });
    if (up.error) throw new Error(`upload: ${up.error.message}`);
    st.objects.push(objectName);
    must(
      await admin
        .from("voice_submissions")
        .insert({ id, user_id: userId, course_id: course.id, lesson_id: l.lessonId, block_id: "v", lesson_version_id: l.versionId, object_name: objectName, content_type: "audio/webm", size_bytes: 8 })
        .select("id")
        .single(),
      `take ${slug}`,
    );
    const send = must(
      await admin
        .from("voice_analysis_sends")
        .insert({ user_id: userId, lesson_id: l.lessonId, block_id: "v", submission_id: id, slot: "self_paced" })
        .select("id")
        .single(),
      `ledger ${slug}`,
    );
    must(await admin.from("voice_analyses").insert({ submission_id: id, send_id: send.id }).select("submission_id").single(), `analysis ${slug}`);
    if (how === "failed") {
      const f = await admin.rpc("voice_analysis_fail", { p_submission_id: id, p_failure: "llm_refusal" });
      if (f.error || f.data !== true) throw new Error(`fail: ${f.error?.message ?? f.data}`);
      return;
    }
    const r = await admin.rpc("voice_analysis_finish", {
      p_submission_id: id,
      p_transcript: TEXT,
      p_result: result(),
      p_instruction: "first",
      p_prompt_version: "first-v1",
      p_model: "claude-sonnet-5-5",
      p_usage: {},
      p_baseline: null,
    });
    if (r.error || r.data !== true) throw new Error(`finish: ${r.error?.message ?? r.data}`);
    if (how === "hidden") {
      must(await admin.from("voice_analyses").update({ hidden_at: new Date().toISOString() }).eq("submission_id", id).select("submission_id").single(), "hide");
    }
  }

  await take(users.a.id, "lesson-a", 1, "done");
  await take(users.a.id, "lesson-hidden", 2, "hidden");
  await take(users.a.id, "lesson-failed", 3, "failed");
  await take(users.b.id, "lesson-b", 4, "done");
  await take(users.e.id, "lesson-e", 5, "done");

  writeFileSync(OUT, JSON.stringify(st, null, 2));
  console.log(JSON.stringify({ seeded: true, tag, logins: Object.fromEntries(Object.entries(users).map(([k, u]) => [k, `${u.email}:${PASSWORD}`])), out: OUT }));
}

type Person = { cookie: string };
async function signIn(email: string): Promise<Person> {
  const jar = new Map<string, string>();
  const ssr = createServerClient(URL_, ANON, {
    cookies: {
      getAll: () => [...jar].map(([n, v]) => ({ name: n, value: v })),
      setAll: (cs) => cs.forEach((c) => jar.set(c.name, c.value)),
    },
  });
  const { error } = await ssr.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return { cookie: [...jar].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ") };
}

async function page(base: string, who: Person | null, path: string) {
  const res = await fetch(`${base}${path}`, { headers: who ? { cookie: who.cookie } : {}, redirect: "manual" });
  return { status: res.status, html: await res.text() };
}

const rowsIn = (html: string) => (html.match(/data-analysis-kind="/g) ?? []).length;

async function check() {
  const base = opt("base");
  if (!base) throw new Error("--base=<origin> is required");
  const off = opt("off");
  const st = JSON.parse(readFileSync(OUT, "utf8")) as State;
  let failures = 0;
  const cell = (name: string, ok: boolean, detail = "") => {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` | ${detail}` : ""}`);
  };
  const link = (slug: string) => `/courses/${st.courseSlug}/${slug}`;

  // ── /my: the list is the caller's own finished, shown analyses ─────────
  const a = await signIn(st.users.a.email);
  const b = await signIn(st.users.b.email);
  const e = await signIn(st.users.e.email);
  const pa = await page(base, a, "/my");
  cell("A: /my lists the section with exactly one row", pa.status === 200 && pa.html.includes('data-my="ai-feedback"') && rowsIn(pa.html) === 1, `status ${pa.status}, rows ${rowsIn(pa.html)}`);
  cell("A: the row links to A's lesson (control)", pa.html.includes(`href="${link("lesson-a")}"`));
  cell("A: a hidden analysis is not listed", !pa.html.includes(link("lesson-hidden")));
  cell("A: a failed analysis is not listed", !pa.html.includes(link("lesson-failed")));
  cell("A: B's and E's takes are not listed", !pa.html.includes(link("lesson-b")) && !pa.html.includes(link("lesson-e")));
  const pb = await page(base, b, "/my");
  cell("B: lists B's own lesson (control)", pb.html.includes(`href="${link("lesson-b")}"`) && rowsIn(pb.html) === 1, `rows ${rowsIn(pb.html)}`);
  cell("B: A's and E's takes are not listed", !pb.html.includes(link("lesson-a")) && !pb.html.includes(link("lesson-e")));
  const pe = await page(base, e, "/my");
  cell("E (editor of the course): lists E's own lesson (control)", pe.html.includes(`href="${link("lesson-e")}"`) && rowsIn(pe.html) === 1, `rows ${rowsIn(pe.html)}`);
  cell("E (editor): the editor read of A's and B's takes does not leak into the list", !pe.html.includes(link("lesson-a")) && !pe.html.includes(link("lesson-b")) && !pe.html.includes(link("lesson-hidden")));
  // The editor policy really does let E read the others' rows (so the user_id filter is what stops them).
  const eDirect = await createServerClient(URL_, ANON, { cookies: { getAll: () => e.cookie.split("; ").map((c) => ({ name: c.split("=")[0], value: decodeURIComponent(c.slice(c.indexOf("=") + 1)) })), setAll: () => {} } })
    .from("voice_analyses")
    .select("submission_id");
  cell("E: control: RLS alone would show E more than E's own row", (eDirect.data?.length ?? 0) > 1, `E can read ${eDirect.data?.length} analyses directly`);
  const anon = await page(base, null, "/my");
  cell("signed out: /my redirects, no list", anon.status >= 300 && anon.status < 400 && !anon.html.includes('data-my="ai-feedback"'), `status ${anon.status}`);

  // ── /runs: the final analysis, beside the final comment ────────────────
  const f = await signIn(FIXTURE_LEARNER);
  const o = await signIn(OTHER_RUN_LEARNER);
  const run = `/runs/${FIXTURE_RUN}`;
  const rf = await page(base, f, run);
  cell("fixture learner: /runs draws the final analysis (control)", rf.status === 200 && rf.html.includes('data-analysis-state="done"') && rf.html.includes("AI feedback on your After recording"), `status ${rf.status}`);
  cell("fixture learner: the final comment is drawn beside it", rf.html.includes('data-comment-state="published"'));
  cell("fixture learner: the first take's feedback is held under the final (baseline read)", rf.html.includes("Day 1 feedback"));
  const ro = await page(base, o, run);
  cell("a learner not enrolled in the run gets 404, no analysis", ro.status === 404 && !ro.html.includes("data-analysis-state"), `status ${ro.status}`);
  const rs = await page(base, null, run);
  cell("signed out: the sign-in card, no analysis", rs.status === 200 && rs.html.includes('data-final-state="signed_out"') && !rs.html.includes("data-analysis-state"));

  // A withdrawn analysis (the author hid it) reads as withdrawn, restored afterwards.
  try {
    must(await admin.from("voice_analyses").update({ hidden_at: new Date().toISOString() }).eq("submission_id", AFTER_TAKE).select("submission_id").single(), "hide fixture");
    const rw = await page(base, f, run);
    cell("a hidden final analysis reads withdrawn, with no transcript", rw.html.includes('data-analysis-state="withdrawn"') && !rw.html.includes("Yesterday I went to my favourite place"), "");
  } finally {
    must(await admin.from("voice_analyses").update({ hidden_at: null }).eq("submission_id", AFTER_TAKE).select("submission_id").single(), "restore fixture");
  }
  const rr = await page(base, f, run);
  cell("restored: the fixture draws the final analysis again", rr.html.includes('data-analysis-state="done"'));

  // ── the mode `off` server: nothing is drawn or read ────────────────────
  if (off) {
    const offA = await page(off, a, "/my");
    cell("mode off: /my has no AI section", offA.status === 200 && !offA.html.includes('data-my="ai-feedback"'), `status ${offA.status}`);
    const offF = await page(off, f, run);
    cell("mode off: /runs draws the recordings and the comment, no AI feedback", offF.status === 200 && offF.html.includes('data-comment-state="published"') && !offF.html.includes("data-analysis-state"));
  }

  console.log(failures === 0 ? "PROG-007 PASS: /my list, /runs final analysis, and each denial" : `PROG-007 FAIL: ${failures} cell(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

async function cleanup() {
  const st = JSON.parse(readFileSync(OUT, "utf8")) as State;
  const count = async (table: string, col: string, ids: string[]) =>
    (await admin.from(table).select("*", { count: "exact", head: true }).in(col, ids)).count;
  const before = {
    submissions: await count("voice_submissions", "user_id", st.userIds),
    ledger: await count("voice_analysis_sends", "user_id", st.userIds),
    courses: await count("courses", "id", [st.courseId]),
  };
  await admin.storage.from(BUCKET).remove(st.objects);
  await admin.from("voice_analysis_sends").delete().in("user_id", st.userIds);
  await admin.from("voice_submissions").delete().in("user_id", st.userIds);
  await admin.from("courses").delete().eq("id", st.courseId);
  for (const id of st.userIds) await admin.auth.admin.deleteUser(id);
  const after = {
    submissions: await count("voice_submissions", "user_id", st.userIds),
    ledger: await count("voice_analysis_sends", "user_id", st.userIds),
    courses: await count("courses", "id", [st.courseId]),
  };
  console.log(JSON.stringify({ cleanup: true, before, after }));
}

const run = { seed, check, cleanup }[cmd as "seed" | "check" | "cleanup"];
if (!run) throw new Error("usage: seed | check --base=<origin> [--off=<origin>] | cleanup");
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
