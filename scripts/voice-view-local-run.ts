/**
 * VOICE-014's local verification (docs/decisions/0189). Everything runs against the LOCAL
 * Supabase stack and refuses any other URL. It calls no AI provider: every analysis state is
 * written straight into the tables, through the service role and the 096/097 functions.
 *
 *   LOCAL_API_URL=http://127.0.0.1:54321 LOCAL_ANON_KEY=... LOCAL_SERVICE_KEY=... \
 *   npx tsx scripts/voice-view-local-run.ts seed  [--out=state.json]
 *   (start `next dev` with the same URL/keys and VOICE_ANALYSIS_MODE=on, then)
 *   ... check --base=http://localhost:3123 [--out=state.json]
 *   ... cleanup [--out=state.json]
 *
 * `seed` creates a learner, a stranger, a self-paced lesson with one voice block per state and a
 * cohort lesson, prints the logins and the two lesson paths. `check` drives the real status
 * route as each person and prints PASS/FAIL per cell, each denial beside the positive control it
 * is a denial of. `cleanup` deletes every row and object the seed made and prints the counts.
 */
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const OUT = opt("out") ?? "voice-view-state.json";

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

const must = <T>(r: { data: T; error: { message: string } | null }, what: string): NonNullable<T> => {
  if (r.error || r.data === null || r.data === undefined) throw new Error(`${what}: ${r.error?.message}`);
  return r.data as NonNullable<T>;
};

type State = {
  tag: string;
  learner: { id: string; email: string };
  stranger: { id: string; email: string };
  courseIds: string[];
  userIds: string[];
  paths: { selfPaced: string; cohort: string };
  takes: Record<string, string>; // block id -> submission id
  objects: string[];
};

// ── the words ──────────────────────────────────────────────────────────────
const FIRST_TEXT =
  "Yesterday I go to the shop with my sister. Um, I made my mind to buy a new coat. It was very <b>red</b> and I had a great time.";
const FINAL_TEXT =
  "Yesterday I went to the shop with my friend. I made up my mind quickly and I bought a blue coat. I had a great time.";
const at = (text: string, quote: string) => {
  const start = text.indexOf(quote);
  if (start < 0) throw new Error(`fixture: "${quote}" not in text`);
  return { start, end: start + quote.length };
};

function firstResult(text: string) {
  return {
    v: 1,
    kind: "first",
    summary: "You told a clear story about shopping and you kept going. Good.",
    howItSounds: "Friendly, with one small pause.",
    goal: "Use the past simple two times in your next recording.",
    goalReached: null,
    nextStep: null,
    expressionsUsed: [{ expression: "make up my mind", quote: "made my mind", exact: false, span: at(text, "made my mind") }],
    highlights: [
      { quote: "Um,", kind: "hesitation", note: "A short pause before the idea.", span: at(text, "Um,") },
      { quote: "I had a great time", kind: "strength", note: "A natural phrase.", span: at(text, "I had a great time") },
      { quote: "very <b>red</b>", kind: "self_correction", note: "You added a detail: <i>nice</i>.", span: at(text, "very <b>red</b>") },
    ],
    errors: [
      { quote: "I go", category: "grammar", correction: "I went", explanation: "It happened yesterday, so use the past.", span: at(text, "I go") },
      { quote: "made my mind", category: "collocation", correction: "made up my mind", explanation: "We say make up your mind.", span: at(text, "made my mind") },
    ],
    mainError: 0,
    thenNow: [],
    counts: { errors: 2, highlights: 3, hesitations: 1, expressionsUsed: 1, expressionsListed: 2, thenNow: 0 },
    coverage: { analysedSeconds: 41, truncated: false },
    dropped: { expressions: 0, highlights: 0, errors: 0, thenNow: 0 },
  };
}

function finalResult(text: string, firstText: string) {
  return {
    v: 1,
    kind: "final",
    summary: "Your story is clearer and your verbs are in the past.",
    howItSounds: "Smoother than the first time.",
    goal: null,
    goalReached: { status: "reached", note: "You said “went”, “bought” and “had”: three past forms." },
    nextStep: "Keep telling short stories about yesterday.",
    expressionsUsed: [{ expression: "make up my mind", quote: "made up my mind", exact: true, span: at(text, "made up my mind") }],
    highlights: [{ quote: "I had a great time", kind: "strength", note: "Same good phrase, now with the past.", span: at(text, "I had a great time") }],
    errors: [],
    mainError: null,
    thenNow: [
      { then: "I go to the shop", now: "I went to the shop", note: "Now in the past.", thenSpan: at(firstText, "I go to the shop"), nowSpan: at(text, "I went to the shop") },
    ],
    counts: { errors: 0, highlights: 1, hesitations: 0, expressionsUsed: 1, expressionsListed: 2, thenNow: 1 },
    coverage: { analysedSeconds: 38, truncated: false },
    dropped: { expressions: 0, highlights: 0, errors: 0, thenNow: 0 },
  };
}

// ── seed ───────────────────────────────────────────────────────────────────
async function newUser(label: string, tag: string) {
  const email = `v14-${label}-${tag}@verify.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  return { id: data.user.id, email };
}

const voiceBlock = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "task",
  type: "voice",
  prompt: [{ text: `Tell us about your day (${id}).` }],
  maxSeconds: 180,
  listenFor: ["make up my mind", "have a great time"],
  ...extra,
});

async function seedCourse(tag: string, format: "self_paced" | "cohort", blocks: ReturnType<typeof voiceBlock>[]) {
  const course = must(
    await admin
      .from("courses")
      .insert({ slug: `v14-${format === "cohort" ? "co" : "sp"}-${tag}`, title: `V14 ${format}`, level: "A2", status: "published", format, subtitle: "s", cover_image_url: "c" })
      .select("id")
      .single(),
    "course",
  );
  const lesson = must(
    await admin
      .from("lessons")
      .insert({
        course_id: course.id,
        ordinal: 1,
        title: "Lesson one",
        slug: "lesson-one",
        // A cohort run needs a scheduled lesson (week 1, opened by the enrolment).
        ...(format === "cohort" ? { access_level: "entitled", week: 1 } : { access_level: "anyone" }),
      })
      .select("id")
      .single(),
    "lesson",
  );
  const version = must(
    await admin.from("lesson_versions").insert({ lesson_id: lesson.id, document: blocks, source: "editor" }).select("id").single(),
    "version",
  );
  must(await admin.from("lessons").update({ published_version_id: version.id }).eq("id", lesson.id).select("id").single(), "publish");
  return { courseId: course.id as string, lessonId: lesson.id as string, versionId: version.id as string };
}

async function seed() {
  const tag = randomUUID().slice(0, 8);
  const learner = await newUser("learner", tag);
  const stranger = await newUser("stranger", tag);
  const st: State = {
    tag,
    learner,
    stranger,
    courseIds: [],
    userIds: [learner.id, stranger.id],
    paths: { selfPaced: `/courses/v14-sp-${tag}/lesson-one`, cohort: `/courses/v14-co-${tag}/lesson-one` },
    takes: {},
    objects: [],
  };

  const sp = await seedCourse(tag, "self_paced", [
    voiceBlock("a-first", { compare: "before" }),
    voiceBlock("a-final", { compare: "after" }),
    voiceBlock("b-working"),
    voiceBlock("c-failed"),
    voiceBlock("d-withdrawn"),
    voiceBlock("e-paused"),
  ]);
  const co = await seedCourse(tag, "cohort", [voiceBlock("f-limit"), voiceBlock("g-done")]);
  st.courseIds.push(sp.courseId, co.courseId);

  // A cohort run the learner is enrolled in (a started run, ends in the future).
  const run = must(
    await admin
      .from("course_runs")
      .insert({ course_id: co.courseId, title: "V14 run", starts_at: new Date(Date.now() - 86400_000).toISOString() })
      .select("id, ends_at")
      .single(),
    "run",
  );
  const enrolment = must(
    await admin.from("run_enrolments").insert({ run_id: run.id, user_id: learner.id, tier: "basic" }).select("id").single(),
    "enrolment",
  );

  async function take(courseId: string, lesson: typeof sp, blockId: string, enrolmentId: string | null) {
    const id = randomUUID();
    const objectName = `${courseId}/${learner.id}/${id}.webm`;
    const up = await admin.storage.from(BUCKET).upload(objectName, new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]), { contentType: "audio/webm" });
    if (up.error) throw new Error(`upload: ${up.error.message}`);
    st.objects.push(objectName);
    must(
      await admin
        .from("voice_submissions")
        .insert({
          id,
          enrolment_id: enrolmentId,
          user_id: learner.id,
          course_id: courseId,
          lesson_id: lesson.lessonId,
          block_id: blockId,
          lesson_version_id: lesson.versionId,
          object_name: objectName,
          content_type: "audio/webm",
          size_bytes: 8,
        })
        .select("id")
        .single(),
      `take ${blockId}`,
    );
    st.takes[blockId] = id;
    return id;
  }

  /** The ledger row (the trigger decides `analysed`), and an analysis row for it. */
  async function ledger(lesson: typeof sp, blockId: string, id: string, slot: "self_paced" | "enrolment") {
    const row = must(
      await admin
        .from("voice_analysis_sends")
        .insert({ user_id: learner.id, lesson_id: lesson.lessonId, block_id: blockId, submission_id: id, slot })
        .select("id")
        .single(),
      `ledger ${blockId}`,
    );
    return row.id as string;
  }
  async function analysisRow(id: string, sendId: string) {
    must(await admin.from("voice_analyses").insert({ submission_id: id, send_id: sendId }).select("submission_id").single(), "analysis row");
  }
  async function finish(id: string, text: string, result: unknown, instruction: "first" | "final", baseline: string | null = null) {
    const r = await admin.rpc("voice_analysis_finish", {
      p_submission_id: id,
      p_transcript: text,
      p_result: result,
      p_instruction: instruction,
      p_prompt_version: `${instruction}-v1`,
      p_model: "claude-sonnet-5-5",
      p_usage: {},
      p_baseline: baseline,
    });
    if (r.error || r.data !== true) throw new Error(`finish: ${r.error?.message ?? r.data}`);
  }

  // a-first / a-final: done, the final compared with the first.
  const a1 = await take(sp.courseId, sp, "a-first", null);
  await analysisRow(a1, await ledger(sp, "a-first", a1, "self_paced"));
  await finish(a1, FIRST_TEXT, firstResult(FIRST_TEXT), "first");
  const a2 = await take(sp.courseId, sp, "a-final", null);
  await analysisRow(a2, await ledger(sp, "a-final", a2, "self_paced"));
  await finish(a2, FINAL_TEXT, finalResult(FINAL_TEXT, FIRST_TEXT), "final", a1);

  // b-working: in progress, with a lease in the future so the route never offers it to the pipeline.
  const b = await take(sp.courseId, sp, "b-working", null);
  await analysisRow(b, await ledger(sp, "b-working", b, "self_paced"));
  must(
    await admin
      .from("voice_analyses")
      .update({ status: "analysing", lease_until: new Date(Date.now() + 3600_000).toISOString() })
      .eq("submission_id", b)
      .select("submission_id")
      .single(),
    "working",
  );

  // c-failed
  const c = await take(sp.courseId, sp, "c-failed", null);
  await analysisRow(c, await ledger(sp, "c-failed", c, "self_paced"));
  const failed = await admin.rpc("voice_analysis_fail", { p_submission_id: c, p_failure: "llm_refusal" });
  if (failed.error || failed.data !== true) throw new Error(`fail: ${failed.error?.message ?? failed.data}`);

  // d-withdrawn: done, then hidden by an author (what hide_voice_analysis writes).
  const d = await take(sp.courseId, sp, "d-withdrawn", null);
  const dSend = await ledger(sp, "d-withdrawn", d, "self_paced");
  await analysisRow(d, dSend);
  await finish(d, FIRST_TEXT, firstResult(FIRST_TEXT), "first");
  must(await admin.from("voice_analyses").update({ hidden_at: new Date().toISOString() }).eq("submission_id", d).select("submission_id").single(), "hide");
  must(await admin.from("voice_analysis_sends").update({ counted: false, uncounted_reason: "hidden", uncounted_at: new Date().toISOString() }).eq("id", dSend).select("id").single(), "ledger hide");

  // e-paused: the take stays, the pending row is gone, the send is un-counted with reason paused.
  const e = await take(sp.courseId, sp, "e-paused", null);
  const eSend = await ledger(sp, "e-paused", e, "self_paced");
  must(await admin.from("voice_analysis_sends").update({ counted: false, uncounted_reason: "paused", uncounted_at: new Date().toISOString() }).eq("id", eSend).select("id").single(), "ledger pause");

  // f-limit: a cohort send past a cap is stored with analysed = FALSE and no analysis row.
  const f = await take(co.courseId, co, "f-limit", enrolment.id as string);
  const fSend = await ledger(co, "f-limit", f, "enrolment");
  must(await admin.from("voice_analysis_sends").update({ analysed: false }).eq("id", fSend).select("id").single(), "ledger limit");

  // g-done: a cohort take with an analysis AND the author's published feedback.
  const g = await take(co.courseId, co, "g-done", enrolment.id as string);
  await analysisRow(g, await ledger(co, "g-done", g, "enrolment"));
  await finish(g, FIRST_TEXT, firstResult(FIRST_TEXT), "first");
  must(
    await admin
      .from("voice_feedback")
      .insert({ submission_id: g, body: { paragraphs: [{ runs: [{ text: "Lovely, " }, { text: "clear", bold: true }, { text: " story." }] }] }, published_at: new Date().toISOString() })
      .select("submission_id")
      .single(),
    "feedback",
  );

  writeFileSync(OUT, JSON.stringify(st, null, 2));
  console.log(JSON.stringify({ seeded: true, tag, learner: `${learner.email}:${PASSWORD}`, stranger: `${stranger.email}:${PASSWORD}`, paths: st.paths, out: OUT }));
}

// ── check ──────────────────────────────────────────────────────────────────
type Person = { cookie: string; ssr: ReturnType<typeof createServerClient> };
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
  return { ssr, cookie: [...jar].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ") };
}

async function check() {
  const base = opt("base");
  if (!base) throw new Error("--base=<origin> is required");
  const st = JSON.parse(readFileSync(OUT, "utf8")) as State;
  const learner = await signIn(st.learner.email);
  const stranger = await signIn(st.stranger.email);
  let failures = 0;
  const cell = (name: string, ok: boolean, detail = "") => {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` | ${detail}` : ""}`);
  };
  const get = async (who: Person | null, block: string) => {
    const res = await fetch(`${base}/api/voice/submissions/${st.takes[block]}/analysis`, { headers: who ? { cookie: who.cookie } : {} });
    return { http: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  // Each state, as the owner (positive controls), then as someone else.
  const done1 = await get(learner, "a-first");
  cell("owner: a-first is done with a transcript", done1.body.status === "done" && done1.body.transcript === FIRST_TEXT && done1.body.baseline === null, JSON.stringify({ status: done1.body.status, baseline: done1.body.baseline }));
  const done2 = await get(learner, "a-final");
  const bl = done2.body.baseline as { transcript?: string } | null;
  cell("owner: a-final is done and carries the first take as its baseline", done2.body.status === "done" && bl?.transcript === FIRST_TEXT);
  for (const [block, want] of [["b-working", "analysing"], ["c-failed", "failed"], ["d-withdrawn", "withdrawn"], ["e-paused", "paused"], ["f-limit", "limit"]] as const) {
    const r = await get(learner, block);
    cell(`owner: ${block} reads ${want}`, r.http === 200 && r.body.status === want, `got ${String(r.body.status)}`);
  }
  const g = await get(learner, "g-done");
  cell("owner: g-done (cohort) is done", g.body.status === "done");

  // The same takes asked by a stranger: the privileged reads must stay shut.
  for (const block of ["a-final", "d-withdrawn", "e-paused", "f-limit", "b-working"]) {
    const r = await get(stranger, block);
    cell(`stranger: ${block} reads none and leaks no transcript`, r.http === 200 && r.body.status === "none" && !("transcript" in r.body) && !("result" in r.body), `got ${String(r.body.status)}`);
  }
  const anon = await get(null, "a-final");
  cell("signed out: 401", anon.http === 401, `got ${anon.http}`);
  const bad = await fetch(`${base}/api/voice/submissions/not-a-uuid/analysis`, { headers: { cookie: learner.cookie } });
  cell("a malformed id reads none, not a 500", bad.status === 200 && ((await bad.json()) as { status?: string }).status === "none", `http ${bad.status}`);

  // Why the route needs a service-role read: the owner's own session cannot see a hidden analysis.
  const direct = await learner.ssr.from("voice_analyses").select("submission_id").eq("submission_id", st.takes["d-withdrawn"]).maybeSingle();
  const directOk = await learner.ssr.from("voice_analyses").select("submission_id").eq("submission_id", st.takes["a-first"]).maybeSingle();
  cell("RLS: the owner reads their done analysis directly (control)", directOk.data !== null);
  cell("RLS: the owner cannot read the hidden one directly", direct.data === null && !direct.error);

  // The in-progress row was not offered to the pipeline: its lease is untouched and nothing was sent.
  const w = await admin.from("voice_analyses").select("status, lease_until").eq("submission_id", st.takes["b-working"]).single();
  cell("b-working was not claimed by the poll", w.data?.status === "analysing" && w.data?.lease_until !== null);

  console.log(failures === 0 ? "VOICE-014 PASS: status route, every state and its denial" : `VOICE-014 FAIL: ${failures} cell(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

// ── cleanup ────────────────────────────────────────────────────────────────
async function cleanup() {
  const st = JSON.parse(readFileSync(OUT, "utf8")) as State;
  const count = async (table: string, col: string, ids: string[]) =>
    (await admin.from(table).select("*", { count: "exact", head: true }).in(col, ids)).count;
  const before = {
    submissions: await count("voice_submissions", "user_id", st.userIds),
    ledger: await count("voice_analysis_sends", "user_id", st.userIds),
    courses: await count("courses", "id", st.courseIds),
  };
  await admin.storage.from(BUCKET).remove(st.objects);
  await admin.from("voice_analysis_sends").delete().in("user_id", st.userIds);
  await admin.from("voice_submissions").delete().in("user_id", st.userIds);
  await admin.from("courses").delete().in("id", st.courseIds);
  for (const id of st.userIds) await admin.auth.admin.deleteUser(id);
  const after = {
    submissions: await count("voice_submissions", "user_id", st.userIds),
    ledger: await count("voice_analysis_sends", "user_id", st.userIds),
    courses: await count("courses", "id", st.courseIds),
  };
  console.log(JSON.stringify({ cleanup: true, before, after }));
}

const run = { seed, check, cleanup }[cmd as "seed" | "check" | "cleanup"];
if (!run) throw new Error("usage: seed | check --base=<origin> | cleanup");
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
