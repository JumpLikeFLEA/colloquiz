/**
 * Validate an authored course file exactly the way CNT-004's importer (and,
 * until docs/decisions/0028 dropped it, CNT-005's drafting script) do —
 * `CourseFileSchema` for course/lesson metadata, then `parseLessonDocument`
 * per lesson for the document's own per-block contract (CNT-003 + CNT-007,
 * including the `convertedFrom` marker, docs/decisions/0026). The file
 * contract itself is unchanged by 0028 — only who produces the file
 * (a chat session drafting from `prompts/draft-lesson.md`, not a script)
 * changed. Run this against a chat-drafted `authored/courses/<slug>.json`
 * before handing it to `scripts/import-lesson.ts`.
 *
 * Deliberately has NO `@anthropic-ai/sdk` import, makes no network call, and
 * reads no environment variable — this is a pure, offline shape check, safe
 * to run as many times as needed while iterating on a draft in a chat
 * session, with no key required and no cost.
 *
 * Usage:
 *   npx tsx scripts/validate-course-file.ts <file>
 *
 * Prints every issue found — both `CourseFileSchema` issues (labelled by
 * lesson slug when the issue is inside a lesson, else "course") and every
 * lesson document's `parseLessonDocument` issues (labelled by lesson slug
 * and block id, exactly as `LessonParseError.field` already names them) —
 * and exits non-zero if there are any, at either level, even if the other
 * level is entirely clean. Never writes anything.
 */

import { readFileSync } from "fs";
import { CourseFileSchema } from "../lib/lessons/courseFile";
import { parseLessonDocument } from "../lib/lessons";

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const filePath = process.argv[2];
if (!filePath) {
  die("Usage: validate-course-file.ts <file>");
}

/** Best-effort lesson label for an error: the lesson's own `slug` when the
 * raw (possibly schema-invalid) JSON has one at that index, else a
 * positional fallback — mirrors `parseLessonDocument`'s own
 * `blockLabel`/"blocks[N]" fallback for the same reason: the thing being
 * labelled might itself be what's broken. */
function lessonLabel(raw: unknown, index: number): string {
  if (typeof raw === "object" && raw !== null && "lessons" in raw) {
    const lessons = (raw as { lessons: unknown }).lessons;
    if (Array.isArray(lessons)) {
      const lesson = lessons[index];
      if (typeof lesson === "object" && lesson !== null && "slug" in lesson) {
        const slug = (lesson as { slug: unknown }).slug;
        if (typeof slug === "string" && slug.length > 0) return slug;
      }
    }
  }
  return `lessons[${index}]`;
}

function run(): void {
  const text = readFileSync(filePath!, "utf-8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    die(`${filePath}: invalid JSON — ${(e as Error).message}`);
  }

  let issueCount = 0;

  // ── Course/lesson metadata (CourseFileSchema) ──────────────────────
  const fileCheck = CourseFileSchema.safeParse(parsed);
  if (!fileCheck.success) {
    for (const issue of fileCheck.error.issues) {
      issueCount++;
      const [first, second] = issue.path;
      const label = first === "lessons" && typeof second === "number" ? `lesson "${lessonLabel(parsed, second)}"` : "course";
      console.error(`${label} [${issue.path.join(".")}]: ${issue.message}`);
    }
  }

  // ── Every lesson's document (parseLessonDocument) — checked independently
  // of whether the course-file metadata is itself valid, so a metadata error
  // never hides a document error in the same file, or vice versa (same
  // reasoning as import-lesson.ts's validateDocuments()). ─────────────────
  const lessons =
    typeof parsed === "object" && parsed !== null && "lessons" in parsed && Array.isArray((parsed as { lessons: unknown }).lessons)
      ? (parsed as { lessons: unknown[] }).lessons
      : [];

  lessons.forEach((lesson, index) => {
    const label = lessonLabel(parsed, index);
    if (typeof lesson !== "object" || lesson === null || !("document" in lesson)) {
      issueCount++;
      console.error(`lesson "${label}": no "document" field`);
      return;
    }
    const result = parseLessonDocument((lesson as { document: unknown }).document);
    if (!result.ok) {
      for (const err of result.errors) {
        issueCount++;
        console.error(`lesson "${label}" [${err.field}]: ${err.message}`);
      }
    }
  });

  if (issueCount > 0) {
    console.error(`\n${issueCount} issue(s) found in ${filePath}.`);
    process.exitCode = 1;
  } else {
    console.log(`${filePath}: valid — CourseFileSchema and every lesson's document pass.`);
  }
}

run();
