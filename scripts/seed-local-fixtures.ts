/**
 * PLAY-006's local verification fixtures, as a committed, idempotent script
 * rather than the throwaway psql/GoTrue-admin-API calls the card was
 * originally verified with (docs/decisions/0056). Creates one published
 * course (`play-006-smoke`) with a free, paid, draft and archived lesson
 * plus an invalid-stored-document lesson, three real GoTrue users
 * (signed-in / entitled / editor — anon needs none), one course_entitlements
 * row and one course_editors grant.
 *
 * Also seeds a SECOND, separate course — the real `future-imperfect`
 * (slug and all, read straight from `authored/courses/future-imperfect.json`,
 * never hand-copied) with just its first lesson, `true-or-false`, published
 * and in the free sample. This exists purely so `scripts/budget.ts` measures
 * a realistic lesson instead of the synthetic `play-006-smoke` fixture's
 * minimal one — PLAY-012's review note: "budget against realistic content,
 * not a worst case" (docs/decisions/0057). If that course is ever actually
 * imported and published for real (OPS-010), this fixture's slug already
 * matches it, so budget.ts's route needs no further change at that point.
 *
 * `scripts/budget.ts`'s `/courses/future-imperfect/true-or-false` route
 * entry requires this seed to exist before that measurement resolves to
 * anything but a 404 — run this script first against a local stack.
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
  inFreeSample: boolean;
  ordinal: number;
  document: unknown[] | null;
  archived: boolean;
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
          in_free_sample: lesson.inFreeSample,
          ordinal: lesson.ordinal,
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
        cover_image_url: "https://example.com/cover.png",
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
      inFreeSample: true,
      ordinal: 1,
      document: VALID_DOCUMENT,
      archived: false,
    },
    {
      slug: "paid-lesson",
      title: "Paid lesson",
      description: "A paid, not-entitled-by-default lesson.",
      inFreeSample: false,
      ordinal: 2,
      document: VALID_DOCUMENT,
      archived: false,
    },
    {
      slug: "draft-lesson",
      title: "Draft lesson",
      description: "Never published.",
      inFreeSample: false,
      ordinal: 3,
      document: null,
      archived: false,
    },
    {
      slug: "archived-lesson",
      title: "Archived lesson",
      description: "Published once, now archived.",
      inFreeSample: false,
      ordinal: 4,
      document: VALID_DOCUMENT,
      archived: true,
    },
    {
      slug: "broken-lesson",
      title: "Broken lesson",
      description: "Invalid stored document.",
      inFreeSample: true,
      ordinal: 5,
      document: INVALID_DOCUMENT,
      archived: false,
    },
  ];

  await upsertLessons(courseId, lessons);

  await seedRealLessonFixture(editorId);

  console.log("Done.");
}

// PLAY-012's review note: measure the budget against realistic authored
// content, not the synthetic single-item fixture above. Reads straight from
// the authored file rather than copying its content inline, so this fixture
// can never drift from what CNT-004's importer would actually write.
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

  const parsed = parseLessonDocument(firstLesson.document);
  if (!parsed.ok) {
    throw new Error(
      `authored/courses/future-imperfect.json's first lesson ("${firstLesson.slug}") no longer validates: ` +
        parsed.errors.map((e) => `${e.field}: ${e.message}`).join("; "),
    );
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
        cover_image_url: "https://example.com/cover.png",
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
      inFreeSample: true,
      ordinal: 1,
      document: firstLesson.document,
      archived: false,
    },
  ]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
