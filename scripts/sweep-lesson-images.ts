/**
 * AUTH-006 — read-only orphan report for the `lesson-images` storage bucket.
 *
 * docs/decisions/0037 defers deleting a replaced lesson image until the SAVE
 * that replaces it succeeds, which means an image uploaded during an edit
 * that is never saved (tab closed, navigated away, CNT-003 rejected the
 * block) becomes an orphan object: nothing references it and nothing ever
 * deletes it. That decision's own "what would make us revisit it" names
 * exactly this script as the fix, without changing the save-gated deletion
 * rule itself.
 *
 * This script only REPORTS. It never calls `.remove()` — deletion is a
 * deliberately separate, later step (AUTH-006 acceptance), so the report can
 * be sanity-checked against real data first.
 *
 * An object is "referenced" if its bucket path appears in ANY
 * `lesson_versions.document` (every version, not just the latest or the
 * published one) — a lesson's older draft versions still legitimately
 * reference the images authored into them at the time, and this script must
 * never suggest deleting something a real (if superseded) version points at.
 * Two authored shapes carry an image URL (lib/lessons/theoryBlocks.ts,
 * lib/items/matching.ts):
 *   - a theory block: { kind: "theory", type: "image", url }
 *   - a matching item's left/right content: { kind: "image", src }
 * A THIRD reference lives outside any document: `courses.cover_image_url`
 * (CNT-009, migration 047) — a course cover shares this same bucket (041's
 * "a lesson image belongs to the course" reasoning applies equally to a
 * cover), so it must be counted as referenced too or this sweep would
 * report every course's cover as an orphan the moment one is set.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/sweep-lesson-images.ts
 *
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY must be set — the
 * service-role key is needed to list every lesson_versions row regardless of
 * RLS and to list the bucket's contents (same precedent as
 * scripts/import-lesson.ts).
 */

import { createClient } from "@supabase/supabase-js";
import { LESSON_IMAGE_BUCKET, extractLessonImageUrls, lessonImagePathFromUrl } from "../lib/lessonImages";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

if (!url || !key) {
  die("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PAGE_SIZE = 500;

/** Every bucket path referenced by any lesson_versions.document, across the
 * whole table (paginated — there is no reason to assume the table fits one
 * page forever), PLUS every course's cover_image_url (CNT-009). */
async function referencedPaths(): Promise<{ paths: Set<string>; rows: number }> {
  const paths = new Set<string>();
  let rows = 0;

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("lesson_versions")
      .select("document")
      .range(from, from + PAGE_SIZE - 1);
    if (error) die(`lesson_versions read failed: ${error.message}`);
    if (!data || data.length === 0) break;

    rows += data.length;
    for (const row of data) {
      for (const imageUrl of extractLessonImageUrls((row as { document: unknown }).document)) {
        const path = lessonImagePathFromUrl(imageUrl);
        if (path) paths.add(path);
      }
    }

    if (data.length < PAGE_SIZE) break;
  }

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("courses")
      .select("cover_image_url")
      .range(from, from + PAGE_SIZE - 1);
    if (error) die(`courses read failed: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      const path = lessonImagePathFromUrl((row as { cover_image_url: string | null }).cover_image_url);
      if (path) paths.add(path);
    }

    if (data.length < PAGE_SIZE) break;
  }

  return { paths, rows };
}

/** Every object in the bucket, recursing one level (objects live at
 * "<course_id>/<uuid>.<ext>" — lib/lessonImages.ts's lessonImageObjectPath —
 * so `list("")` returns course-id "folders", never objects directly). A
 * folder entry has `id: null` (storage-js's FileObject); an object entry
 * does not. */
// Supabase Storage's own bookkeeping object, auto-created to represent an
// otherwise-empty "folder" in its flat key-value store — not an authored
// upload, so it must never appear in the report as an orphan.
const EMPTY_FOLDER_PLACEHOLDER = ".emptyFolderPlaceholder";

async function listAllObjects(): Promise<{ path: string; size: number | undefined }[]> {
  const objects: { path: string; size: number | undefined }[] = [];

  const top = await listOne("");
  for (const entry of top) {
    if (entry.id === null) {
      const inner = await listOne(entry.name);
      for (const obj of inner) {
        if (obj.id !== null && obj.name !== EMPTY_FOLDER_PLACEHOLDER) {
          objects.push({ path: `${entry.name}/${obj.name}`, size: obj.metadata?.size });
        }
      }
    } else if (entry.name !== EMPTY_FOLDER_PLACEHOLDER) {
      objects.push({ path: entry.name, size: entry.metadata?.size });
    }
  }

  return objects;
}

async function listOne(prefix: string) {
  const all: { name: string; id: string | null; metadata: { size: number } | null }[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.storage
      .from(LESSON_IMAGE_BUCKET)
      .list(prefix, { limit: PAGE_SIZE, offset });
    if (error) die(`storage list("${prefix}") failed: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return "size unknown";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function main() {
  const [{ paths: referenced, rows }, objects] = await Promise.all([referencedPaths(), listAllObjects()]);
  const orphans = objects.filter((o) => !referenced.has(o.path));

  console.log(
    `lesson_versions: ${rows} row(s) scanned, ${referenced.size} distinct image path(s) referenced.`,
  );
  console.log(`${LESSON_IMAGE_BUCKET}: ${objects.length} object(s) in the bucket.`);
  console.log(`Orphaned (in the bucket, referenced by no lesson_versions.document): ${orphans.length}`);
  for (const o of orphans) {
    console.log(`  ${o.path} (${formatBytes(o.size)})`);
  }
  console.log("\nRead-only report. No objects were deleted.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
