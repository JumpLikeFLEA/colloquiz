/**
 * Import an authored lesson course file into draft `lesson_versions` rows —
 * never publishing (CNT-004). Mirrors the retired scripts/import-course.ts's
 * shape (validate-then-write, --dry-run, --adopt) for the Alliengll lesson
 * model (docs/decisions/0018 Decision 2, 0022, 0023).
 *
 * One file holds one course plus every one of its lessons:
 *
 *   authored/courses/future-imperfect.json
 *
 *   {
 *     "slug": "future-imperfect",
 *     "title": "Future Imperfect",
 *     "level": "B1",
 *     "status": "draft",
 *     "lessons": [
 *       { "slug": "section-a", "title": "Section A", "document": [ ...blocks ] },
 *       ...
 *     ]
 *   }
 *
 * MATCH KEYS (docs/decisions/0023 — there is no `authored_key` column on
 * `courses` or `lessons`, unlike the retired course schema's `questions`):
 *   - a course matches an existing row on `courses.slug`.
 *   - a lesson matches an existing row on `(course_id, lessons.slug)`
 *     (migration 043). Both are natural, importer-agnostic keys; a lesson's
 *     slug is immutable once created (0023).
 *
 * VALIDATION ORDER (acceptance: "validates with CNT-003 before any write.
 * An invalid file writes nothing"):
 *   1. zod validates the file's own shape (course/lesson metadata fields).
 *   2. Every lesson's `document` is validated with `parseLessonDocument`
 *      (lib/lessons — CNT-003 + the CNT-007 self_check/table/mark_a/mark_b
 *      extensions), the SAME function the future authoring-route save path
 *      will call, so an imported document and an editor-saved one are held
 *      to one contract.
 *   3. Lesson slugs are checked for uniqueness within the file.
 * All three run fully before anything touches the database; every failure
 * across every lesson is collected and printed together.
 *
 * EDITOR-SAVE PROTECTION (0018 "carried forward": "the `updated_by` /
 * `--adopt` protection against an import overwriting in-app edits" —
 * reinterpreted for `lesson_versions`' append-only, source-tagged design,
 * since there is no `updated_by` column here to check). For a lesson that
 * already exists, if its LATEST version has `source = 'editor'`, this
 * importer refuses to append a new `source = 'import'` version over it
 * unless `--adopt` is passed — an in-app edit is not something the JSON in
 * `authored/` should silently reclaim. Lesson METADATA (title, description,
 * estimated_minutes) has no such marker and no in-app editor yet
 * (AUTH-001), so it is always upserted from the file.
 *
 * IDEMPOTENT CONTENT (beyond key-matching): if a lesson's incoming document
 * is structurally identical to its latest version's, no new version row is
 * appended — `lesson_versions` is append-only, so re-running this importer
 * against an unchanged file must not grow the version history on every
 * invocation.
 *
 * NEVER PUBLISHES: only `lessons.published_version_id` (set by
 * `publish_lesson`, a human/editor action) makes a version live. This
 * script only ever inserts new draft `lesson_versions` rows.
 *
 * Free sample is NEVER set here — see docs/decisions/0023 Decision 2. A
 * freshly imported lesson keeps `in_free_sample`'s column default (false)
 * until an editor explicitly flags it via `set_lesson_free_sample`.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/import-lesson.ts <file> [--dry-run] [--adopt]
 *
 * --dry-run reads the current database state (to compute what WOULD change)
 *   but writes nothing.
 * --adopt overwrites a lesson whose latest version has source='editor'.
 * --env-file=.env.local is required (tsx does not load .env automatically);
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY must be set (the
 * service-role key bypasses RLS — this script runs with no user session, so
 * the authenticated-editor RPCs (`create_lesson`, `save_lesson_version`) are
 * not usable here; it writes to `courses`/`lessons`/`lesson_versions`
 * directly, the same way the retired `import-course.ts` wrote to
 * `courses`/`course_stages`/`questions` directly).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { CourseFileSchema, type CourseFile, type LessonFile } from "../lib/lessons/courseFile";
import { parseLessonDocument, type LessonDocument } from "../lib/lessons";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── CLI ─────────────────────────────────────────────────────
const filePath = process.argv.slice(2).find((a) => !a.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
// --adopt: overwrite a lesson whose latest version was saved by the editor
// (source='editor'). Without it, such a lesson is SKIPPED with a printed
// reason — the file in authored/ should not silently clobber an in-app fix.
const adopt = process.argv.includes("--adopt");

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

if (!filePath) {
  die("Usage: import-lesson.ts <file> [--dry-run] [--adopt]");
}
if (!url || !key) {
  die("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
}

// ── Load + validate (file shape, then every lesson's document) ──────────
function loadCourseFile(path: string): CourseFile {
  const raw = readFileSync(path, "utf-8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    die(`${path}: invalid JSON — ${(e as Error).message}`);
  }

  const result = CourseFileSchema.safeParse(parsed);
  if (!result.success) {
    console.error(`Validation failed in ${path}:`);
    for (const issue of result.error.issues) {
      console.error(`  [${issue.path.join(".")}] ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}

// `JSONB` does not preserve key order (Postgres may reorder or canonicalize
// object keys on write), so a plain `JSON.stringify` comparison between a
// freshly-parsed document and one round-tripped through the database would
// report a false "changed" on every unchanged re-import — sorting keys
// recursively before stringifying makes the comparison order-independent for
// objects while still order-sensitive for arrays (block/run order matters).
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)));
    }
    return val;
  });
}

function validateDocuments(course: CourseFile): Map<string, LessonDocument> {
  const documents = new Map<string, LessonDocument>();
  const errors: string[] = [];

  for (const lesson of course.lessons) {
    const result = parseLessonDocument(lesson.document);
    if (!result.ok) {
      for (const err of result.errors) {
        errors.push(`lesson "${lesson.slug}" [${err.field}]: ${err.message}`);
      }
      continue;
    }
    documents.set(lesson.slug, result.document);
  }

  if (errors.length > 0) {
    console.error(`Lesson document validation failed (${errors.length} issue(s)):`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  return documents;
}

// ── Plan: what each lesson would do, computed against current DB state ──
type LessonPlan =
  | { slug: string; action: "create"; lesson: LessonFile }
  | { slug: string; action: "update-metadata-and-append"; lesson: LessonFile; lessonId: string }
  | { slug: string; action: "update-metadata-only-unchanged-content"; lesson: LessonFile; lessonId: string }
  | { slug: string; action: "skip-editor-protected"; lesson: LessonFile; lessonId: string; reason: string };

async function run() {
  const course = loadCourseFile(filePath!);
  const documents = validateDocuments(course);

  const supabase = createClient(url!, key!);

  // 1. Resolve (not write) the course row, to compute the plan against real state.
  const { data: existingCourse, error: courseReadErr } = await supabase
    .from("courses")
    .select("id")
    .eq("slug", course.slug)
    .maybeSingle();
  if (courseReadErr) die(`course read failed: ${courseReadErr.message}`);

  const courseIsNew = !existingCourse;
  let courseId = existingCourse?.id as string | undefined;

  // 2. Resolve each lesson's existing row + latest version, to build the plan.
  const plans: LessonPlan[] = [];
  if (courseId) {
    const { data: existingLessons, error: lessonsErr } = await supabase
      .from("lessons")
      .select("id, slug")
      .eq("course_id", courseId);
    if (lessonsErr) die(`lesson read failed: ${lessonsErr.message}`);

    const lessonIdBySlug = new Map((existingLessons ?? []).map((l) => [l.slug as string, l.id as string]));

    for (const lesson of course.lessons) {
      const lessonId = lessonIdBySlug.get(lesson.slug);
      if (!lessonId) {
        plans.push({ slug: lesson.slug, action: "create", lesson });
        continue;
      }

      const { data: latestVersion, error: versionErr } = await supabase
        .from("lesson_versions")
        .select("source, document")
        .eq("lesson_id", lessonId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (versionErr) die(`version read failed for lesson "${lesson.slug}": ${versionErr.message}`);

      if (latestVersion?.source === "editor" && !adopt) {
        plans.push({
          slug: lesson.slug,
          action: "skip-editor-protected",
          lesson,
          lessonId,
          reason: `latest version was saved by the editor (source='editor'); use --adopt to overwrite`,
        });
        continue;
      }

      const unchanged =
        latestVersion != null && canonicalJson(latestVersion.document) === canonicalJson(documents.get(lesson.slug));
      plans.push({
        slug: lesson.slug,
        action: unchanged ? "update-metadata-only-unchanged-content" : "update-metadata-and-append",
        lesson,
        lessonId,
      });
    }
  } else {
    for (const lesson of course.lessons) {
      plans.push({ slug: lesson.slug, action: "create", lesson });
    }
  }

  const created = plans.filter((p) => p.action === "create").length;
  const appendedForExisting = plans.filter((p) => p.action === "update-metadata-and-append").length;
  // A new lesson also gets its first version written on create — counted
  // separately from "created" above only for the write loop's own logic,
  // but a printed "draft versions written" figure must include it, or the
  // summary would misreport a brand-new lesson as having no content at all.
  const versionsWritten = created + appendedForExisting;
  const unchanged = plans.filter((p) => p.action === "update-metadata-only-unchanged-content").length;
  const skipped = plans.filter(
    (p): p is Extract<LessonPlan, { action: "skip-editor-protected" }> => p.action === "skip-editor-protected",
  );

  console.log(
    `Course "${course.slug}" (${courseIsNew ? "new" : "existing"}): ${course.lessons.length} lesson(s) in file — ` +
      `${created} to create (each with its first draft version), ${appendedForExisting} existing lesson(s) to get a new draft version, ` +
      `${unchanged} unchanged, ${skipped.length} skipped.`,
  );
  if (skipped.length > 0) {
    console.log(`Skipped (use --adopt to overwrite):`);
    for (const p of skipped) console.log(`  ${p.slug}: ${p.reason}`);
  }

  if (dryRun) {
    console.log("Dry run — nothing written.");
    return;
  }

  // ── Write ───────────────────────────────────────────────────
  if (!courseId) {
    const { data: insertedCourse, error: insertCourseErr } = await supabase
      .from("courses")
      .insert({
        slug: course.slug,
        title: course.title,
        subtitle: course.subtitle ?? null,
        description: course.description ?? null,
        level: course.level,
        status: course.status,
      })
      .select("id")
      .single();
    if (insertCourseErr || !insertedCourse) die(`course insert failed: ${insertCourseErr?.message}`);
    courseId = insertedCourse.id as string;
  } else {
    const { error: updateCourseErr } = await supabase
      .from("courses")
      .update({
        title: course.title,
        subtitle: course.subtitle ?? null,
        description: course.description ?? null,
        level: course.level,
        status: course.status,
      })
      .eq("id", courseId);
    if (updateCourseErr) die(`course update failed: ${updateCourseErr.message}`);
  }

  for (const plan of plans) {
    const { lesson } = plan;
    let lessonId: string;

    if (plan.action === "create") {
      // ordinal: append after the current max, matching create_lesson's own
      // "next ordinal" logic (041) — this script bypasses that RPC (no user
      // session to run it as), so it re-derives the same rule directly.
      const { data: maxRow } = await supabase
        .from("lessons")
        .select("ordinal")
        .eq("course_id", courseId)
        .order("ordinal", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextOrdinal = (maxRow?.ordinal ?? 0) + 1;

      const { data: insertedLesson, error: insertLessonErr } = await supabase
        .from("lessons")
        .insert({
          course_id: courseId,
          slug: lesson.slug,
          ordinal: nextOrdinal,
          title: lesson.title,
          description: lesson.description ?? null,
          estimated_minutes: lesson.estimatedMinutes ?? null,
          // in_free_sample deliberately omitted — column DEFAULT FALSE
          // applies; see docs/decisions/0023 Decision 2.
        })
        .select("id")
        .single();
      if (insertLessonErr || !insertedLesson) {
        die(`lesson insert failed for "${lesson.slug}": ${insertLessonErr?.message}`);
      }
      lessonId = insertedLesson.id as string;
    } else {
      lessonId = plan.lessonId;
      const { error: updateLessonErr } = await supabase
        .from("lessons")
        .update({
          title: lesson.title,
          description: lesson.description ?? null,
          estimated_minutes: lesson.estimatedMinutes ?? null,
        })
        .eq("id", lessonId);
      if (updateLessonErr) die(`lesson metadata update failed for "${lesson.slug}": ${updateLessonErr.message}`);
    }

    if (plan.action === "create" || plan.action === "update-metadata-and-append") {
      const { error: versionErr } = await supabase.from("lesson_versions").insert({
        lesson_id: lessonId,
        document: documents.get(lesson.slug),
        source: "import",
      });
      if (versionErr) die(`version insert failed for "${lesson.slug}": ${versionErr.message}`);
    }
  }

  console.log(
    `Done. Course "${course.slug}" upserted; ${created} lesson(s) created, ${versionsWritten} draft version(s) written total, ` +
      `${unchanged} lesson(s) had unchanged content, ${skipped.length} lesson(s) skipped.`,
  );
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
