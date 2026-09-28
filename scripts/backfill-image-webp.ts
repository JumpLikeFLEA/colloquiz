/**
 * INFRA-002 — one-time backfill: resize + convert the existing contents of
 * the `avatars` and `lesson-images` buckets to WebP, in place.
 *
 * Same-path overwrite is DELIBERATE, not the CDN-staleness gap the
 * fresh-UUID-per-upload convention (lib/avatar.ts, lib/lessonImages.ts)
 * exists to avoid: that convention guards against a stale cached response
 * showing the WRONG image after a user-initiated replace. Here the bytes
 * change but the picture doesn't — a re-encode of the same source — so a
 * stale cached response for up to the object's Cache-Control max-age (3600s,
 * the @supabase/storage-js upload default; nothing in this codebase
 * overrides it) is heavier, never wrong. In exchange this script makes NO
 * database writes: no profiles.avatar_url / lesson_versions.document
 * rewrites, no published-row mutation, no delete-after-reference ordering.
 * The object's path/filename is kept exactly as-is even once its extension
 * no longer matches its content (e.g. "cover.jpg" holding WebP bytes) —
 * changing the extension would mean a new path, which is the one thing this
 * script exists to avoid.
 *
 * Every existing object in `lesson-images` gets the THEORY max width
 * (LESSON_IMAGE_MAX_WIDTH_THEORY, 2048px) uniformly, not the tighter
 * matching-element width (400px) new uploads now get for that kind — there
 * is no `kind` recorded on a stored object, only on the authored document
 * referencing it (lib/lessonImages.ts's extractLessonImageUrls could
 * cross-reference that, but resize only ever shrinks toward a cap, so using
 * the larger, safe-for-either-kind cap here can't make a matching-tile image
 * too small; it just leaves some of them larger than a fresh upload would
 * be). Recorded in docs/decisions/0077.
 *
 * sharp is a devDependency ONLY (package.json devDependencies) — this script
 * never runs in a request path or a browser bundle, so it never needed to be
 * a runtime dependency.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-image-webp.ts [--apply]
 *
 * Default (no flag): DRY RUN. Downloads and re-encodes every object in
 * memory, prints per-object and total before/after byte sizes, writes
 * nothing to storage.
 *
 * --apply: for every object whose re-encode is smaller than the original,
 * writes the ORIGINAL bytes to .image-backfill-backup/<bucket>/<path>
 * (gitignored) before overwriting the object in the bucket. An object whose
 * re-encode is NOT smaller (rare — an already-optimized WebP source) is left
 * untouched either way.
 */

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import sharp from "sharp";
import { AVATAR_BUCKET, AVATAR_MAX_WIDTH } from "../lib/avatar";
import { LESSON_IMAGE_BUCKET, LESSON_IMAGE_MAX_WIDTH_THEORY } from "../lib/lessonImages";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const apply = process.argv.includes("--apply");

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

if (!url || !key) {
  die("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
}

const supabase = createClient(url, key);

const BACKUP_DIR = join(process.cwd(), ".image-backfill-backup");
const WEBP_QUALITY = 85;

type Bucket = { name: string; maxWidth: number };
const BUCKETS: Bucket[] = [
  { name: AVATAR_BUCKET, maxWidth: AVATAR_MAX_WIDTH },
  { name: LESSON_IMAGE_BUCKET, maxWidth: LESSON_IMAGE_MAX_WIDTH_THEORY },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** Every file path in `bucket`, walking folders (Supabase Storage `list()`
 * is one level at a time; a folder entry has `id === null`). */
async function listAllObjects(bucket: string): Promise<string[]> {
  const paths: string[] = [];

  async function walk(prefix: string): Promise<void> {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    for (const entry of data ?? []) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        await walk(path);
      } else if (entry.name !== ".emptyFolderPlaceholder") {
        // Supabase Storage's own zero-byte marker for an otherwise-empty
        // folder, not a real object — never one of ours, always skipped.
        paths.push(path);
      }
    }
  }

  await walk("");
  return paths;
}

async function processObject(
  bucket: string,
  path: string,
  maxWidth: number,
): Promise<{ before: number; after: number; wrote: boolean; reason?: string }> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`download ${bucket}/${path}: ${error?.message}`);
  const original = Buffer.from(await data.arrayBuffer());

  const meta = await sharp(original).metadata();
  const targetWidth = meta.width ? Math.min(meta.width, maxWidth) : maxWidth;

  if (meta.format === "webp" && (meta.width ?? Infinity) <= maxWidth) {
    return { before: original.length, after: original.length, wrote: false, reason: "already webp, within max width" };
  }

  const converted = await sharp(original)
    .resize({ width: targetWidth, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  if (converted.length >= original.length) {
    return { before: original.length, after: original.length, wrote: false, reason: "re-encode was not smaller" };
  }

  if (apply) {
    const backupPath = join(BACKUP_DIR, bucket, path);
    mkdirSync(dirname(backupPath), { recursive: true });
    writeFileSync(backupPath, original);

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .update(path, converted, { contentType: "image/webp", upsert: true });
    if (uploadError) throw new Error(`update ${bucket}/${path}: ${uploadError.message}`);
  }

  return { before: original.length, after: converted.length, wrote: apply };
}

async function main() {
  console.log(apply ? "APPLY: converting and overwriting objects in place." : "DRY RUN: no writes.");
  console.log();

  let grandBefore = 0;
  let grandAfter = 0;

  for (const { name: bucket, maxWidth } of BUCKETS) {
    const paths = await listAllObjects(bucket);
    console.log(`${bucket} (${paths.length} object(s), max width ${maxWidth}px):`);

    let bucketBefore = 0;
    let bucketAfter = 0;

    for (const path of paths) {
      let result: Awaited<ReturnType<typeof processObject>>;
      try {
        result = await processObject(bucket, path, maxWidth);
      } catch (e) {
        console.log(`  ${path}: ERROR — ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      bucketBefore += result.before;
      bucketAfter += result.after;
      const delta = result.before - result.after;
      const status = result.reason
        ? `skipped (${result.reason})`
        : `${formatBytes(result.before)} -> ${formatBytes(result.after)} (-${formatBytes(delta)})${apply ? "" : ", not written (dry run)"}`;
      console.log(`  ${path}: ${status}`);
    }

    console.log(
      `  ${bucket} total: ${formatBytes(bucketBefore)} -> ${formatBytes(bucketAfter)} (-${formatBytes(bucketBefore - bucketAfter)})`,
    );
    console.log();

    grandBefore += bucketBefore;
    grandAfter += bucketAfter;
  }

  console.log(`Grand total: ${formatBytes(grandBefore)} -> ${formatBytes(grandAfter)} (-${formatBytes(grandBefore - grandAfter)})`);
  if (!apply) console.log("Dry run only — re-run with --apply to write.");
}

main().catch((e) => die(e instanceof Error ? e.stack ?? e.message : String(e)));
