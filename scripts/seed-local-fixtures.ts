/**
 * PLAY-006's local verification fixtures, as a committed, idempotent script
 * rather than the throwaway psql/GoTrue-admin-API calls the card was
 * originally verified with (docs/decisions/0056). Creates one published
 * course (`play-006-smoke`) with a free, paid, draft, archived and sign-in lesson
 * plus an invalid-stored-document lesson, three real GoTrue users
 * (signed-in / entitled / editor — anon needs none), one course_entitlements
 * row and one course_editors grant.
 *
 * Also seeds a SECOND, separate course — the real `future-imperfect`
 * (slug and all, read straight from `authored/courses/future-imperfect.json`,
 * never hand-copied) with its first lesson, `true-or-false`, and its
 * drag-heavy lesson, `applied-practice` (matching + ordering + selection, 25
 * blocks), both published and in the free sample. This exists purely so
 * `scripts/budget.ts` measures realistic lessons instead of the synthetic
 * `play-006-smoke` fixture's minimal one — PLAY-012's review note: "budget
 * against realistic content, not a worst case" (docs/decisions/0057). If
 * that course is ever actually imported and published for real (OPS-010),
 * this fixture's slugs already match it, so budget.ts's routes need no
 * further change at that point.
 *
 * `scripts/budget.ts`'s `/courses/future-imperfect/true-or-false` and
 * `/courses/future-imperfect/applied-practice` route entries require this
 * seed to exist before those measurements resolve to anything but a 404 —
 * run this script first against a local stack.
 *
 * ANON-003/005/006 (attempt recording) are expected to reuse this same
 * fixture set rather than each growing their own throwaway seed — see
 * docs/decisions/0056, "What would make us revisit it".
 *
 * SAFETY: refuses to run against anything but a local Supabase URL. This
 * script uses the service-role key and would otherwise be a live-data
 * script running against the hosted project — exactly the class of mistake
 * docs/decisions/0052 exists to prevent.
 *
 * Usage: npx tsx --env-file=.env.local scripts/seed-local-fixtures.ts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";
import { countPracticeBlocks, parseLessonDocument } from "../lib/lessons";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

if (!url || !key) die("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");

let host: string;
try {
  host = new URL(url).hostname;
} catch {
  die(`NEXT_PUBLIC_SUPABASE_URL is not a valid URL: ${url}`);
}
if (host !== "localhost" && host !== "127.0.0.1") {
  die(
    `Refusing to run: NEXT_PUBLIC_SUPABASE_URL's host is "${host}", not localhost/127.0.0.1. ` +
      "This script creates real auth users and writes course/lesson rows with the service-role " +
      "key — it must only ever run against a local `supabase start` stack (docs/decisions/0052).",
  );
}

const supabase: SupabaseClient = createClient(url!, key!);

const COURSE_SLUG = "play-006-smoke";
const PASSWORD = "password123!";
const USERS = {
  signedIn: "play006-signedin@example.com",
  entitled: "play006-entitled@example.com",
  editor: "play006-editor@example.com",
  // PROG-002 (docs/decisions/0120): the learner home's fixture learner.
  learnerHome: "prog002-learner@example.com",
  // PROG-007 (docs/decisions/0191): the before/after screen fixture learner.
  finalScreen: "prog007-learner@example.com",
} as const;

const VALID_DOCUMENT = [
  { id: "p1", kind: "theory", type: "prose", text: [{ text: "Cats are animals." }] },
  {
    id: "q1",
    kind: "practice",
    type: "selection",
    payload: {
      prompt: 'Pick the correct translation of the word "cat"',
      multi: false,
      options: [
        { id: "a", text: "Cat" },
        { id: "b", text: "Dog" },
      ],
      correctOptionIds: ["a"],
      explanationRef: "r1",
      explanations: { r1: '"Cat" means "cat".' },
    },
  },
];

// CNT-012's teaser fixture (docs/decisions/0094 Decision 3): three
// whitelisted theory blocks, then a self_check (the cut: it carries a
// modelAnswer), then more theory and a practice block that must never reach
// lesson_teaser's caller either.
const SIGNIN_DOCUMENT = [
  { id: "h1", kind: "theory", type: "heading", level: 1, text: [{ text: "Teaser heading" }] },
  { id: "p1", kind: "theory", type: "prose", text: [{ text: "Teaser prose." }] },
  { id: "c1", kind: "theory", type: "callout", variant: "tip", text: [{ text: "Teaser callout." }] },
  {
    id: "s1",
    kind: "theory",
    type: "self_check",
    prompt: [{ text: "Say it aloud." }],
    response: "none",
    modelAnswer: [{ text: "SECRET-MODEL-ANSWER" }],
  },
  { id: "p2", kind: "theory", type: "prose", text: [{ text: "After the cut." }] },
  VALID_DOCUMENT[1],
];

// Deliberately not a valid lesson document (PLAY-006's "invalid stored
// document renders a visible author error, not a crash" acceptance line) —
// an unrecognized block kind, so lib/lessons/parseLessonDocument.ts rejects
// it and LessonPlayerError renders instead of LessonPlayer crashing.
const INVALID_DOCUMENT = [{ id: "bad", kind: "not-a-real-kind" }];

async function upsertUser(email: string): Promise<string> {
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (!createErr) return created.user.id;

  // Already exists — idempotent re-run. supabase-js has no getUserByEmail;
  // list and find, same as any other admin-API-only lookup.
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (listErr) throw new Error(`listUsers failed while resolving existing user ${email}: ${listErr.message}`);
  const existing = list.users.find((u) => u.email === email);
  if (!existing) throw new Error(`createUser failed for ${email} (${createErr.message}) and no existing user found`);
  return existing.id;
}

type LessonFixture = {
  slug: string;
  title: string;
  description: string;
  accessLevel: "anyone" | "signed_in" | "entitled";
  ordinal: number;
  document: unknown[] | null;
  archived: boolean;
  /** A cohort course's week (058); absent for a self-paced lesson. */
  week?: number;
};

async function upsertLessons(courseId: string, lessons: LessonFixture[]): Promise<void> {
  for (const lesson of lessons) {
    const { data: row, error: lessonErr } = await supabase
      .from("lessons")
      .upsert(
        {
          course_id: courseId,
          slug: lesson.slug,
          title: lesson.title,
          description: lesson.description,
          access_level: lesson.accessLevel,
          ordinal: lesson.ordinal,
          ...(lesson.week !== undefined ? { week: lesson.week } : {}),
          published_item_count: lesson.document ? countPracticeBlocks(lesson.document as never) : 0,
        },
        { onConflict: "course_id,slug" },
      )
      .select("id, published_version_id")
      .single();
    if (lessonErr) throw new Error(`lesson upsert failed (${lesson.slug}): ${lessonErr.message}`);

    const lessonId = row.id as string;

    // Append-only lesson_versions: only create one if this lesson has never
    // been published, so re-running this script doesn't grow the version
    // history or generate a new published_version_id on every run.
    if (lesson.document && !row.published_version_id) {
      const { data: version, error: versionErr } = await supabase
        .from("lesson_versions")
        .insert({ lesson_id: lessonId, document: lesson.document, source: "editor" })
        .select("id")
        .single();
      if (versionErr) throw new Error(`lesson_versions insert failed (${lesson.slug}): ${versionErr.message}`);

      const { error: publishErr } = await supabase
        .from("lessons")
        .update({ published_version_id: version.id, archived_at: lesson.archived ? new Date().toISOString() : null })
        .eq("id", lessonId);
      if (publishErr) throw new Error(`lesson publish update failed (${lesson.slug}): ${publishErr.message}`);
    }

    console.log(`Lesson: ${lesson.slug} -> ${lessonId}`);
  }
}

async function main() {
  console.log(`Seeding PLAY-006 fixtures against ${url} ...`);

  const signedInId = await upsertUser(USERS.signedIn);
  const entitledId = await upsertUser(USERS.entitled);
  const editorId = await upsertUser(USERS.editor);
  console.log("Users:", { signedInId, entitledId, editorId });

  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .upsert(
      {
        slug: COURSE_SLUG,
        title: "PLAY-006 smoke course",
        subtitle: "A fixture course for PLAY-006 verification",
        description: "Seeded for the PLAY-006 local full-protocol run, not real content.",
        subject: "english",
        status: "published",
        level: "A2",
        // SHELL-008: must be a URL next/image's remotePatterns actually
        // allows (the same host this script writes to), not a fake
        // "https://example.com" placeholder — a course page that tries to
        // render that 500s instead of rendering. The object itself need not
        // exist; next/image only validates the URL shape server-side, the
        // browser's own image fetch is a separate request.
        cover_image_url: `${url}/storage/v1/object/public/lesson-images/fixture-cover.png`,
        author_id: editorId,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  if (courseErr) throw new Error(`course upsert failed: ${courseErr.message}`);
  const courseId = course.id as string;
  console.log("Course:", courseId);

  const { error: editorErr } = await supabase
    .from("course_editors")
    .upsert({ course_id: courseId, user_id: editorId }, { onConflict: "course_id,user_id" });
  if (editorErr) throw new Error(`course_editors upsert failed: ${editorErr.message}`);

  const { error: entitlementErr } = await supabase
    .from("course_entitlements")
    .upsert({ user_id: entitledId, course_id: courseId, source: "grant" }, { onConflict: "user_id,course_id" });
  if (entitlementErr) throw new Error(`course_entitlements upsert failed: ${entitlementErr.message}`);

  const lessons: LessonFixture[] = [
    {
      slug: "free-lesson",
      title: "Free lesson",
      description: "The free-sample lesson.",
      accessLevel: "anyone",
      ordinal: 1,
      document: VALID_DOCUMENT,
      archived: false,
    },
    {
      slug: "paid-lesson",
      title: "Paid lesson",
      description: "A paid, not-entitled-by-default lesson.",
      accessLevel: "entitled",
      ordinal: 2,
      document: VALID_DOCUMENT,
      archived: false,
    },
    {
      slug: "draft-lesson",
      title: "Draft lesson",
      description: "Never published.",
      accessLevel: "entitled",
      ordinal: 3,
      document: null,
      archived: false,
    },
    {
      slug: "archived-lesson",
      title: "Archived lesson",
      description: "Published once, now archived.",
      accessLevel: "entitled",
      ordinal: 4,
      document: VALID_DOCUMENT,
      archived: true,
    },
    {
      slug: "broken-lesson",
      title: "Broken lesson",
      description: "Invalid stored document.",
      accessLevel: "anyone",
      ordinal: 5,
      document: INVALID_DOCUMENT,
      archived: false,
    },
    {
      slug: "signin-lesson",
      title: "Sign-in lesson",
      description: "Open to any signed-in account.",
      accessLevel: "signed_in",
      ordinal: 6,
      document: SIGNIN_DOCUMENT,
      archived: false,
    },
  ];

  await upsertLessons(courseId, lessons);

  await seedRealLessonFixture(editorId);
  await seedCohortRunFixture(editorId);
  await seedLearnerHomeFixture(await upsertUser(USERS.learnerHome));
  await seedFinalScreenFixture(await upsertUser(USERS.finalScreen));

  console.log("Done.");
}

// PLAY-012's review note: measure the budget against realistic authored
// content, not the synthetic single-item fixture above. Reads straight from
// the authored file rather than copying its content inline, so this fixture
// can never drift from what CNT-004's importer would actually write.
//
// PLAY-012 (docs/decisions/0057): also seeds `applied-practice`, the same
// file's drag-heavy lesson (matching + ordering + selection, 25 blocks) —
// `scripts/budget.ts`'s second, drag-heavy regression route. Marked in the
// free sample here too, purely so the anonymous budget crawl can read it;
// this is a local fixture, not a statement about the real course's
// entitlement once it's actually published (OPS-010).
async function seedRealLessonFixture(editorId: string): Promise<void> {
  const filePath = join(process.cwd(), "authored", "courses", "future-imperfect.json");
  const file = JSON.parse(readFileSync(filePath, "utf8")) as {
    slug: string;
    title: string;
    subtitle: string;
    description: string;
    level: string;
    lessons: Array<{ slug: string; title: string; description?: string; document: unknown[] }>;
  };
  const firstLesson = file.lessons[0];
  const dragHeavyLesson = file.lessons.find((l) => l.slug === "applied-practice");
  if (!dragHeavyLesson) {
    throw new Error(
      `authored/courses/future-imperfect.json no longer has an "applied-practice" lesson — ` +
        "scripts/budget.ts's drag-heavy route depends on this fixture.",
    );
  }

  for (const lesson of [firstLesson, dragHeavyLesson]) {
    const parsed = parseLessonDocument(lesson.document);
    if (!parsed.ok) {
      throw new Error(
        `authored/courses/future-imperfect.json's lesson ("${lesson.slug}") no longer validates: ` +
          parsed.errors.map((e) => `${e.field}: ${e.message}`).join("; "),
      );
    }
  }

  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .upsert(
      {
        slug: file.slug,
        title: file.title,
        subtitle: file.subtitle,
        description: file.description,
        subject: "english",
        status: "published",
        level: file.level,
        cover_image_url: `${url}/storage/v1/object/public/lesson-images/fixture-cover.png`,
        author_id: editorId,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  if (courseErr) throw new Error(`real-course upsert failed: ${courseErr.message}`);
  const courseId = course.id as string;
  console.log("Real course:", file.slug, "->", courseId);

  await upsertLessons(courseId, [
    {
      slug: firstLesson.slug,
      title: firstLesson.title,
      description: firstLesson.description ?? "",
      accessLevel: "anyone",
      ordinal: 1,
      document: firstLesson.document,
      archived: false,
    },
    {
      slug: dragHeavyLesson.slug,
      title: dragHeavyLesson.title,
      description: dragHeavyLesson.description ?? "",
      accessLevel: "anyone",
      ordinal: 2,
      document: dragHeavyLesson.document,
      archived: false,
    },
  ]);
}

// COH-005 (docs/decisions/0115): a cohort course with one run at a FIXED id,
// so `scripts/budget.ts` can measure `/runs/<id>` — the before/after screen,
// which a visitor reaches signed out (its sign-in card). A third course, not
// a conversion of the PLAY-006 one: 058's format guard locks a course's
// format once it has a run. The run is inserted once and never updated: 058
// derives its end from the lessons' weeks, and refuses to move a started
// run's start.
const COHORT_FIXTURE_RUN_ID = "c0050000-0000-4000-8000-00000000f1a0";

async function seedCohortRunFixture(editorId: string): Promise<void> {
  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .upsert(
      {
        slug: "coh005-fixture",
        title: "COH-005 cohort fixture",
        subtitle: "A fixture cohort course for the before/after screen",
        subject: "english",
        status: "published",
        format: "cohort",
        level: "B1",
        cover_image_url: `${url}/storage/v1/object/public/lesson-images/fixture-cover.png`,
        author_id: editorId,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  if (courseErr) throw new Error(`cohort-course upsert failed: ${courseErr.message}`);
  const courseId = course.id as string;

  const voice = (id: string, compare: "before" | "after") => ({
    id,
    kind: "task",
    type: "voice",
    prompt: [{ text: "Tell us about your favourite place." }],
    maxSeconds: 180,
    compare,
  });
  await upsertLessons(courseId, [
    {
      slug: "week-one",
      title: "Week one",
      description: "Holds the before recording.",
      accessLevel: "entitled",
      ordinal: 1,
      document: [VALID_DOCUMENT[0], voice("vb", "before")],
      archived: false,
      week: 1,
    },
    {
      slug: "week-four",
      title: "Week four",
      description: "Holds the after recording.",
      accessLevel: "entitled",
      ordinal: 2,
      document: [VALID_DOCUMENT[0], voice("va", "after")],
      archived: false,
      week: 4,
    },
  ]);

  const { error: runErr } = await supabase
    .from("course_runs")
    .upsert(
      { id: COHORT_FIXTURE_RUN_ID, course_id: courseId, title: "Fixture run", starts_at: "2026-11-02T09:00:00Z" },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (runErr) throw new Error(`cohort run insert failed: ${runErr.message}`);
  console.log("Cohort course:", courseId, "run:", COHORT_FIXTURE_RUN_ID);
}

// PROG-002 (docs/decisions/0120): a learner whose /my shows every section,
// so `scripts/budget.ts` can measure the page signed in and a browser run can
// see it: an attempt on the PLAY-006 course's free lesson, an extended
// enrolment in the COH-005 run with a call, and a published feedback on a
// voice take. The take is stored already purged (object_name NULL), so no
// storage object is needed. Fixed ids; every write is idempotent.
const LEARNER_HOME_IDS = {
  attempt: "f0020000-0000-4000-8000-0000000000a1",
  call: "f0020000-0000-4000-8000-0000000000c1",
  submission: "f0020000-0000-4000-8000-0000000000d1",
} as const;

async function publishedVersionId(courseSlug: string, lessonSlug: string): Promise<{ courseId: string; lessonId: string; versionId: string }> {
  const { data, error } = await supabase
    .from("lessons")
    .select("id, published_version_id, courses!inner(id, slug)")
    .eq("slug", lessonSlug)
    .eq("courses.slug", courseSlug)
    .single();
  if (error) throw new Error(`lesson lookup failed (${courseSlug}/${lessonSlug}): ${error.message}`);
  const course = data.courses as unknown as { id: string };
  return { courseId: course.id, lessonId: data.id as string, versionId: data.published_version_id as string };
}

async function seedLearnerHomeFixture(learnerId: string): Promise<void> {
  const free = await publishedVersionId(COURSE_SLUG, "free-lesson");
  const { error: attemptErr } = await supabase.from("lesson_attempts").upsert(
    { id: LEARNER_HOME_IDS.attempt, user_id: learnerId, lesson_version_id: free.versionId, block_id: "q1", earned: 1, possible: 1 },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (attemptErr) throw new Error(`lesson_attempts upsert failed: ${attemptErr.message}`);

  const { data: existing, error: enrolReadErr } = await supabase
    .from("run_enrolments")
    .select("id")
    .eq("run_id", COHORT_FIXTURE_RUN_ID)
    .eq("user_id", learnerId)
    .is("revoked_at", null)
    .maybeSingle();
  if (enrolReadErr) throw new Error(`run_enrolments read failed: ${enrolReadErr.message}`);
  let enrolmentId = existing?.id as string | undefined;
  if (!enrolmentId) {
    const { data: created, error: enrolErr } = await supabase
      .from("run_enrolments")
      .insert({ run_id: COHORT_FIXTURE_RUN_ID, user_id: learnerId, tier: "extended", source_ref: "seed:prog002" })
      .select("id")
      .single();
    if (enrolErr) throw new Error(`run_enrolments insert failed: ${enrolErr.message}`);
    enrolmentId = created.id as string;
  }

  const { error: callErr } = await supabase.from("run_calls").upsert(
    {
      id: LEARNER_HOME_IDS.call,
      run_id: COHORT_FIXTURE_RUN_ID,
      starts_at: "2026-11-09T18:00:00Z",
      meet_url: "https://meet.google.com/abc-defg-hij",
      title: "Week 2 speaking club",
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (callErr) throw new Error(`run_calls upsert failed: ${callErr.message}`);

  const weekOne = await publishedVersionId("coh005-fixture", "week-one");
  const { error: subErr } = await supabase.from("voice_submissions").upsert(
    {
      id: LEARNER_HOME_IDS.submission,
      enrolment_id: enrolmentId,
      user_id: learnerId,
      course_id: weekOne.courseId,
      lesson_id: weekOne.lessonId,
      block_id: "vb",
      lesson_version_id: weekOne.versionId,
      object_name: null,
      content_type: "audio/webm",
      purged_at: new Date().toISOString(),
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (subErr) throw new Error(`voice_submissions upsert failed: ${subErr.message}`);

  const { error: fbErr } = await supabase.from("voice_feedback").upsert(
    {
      submission_id: LEARNER_HOME_IDS.submission,
      body: { paragraphs: [{ runs: [{ text: "Great start! " }, { text: "Watch the past tense.", bold: true }] }] },
      published_at: new Date().toISOString(),
    },
    { onConflict: "submission_id", ignoreDuplicates: true },
  );
  if (fbErr) throw new Error(`voice_feedback upsert failed: ${fbErr.message}`);
  console.log("Learner home fixture:", USERS.learnerHome, "enrolment:", enrolmentId);
}

// PROG-007 (docs/decisions/0191): a learner whose before/after screen shows everything: a second
// run of the COH-005 course that STARTED 23 days ago (so week four is open and the "After" slot
// is readable; the first run starts in the future and stays as 0115 left it), both takes
// recorded and analysed (a first, then a final compared with it) and a published final comment.
// `scripts/budget.ts` measures `/runs/<id>` signed in as this learner with VOICE_ANALYSIS_MODE=on;
// with the mode `off` the AI feedback is not drawn and the page reads as before. Fixed ids and
// every write idempotent: nothing is written for a take whose analysis row already exists. No
// provider is called; results go in through voice_analysis_finish (097), as VOICE-014's run does.
const FINAL_SCREEN_RUN_ID = "c0050000-0000-4000-8000-00000000f1a1";
const FINAL_SCREEN_IDS = {
  before: "f0070000-0000-4000-8000-0000000000b1",
  after: "f0070000-0000-4000-8000-0000000000b2",
} as const;
const FIRST_FIXTURE_TEXT = "Yesterday I go to my favourite place with my friend. Um, I made my mind to stay there. I had a great time.";
const FINAL_FIXTURE_TEXT = "Yesterday I went to my favourite place with my friend. I made up my mind quickly and I had a great time.";

function spanOf(text: string, quote: string): { start: number; end: number } {
  const start = text.indexOf(quote);
  if (start < 0) throw new Error(`fixture: "${quote}" not in the text`);
  return { start, end: start + quote.length };
}

async function seedFinalScreenFixture(learnerId: string): Promise<void> {
  const weekOne = await publishedVersionId("coh005-fixture", "week-one");
  const weekFour = await publishedVersionId("coh005-fixture", "week-four");

  // 23 days ago: week four (day 21) is open and the run has not ended, which an enrolment insert
  // needs (058: run_ended). Taken once, on the first seed; the row is never updated afterwards, and
  // an existing enrolment stays valid once the run has ended.
  const runStart = new Date(Date.now() - 23 * 86_400_000).toISOString();
  const { error: runErr } = await supabase
    .from("course_runs")
    .upsert(
      { id: FINAL_SCREEN_RUN_ID, course_id: weekOne.courseId, title: "Fixture run (started)", starts_at: runStart },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (runErr) throw new Error(`final-screen run insert failed: ${runErr.message}`);

  const { data: existing, error: enrolReadErr } = await supabase
    .from("run_enrolments")
    .select("id")
    .eq("run_id", FINAL_SCREEN_RUN_ID)
    .eq("user_id", learnerId)
    .is("revoked_at", null)
    .maybeSingle();
  if (enrolReadErr) throw new Error(`final-screen enrolment read failed: ${enrolReadErr.message}`);
  let enrolmentId = existing?.id as string | undefined;
  if (!enrolmentId) {
    const { data: created, error: enrolErr } = await supabase
      .from("run_enrolments")
      .insert({ run_id: FINAL_SCREEN_RUN_ID, user_id: learnerId, tier: "basic", source_ref: "seed:prog007" })
      .select("id")
      .single();
    if (enrolErr) throw new Error(`final-screen enrolment insert failed: ${enrolErr.message}`);
    enrolmentId = created.id as string;
  }

  const take = async (id: string, lesson: typeof weekOne, blockId: string, text: string, result: unknown, instruction: "first" | "final", baseline: string | null) => {
    const objectName = `${lesson.courseId}/${learnerId}/${id}.webm`;
    const up = await supabase.storage
      .from("voice-recordings")
      .upload(objectName, new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]), { contentType: "audio/webm", upsert: true });
    if (up.error) throw new Error(`voice object upload failed: ${up.error.message}`);
    const { error: subErr } = await supabase.from("voice_submissions").upsert(
      {
        id,
        enrolment_id: enrolmentId,
        user_id: learnerId,
        course_id: lesson.courseId,
        lesson_id: lesson.lessonId,
        block_id: blockId,
        lesson_version_id: lesson.versionId,
        object_name: objectName,
        content_type: "audio/webm",
        size_bytes: 8,
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (subErr) throw new Error(`voice_submissions upsert failed (${blockId}): ${subErr.message}`);

    const { data: done, error: readErr } = await supabase.from("voice_analyses").select("submission_id").eq("submission_id", id).maybeSingle();
    if (readErr) throw new Error(`voice_analyses read failed: ${readErr.message}`);
    if (done) return;
    const { data: send, error: sendErr } = await supabase
      .from("voice_analysis_sends")
      .insert({ user_id: learnerId, lesson_id: lesson.lessonId, block_id: blockId, submission_id: id, slot: "enrolment" })
      .select("id")
      .single();
    if (sendErr) throw new Error(`voice_analysis_sends insert failed: ${sendErr.message}`);
    const { error: rowErr } = await supabase.from("voice_analyses").insert({ submission_id: id, send_id: send.id });
    if (rowErr) throw new Error(`voice_analyses insert failed: ${rowErr.message}`);
    const fin = await supabase.rpc("voice_analysis_finish", {
      p_submission_id: id,
      p_transcript: text,
      p_result: result,
      p_instruction: instruction,
      p_prompt_version: `${instruction}-v1`,
      p_model: "claude-sonnet-5-5",
      p_usage: {},
      p_baseline: baseline,
    });
    if (fin.error || fin.data !== true) throw new Error(`voice_analysis_finish failed: ${fin.error?.message ?? fin.data}`);
  };

  const first = {
    v: 1,
    kind: "first",
    summary: "You told a clear story about a place you like.",
    howItSounds: "Friendly, with one small pause.",
    goal: "Use the past simple two times in your next recording.",
    goalReached: null,
    nextStep: null,
    expressionsUsed: [{ expression: "make up my mind", quote: "made my mind", exact: false, span: spanOf(FIRST_FIXTURE_TEXT, "made my mind") }],
    highlights: [
      { quote: "Um,", kind: "hesitation", note: "A short pause before the idea.", span: spanOf(FIRST_FIXTURE_TEXT, "Um,") },
      { quote: "I had a great time", kind: "strength", note: "A natural phrase.", span: spanOf(FIRST_FIXTURE_TEXT, "I had a great time") },
    ],
    errors: [{ quote: "I go", category: "grammar", correction: "I went", explanation: "It happened yesterday, so use the past.", span: spanOf(FIRST_FIXTURE_TEXT, "I go") }],
    mainError: 0,
    thenNow: [],
    counts: { errors: 1, highlights: 2, hesitations: 1, expressionsUsed: 1, expressionsListed: 1, thenNow: 0 },
    coverage: { analysedSeconds: 20, truncated: false },
    dropped: { expressions: 0, highlights: 0, errors: 0, thenNow: 0 },
  };
  const final = {
    v: 1,
    kind: "final",
    summary: "Your story is clearer and your verbs are in the past.",
    howItSounds: "Smoother than the first time.",
    goal: null,
    goalReached: { status: "reached", note: "You said “went” and “had”: two past forms." },
    nextStep: "Keep telling short stories about yesterday.",
    expressionsUsed: [{ expression: "make up my mind", quote: "made up my mind", exact: true, span: spanOf(FINAL_FIXTURE_TEXT, "made up my mind") }],
    highlights: [{ quote: "I had a great time", kind: "strength", note: "The same good phrase, now with the past.", span: spanOf(FINAL_FIXTURE_TEXT, "I had a great time") }],
    errors: [],
    mainError: null,
    thenNow: [
      {
        then: "I go to my favourite place",
        now: "I went to my favourite place",
        note: "Now in the past.",
        thenSpan: spanOf(FIRST_FIXTURE_TEXT, "I go to my favourite place"),
        nowSpan: spanOf(FINAL_FIXTURE_TEXT, "I went to my favourite place"),
      },
    ],
    counts: { errors: 0, highlights: 1, hesitations: 0, expressionsUsed: 1, expressionsListed: 1, thenNow: 1 },
    coverage: { analysedSeconds: 18, truncated: false },
    dropped: { expressions: 0, highlights: 0, errors: 0, thenNow: 0 },
  };
  await take(FINAL_SCREEN_IDS.before, weekOne, "vb", FIRST_FIXTURE_TEXT, first, "first", null);
  await take(FINAL_SCREEN_IDS.after, weekFour, "va", FINAL_FIXTURE_TEXT, final, "final", FINAL_SCREEN_IDS.before);

  const { error: commentErr } = await supabase.from("run_final_comments").upsert(
    {
      enrolment_id: enrolmentId,
      user_id: learnerId,
      course_id: weekOne.courseId,
      run_id: FINAL_SCREEN_RUN_ID,
      body: { paragraphs: [{ runs: [{ text: "A big step: " }, { text: "your past tense is solid now.", bold: true }] }] },
      published_at: new Date().toISOString(),
    },
    { onConflict: "enrolment_id", ignoreDuplicates: true },
  );
  if (commentErr) throw new Error(`run_final_comments upsert failed: ${commentErr.message}`);
  console.log("Final-screen fixture:", USERS.finalScreen, "run:", FINAL_SCREEN_RUN_ID);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
