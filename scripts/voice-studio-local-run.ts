/**
 * VOICE-015's local verification (docs/decisions/0190). Runs against the LOCAL Supabase stack only
 * and refuses any other URL. No AI provider is called: analyses are written straight into the
 * tables through the service role and the 096 functions.
 *
 *   LOCAL_API_URL=http://127.0.0.1:54321 LOCAL_ANON_KEY=... LOCAL_SERVICE_KEY=... \
 *   npx tsx scripts/voice-studio-local-run.ts seed  [--out=state.json]
 *   (start `next dev` against the same stack with VOICE_ANALYSIS_MODE=on, then)
 *   ... check --base=http://localhost:3123 [--out=state.json]
 *   ... cleanup [--out=state.json]
 *
 * `check` drives the real Studio pages and routes as each person. Every denial has the positive
 * control it is a denial of beside it.
 */
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const OUT = opt("out") ?? "voice-studio-state.json";

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
  users: Record<"editor" | "other" | "lapsed" | "learner", { id: string; email: string }>;
  courseIds: string[];
  titles: { sp: string; co: string; other: string };
  takes: Record<string, string>;
  objects: string[];
};

const FIRST_TEXT = "Yesterday I go to the shop with my sister. Um, I made my mind to buy a new coat. I had a great time.";
const FINAL_TEXT = "Yesterday I went to the shop with my friend. I made up my mind quickly. I had a great time.";
const at = (text: string, quote: string) => {
  const start = text.indexOf(quote);
  if (start < 0) throw new Error(`fixture: "${quote}" not in text`);
  return { start, end: start + quote.length };
};
const counts = (o: Record<string, number>) => ({ errors: 0, highlights: 0, hesitations: 0, expressionsUsed: 0, expressionsListed: 2, thenNow: 0, ...o });
const dropped = { expressions: 0, highlights: 0, errors: 0, thenNow: 0 };

const firstResult = (text: string) => ({
  v: 1,
  kind: "first",
  summary: "A clear story about shopping.",
  howItSounds: "Friendly.",
  goal: "Use the past simple two times.",
  goalReached: null,
  nextStep: null,
  expressionsUsed: [],
  highlights: [{ quote: "Um,", kind: "hesitation", note: "A short pause.", span: at(text, "Um,") }],
  errors: [{ quote: "I go", category: "grammar", correction: "I went", explanation: "It was yesterday.", span: at(text, "I go") }],
  mainError: 0,
  thenNow: [],
  counts: counts({ errors: 1, highlights: 1, hesitations: 1 }),
  coverage: { analysedSeconds: 30, truncated: false },
  dropped,
});

const finalResult = (text: string, firstText: string) => ({
  v: 1,
  kind: "final",
  summary: "Your verbs are in the past.",
  howItSounds: "Smoother.",
  goal: null,
  goalReached: { status: "reached", note: "You said went and had." },
  nextStep: "Keep telling stories about yesterday.",
  expressionsUsed: [],
  highlights: [],
  errors: [],
  mainError: null,
  thenNow: [{ then: "I go to the shop", now: "I went to the shop", note: "Now in the past.", thenSpan: at(firstText, "I go to the shop"), nowSpan: at(text, "I went to the shop") }],
  counts: counts({ thenNow: 1 }),
  coverage: { analysedSeconds: 28, truncated: false },
  dropped,
});

async function newUser(label: string, tag: string) {
  const email = `v15-${label}-${tag}@verify.test`;
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
  listenFor: ["make up my mind"],
  ...extra,
});

async function seedCourse(slug: string, title: string, format: "self_paced" | "cohort", blocks: ReturnType<typeof voiceBlock>[]) {
  const course = must(
    await admin.from("courses").insert({ slug, title, level: "A2", status: "published", format, subtitle: "s", cover_image_url: "c" }).select("id").single(),
    "course",
  );
  const lesson = must(
    await admin
      .from("lessons")
      .insert({ course_id: course.id, ordinal: 1, title: `Lesson of ${title}`, slug: "lesson-one", ...(format === "cohort" ? { access_level: "entitled", week: 1 } : { access_level: "anyone" }) })
      .select("id")
      .single(),
    "lesson",
  );
  const version = must(await admin.from("lesson_versions").insert({ lesson_id: lesson.id, document: blocks, source: "editor" }).select("id").single(), "version");
  must(await admin.from("lessons").update({ published_version_id: version.id }).eq("id", lesson.id).select("id").single(), "publish");
  return { courseId: course.id as string, lessonId: lesson.id as string, versionId: version.id as string };
}

async function seed() {
  const tag = randomUUID().slice(0, 8);
  const users = {
    editor: await newUser("editor", tag),
    other: await newUser("other", tag),
    lapsed: await newUser("lapsed", tag),
    learner: await newUser("learner", tag),
  };
  const titles = { sp: `V15 SP ${tag}`, co: `V15 CO ${tag}`, other: `V15 OTHER ${tag}` };
  const st: State = { tag, users, courseIds: [], titles, takes: {}, objects: [] };

  const sp = await seedCourse(`v15-sp-${tag}`, titles.sp, "self_paced", [
    voiceBlock("a-first", { compare: "before" }),
    voiceBlock("a-final", { compare: "after" }),
    voiceBlock("c-failed"),
    voiceBlock("h-hide"),
  ]);
  const co = await seedCourse(`v15-co-${tag}`, titles.co, "cohort", [voiceBlock("g-wait")]);
  const ot = await seedCourse(`v15-ot-${tag}`, titles.other, "self_paced", [voiceBlock("own-b")]);
  st.courseIds.push(sp.courseId, co.courseId, ot.courseId);

  // Editors and seats. `lapsed` edits the same courses but its seat ended yesterday.
  for (const c of [sp.courseId, co.courseId]) {
    for (const u of [users.editor, users.lapsed]) must(await admin.from("course_editors").insert({ course_id: c, user_id: u.id }).select("user_id").single(), "editor");
  }
  must(await admin.from("course_editors").insert({ course_id: ot.courseId, user_id: users.other.id }).select("user_id").single(), "other editor");
  must(await admin.from("author_seats").insert({ user_id: users.editor.id, public_name: "V15 Editor" }).select("user_id").single(), "seat");
  must(await admin.from("author_seats").insert({ user_id: users.other.id, public_name: "V15 Other" }).select("user_id").single(), "seat other");
  must(await admin.from("author_seats").insert({ user_id: users.lapsed.id, public_name: "V15 Lapsed", expires_at: new Date(Date.now() - 86400_000).toISOString() }).select("user_id").single(), "seat lapsed");

  const run = must(
    await admin.from("course_runs").insert({ course_id: co.courseId, title: "V15 run", starts_at: new Date(Date.now() - 86400_000).toISOString() }).select("id").single(),
    "run",
  );
  const enrolment = must(await admin.from("run_enrolments").insert({ run_id: run.id, user_id: users.learner.id, tier: "basic" }).select("id").single(), "enrolment");

  async function take(owner: { id: string }, courseId: string, lesson: typeof sp, blockId: string, enrolmentId: string | null) {
    const id = randomUUID();
    const objectName = `${courseId}/${owner.id}/${id}.webm`;
    const up = await admin.storage.from(BUCKET).upload(objectName, new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]), { contentType: "audio/webm" });
    if (up.error) throw new Error(`upload: ${up.error.message}`);
    st.objects.push(objectName);
    must(
      await admin
        .from("voice_submissions")
        .insert({ id, enrolment_id: enrolmentId, user_id: owner.id, course_id: courseId, lesson_id: lesson.lessonId, block_id: blockId, lesson_version_id: lesson.versionId, object_name: objectName, content_type: "audio/webm", size_bytes: 8 })
        .select("id")
        .single(),
      `take ${blockId}`,
    );
    const send = must(
      await admin.from("voice_analysis_sends").insert({ user_id: owner.id, lesson_id: lesson.lessonId, block_id: blockId, submission_id: id, slot: enrolmentId ? "enrolment" : "self_paced" }).select("id").single(),
      `ledger ${blockId}`,
    );
    must(await admin.from("voice_analyses").insert({ submission_id: id, send_id: send.id }).select("submission_id").single(), "analysis row");
    st.takes[blockId] = id;
    return id;
  }
  async function finish(id: string, text: string, result: unknown, instruction: "first" | "final", baseline: string | null = null) {
    const r = await admin.rpc("voice_analysis_finish", { p_submission_id: id, p_transcript: text, p_result: result, p_instruction: instruction, p_prompt_version: `${instruction}-v1`, p_model: "claude-sonnet-5-5", p_usage: {}, p_baseline: baseline });
    if (r.error || r.data !== true) throw new Error(`finish: ${r.error?.message ?? r.data}`);
  }

  const a1 = await take(users.learner, sp.courseId, sp, "a-first", null);
  await finish(a1, FIRST_TEXT, firstResult(FIRST_TEXT), "first");
  const a2 = await take(users.learner, sp.courseId, sp, "a-final", null);
  await finish(a2, FINAL_TEXT, finalResult(FINAL_TEXT, FIRST_TEXT), "final", a1);
  const c = await take(users.learner, sp.courseId, sp, "c-failed", null);
  const failed = await admin.rpc("voice_analysis_fail", { p_submission_id: c, p_failure: "llm_refusal" });
  if (failed.error || failed.data !== true) throw new Error(`fail: ${failed.error?.message ?? failed.data}`);
  const h = await take(users.learner, sp.courseId, sp, "h-hide", null);
  await finish(h, FIRST_TEXT, firstResult(FIRST_TEXT), "first");
  const g = await take(users.learner, co.courseId, co, "g-wait", enrolment.id as string);
  await finish(g, FIRST_TEXT, firstResult(FIRST_TEXT), "first");
  // The editor's OWN practice take on a course they do not edit (the owner policy lets them read it).
  const own = await take(users.editor, ot.courseId, ot, "own-b", null);
  await finish(own, FIRST_TEXT, firstResult(FIRST_TEXT), "first");

  writeFileSync(OUT, JSON.stringify(st, null, 2));
  console.log(JSON.stringify({ seeded: true, tag, editor: `${users.editor.email}:${PASSWORD}`, out: OUT }));
}

type Person = { cookie: string; ssr: ReturnType<typeof createServerClient> };
async function signIn(email: string): Promise<Person> {
  const jar = new Map<string, string>();
  const ssr = createServerClient(URL_, ANON, {
    cookies: { getAll: () => [...jar].map(([n, v]) => ({ name: n, value: v })), setAll: (cs) => cs.forEach((c) => jar.set(c.name, c.value)) },
  });
  const { error } = await ssr.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return { ssr, cookie: [...jar].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ") };
}

async function check() {
  const base = opt("base");
  if (!base) throw new Error("--base=<origin> is required");
  const st = JSON.parse(readFileSync(OUT, "utf8")) as State;
  const [editor, other, lapsed, learner] = await Promise.all([st.users.editor, st.users.other, st.users.lapsed, st.users.learner].map((u) => signIn(u.email)));
  let failures = 0;
  const cell = (name: string, ok: boolean, detail = "") => {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` | ${detail}` : ""}`);
  };
  const page = async (who: Person | null, path: string) => {
    const res = await fetch(`${base}${path}`, { headers: who ? { cookie: who.cookie } : {}, redirect: "manual" });
    return { http: res.status, html: await res.text() };
  };
  const ids = (html: string) => new Set([...html.matchAll(/\/studio\/voice\/([0-9a-f-]{36})/g)].map((m) => m[1]));
  const post = async (who: Person | null, submissionId: string) => {
    const res = await fetch(`${base}/api/studio/voice/hide`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(who ? { cookie: who.cookie } : {}) },
      body: JSON.stringify({ submissionId }),
    });
    return { http: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  };
  const T = st.takes;

  // ── the list ──
  const list = await page(editor, "/studio/voice");
  const got = ids(list.html);
  cell("list: editor sees the self-paced takes on their course (control)", list.http === 200 && [T["a-first"], T["a-final"], T["c-failed"], T["h-hide"]].every((i) => got.has(i)), `${got.size} rows`);
  cell("list: editor sees the cohort take (control)", got.has(T["g-wait"]));
  cell("list: editor does NOT see their own take on a course they do not edit", !got.has(T["own-b"]));
  cell("list: shows the learner's email and the state words", list.html.includes(st.users.learner.email) && list.html.includes("Failed") && list.html.includes("Self-paced") && list.html.includes("Cohort"));
  const otherList = ids((await page(other, "/studio/voice")).html);
  cell("list: the other editor sees the editor's take on THEIR course (control)", otherList.has(T["own-b"]));
  cell("list: the other editor sees none of the first editor's courses' takes", ![T["a-first"], T["a-final"], T["g-wait"]].some((i) => otherList.has(i)));
  const coId = (await admin.from("voice_submissions").select("course_id").eq("id", T["g-wait"]).single()).data!.course_id as string;
  const filtered = ids((await page(editor, `/studio/voice?course=${coId}`)).html);
  cell("list: ?course= narrows to that course", filtered.has(T["g-wait"]) && !filtered.has(T["a-first"]) && filtered.size === 1, `${filtered.size} rows`);
  const foreign = (await admin.from("voice_submissions").select("course_id").eq("id", T["own-b"]).single()).data!.course_id as string;
  cell("list: ?course= of a course the caller does not edit shows nothing", ids((await page(editor, `/studio/voice?course=${foreign}`)).html).size === 0);
  cell("list: the learner is not let into Studio", (await page(learner, "/studio/voice")).http === 404);
  const anonList = await page(null, "/studio/voice");
  cell("list: signed out does not get the list", anonList.http !== 200 && ids(anonList.html).size === 0, `http ${anonList.http}`);

  // ── the detail ──
  const d = await page(editor, `/studio/voice/${T["a-final"]}`);
  cell("detail: editor gets the page with signed audio and the learner's feedback view (control)", d.http === 200 && d.html.includes("/storage/v1/object/sign/voice-recordings") && d.html.includes("AI feedback") && d.html.includes(st.users.learner.email), `http ${d.http}`);
  cell("detail: a final shows its baseline (Day 1 feedback)", d.html.includes("Day 1 feedback"));
  cell("detail: the Hide button is offered on a finished analysis", d.html.includes("Hide this analysis") && !d.html.includes("<fieldset disabled"));
  cell("detail: the editor's own take on a course they do not edit is a 404", (await page(editor, `/studio/voice/${T["own-b"]}`)).http === 404);
  cell("detail: the other editor reads it (control)", (await page(other, `/studio/voice/${T["own-b"]}`)).http === 200);
  cell("detail: another course's editor gets 404 for this take", (await page(other, `/studio/voice/${T["a-final"]}`)).http === 404);
  cell("detail: a malformed id is a 404, not a 500", (await page(editor, "/studio/voice/not-a-uuid")).http === 404);
  const lapsedD = await page(lapsed, `/studio/voice/${T["h-hide"]}`);
  cell("detail: a lapsed seat can read it but its Hide is disabled", lapsedD.http === 200 && lapsedD.html.includes("<fieldset disabled") && lapsedD.html.includes("Hide this analysis"));
  const failedD = await page(editor, `/studio/voice/${T["c-failed"]}`);
  cell("detail: a failed analysis says so and offers no Hide", failedD.http === 200 && failedD.html.includes("failed on our side") && !failedD.html.includes("Hide this analysis"));

  // ── hide: every denial beside the control ──
  const sends = async () =>
    (await admin.from("voice_analysis_sends").select("*", { count: "exact", head: true }).eq("user_id", st.users.learner.id).eq("analysed", true).eq("counted", true)).count ?? -1;
  const before = await sends();
  const anon = await post(null, T["h-hide"]);
  cell("hide: signed out is 401", anon.http === 401, `got ${anon.http}`);
  const asLearner = await post(learner, T["h-hide"]);
  cell("hide: the learner cannot hide their own analysis (forbidden)", asLearner.http === 403, `got ${asLearner.http}`);
  const asOther = await post(other, T["h-hide"]);
  cell("hide: another course's editor is refused (forbidden)", asOther.http === 403, `got ${asOther.http}`);
  const asLapsed = await post(lapsed, T["h-hide"]);
  cell("hide: an editor with a lapsed seat is refused (seat_lapsed)", asLapsed.http === 403 && String(asLapsed.body.error).includes("author seat"), JSON.stringify(asLapsed.body));
  const stillShown = await admin.from("voice_analyses").select("hidden_at").eq("submission_id", T["h-hide"]).single();
  cell("hide: none of those changed anything", stillShown.data?.hidden_at === null && (await sends()) === before);
  const notDone = await post(editor, T["c-failed"]);
  cell("hide: a failed analysis cannot be hidden (not_done)", notDone.http === 409, `got ${notDone.http}`);
  const ok = await post(editor, T["h-hide"]);
  cell("hide: the course's editor hides a finished analysis (control)", ok.http === 200 && ok.body.ok === true, JSON.stringify(ok.body));
  const after = await sends();
  cell("hide: the send is given back (counted analyses fell by one)", after === before - 1, `${before} -> ${after}`);
  const ledger = await admin.from("voice_analysis_sends").select("counted, uncounted_reason").eq("submission_id", T["h-hide"]).single();
  cell("hide: its ledger row reads uncounted, reason hidden", ledger.data?.counted === false && ledger.data?.uncounted_reason === "hidden");
  const status = await fetch(`${base}/api/voice/submissions/${T["h-hide"]}/analysis`, { headers: { cookie: learner.cookie } });
  cell("hide: the learner's view now reads withdrawn", ((await status.json()) as { status?: string }).status === "withdrawn");
  const again = await post(editor, T["h-hide"]);
  cell("hide: hiding again is harmless", again.http === 200 && again.body.already_hidden === true);
  const hiddenD = await page(editor, `/studio/voice/${T["h-hide"]}`);
  cell("detail: the author still sees a hidden analysis, marked Withdrawn, with no Hide", hiddenD.http === 200 && hiddenD.html.includes("Withdrawn") && !hiddenD.html.includes("Hide this analysis"));
  cell("list: the hidden row reads Withdrawn", (await page(editor, "/studio/voice")).html.includes("Withdrawn"));

  // ── the queue and the inbox are unchanged: no self-paced take in them ──
  const queue = async (status: string | null) => {
    const r = await editor.ssr.rpc("review_queue", status ? { p_status: status } : {});
    if (r.error) throw new Error(r.error.message);
    return (r.data as { submission_id: string | null }[]).map((x) => x.submission_id).filter(Boolean) as string[];
  };
  const all = await queue(null);
  const waiting = await queue("waiting");
  const selfPaced = [T["a-first"], T["a-final"], T["c-failed"], T["h-hide"], T["own-b"]];
  cell("queue: the cohort take is in review_queue (control)", all.includes(T["g-wait"]));
  cell("queue: and waiting, which is what the inbox reads (control)", waiting.includes(T["g-wait"]));
  cell("queue: no self-paced take is in review_queue", !selfPaced.some((i) => all.includes(i)), `${all.length} rows`);
  cell("queue: none in the waiting list the inbox and its badge read", !selfPaced.some((i) => waiting.includes(i)));
  const reviews = await page(editor, "/studio/reviews?status=all");
  cell("review card: the cohort take shows the AI analysis beside the written feedback", reviews.http === 200 && reviews.html.includes('data-studio="card-analysis"') && reviews.html.includes("Feedback for"), `http ${reviews.http}`);
  cell("review card: only the cohort take has one", (reviews.html.match(/data-studio="card-analysis"/g) ?? []).length === 1);

  console.log(failures === 0 ? "VOICE-015 PASS: list, detail, hide and the queue boundary" : `VOICE-015 FAIL: ${failures} cell(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

async function cleanup() {
  const st = JSON.parse(readFileSync(OUT, "utf8")) as State;
  const userIds = Object.values(st.users).map((u) => u.id);
  const count = async (table: string, col: string, ids: string[]) => (await admin.from(table).select("*", { count: "exact", head: true }).in(col, ids)).count;
  const snap = async () => ({
    submissions: await count("voice_submissions", "user_id", userIds),
    ledger: await count("voice_analysis_sends", "user_id", userIds),
    seats: await count("author_seats", "user_id", userIds),
    courses: await count("courses", "id", st.courseIds),
  });
  const before = await snap();
  await admin.storage.from(BUCKET).remove(st.objects);
  await admin.from("voice_analysis_sends").delete().in("user_id", userIds);
  await admin.from("voice_submissions").delete().in("user_id", userIds);
  await admin.from("author_seats").delete().in("user_id", userIds);
  await admin.from("courses").delete().in("id", st.courseIds);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  console.log(JSON.stringify({ cleanup: true, before, after: await snap() }));
}

const run = { seed, check, cleanup }[cmd as "seed" | "check" | "cleanup"];
if (!run) throw new Error("usage: seed | check --base=<origin> | cleanup");
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
