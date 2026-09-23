// Lesson-image limits and path rules. Pure and dependency-free, so the
// authoring UI, any server code, and the tests can all share one definition.
//
// These MUST stay in sync with the bucket settings in migration
// 041_alliengll_schema.sql — that is where the limits are actually enforced.
// The copies here exist so the editor can state them before the picker opens
// and reject a bad file without a round trip. Modelled on lib/avatar.ts.

export const LESSON_IMAGE_BUCKET = "lesson-images";

/** 5 MB, matching the bucket's file_size_limit. Lesson diagrams/screenshots
 * run larger than a profile avatar, so the avatars limit isn't reused as-is. */
export const LESSON_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Matching the bucket's allowed_mime_types. */
export const LESSON_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** For the file input's `accept`, so the OS picker filters before we ever see a file. */
export const LESSON_IMAGE_ACCEPT = LESSON_IMAGE_MIME_TYPES.join(",");

export const LESSON_IMAGE_MAX_LABEL = "5 MB";
export const LESSON_IMAGE_TYPES_LABEL = "PNG, JPEG or WebP";

/** Stated in the UI next to the button, BEFORE the user picks a file. */
export const LESSON_IMAGE_LIMITS_HINT = `${LESSON_IMAGE_TYPES_LABEL}, up to ${LESSON_IMAGE_MAX_LABEL}`;

const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

/**
 * Returns a human-readable reason the file is unusable, or null if it is fine.
 */
export function validateLessonImageFile(file: { type: string; size: number }): string | null {
  if (!(LESSON_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return `That file is ${file.type || "an unrecognised type"}. Lesson images must be ${LESSON_IMAGE_TYPES_LABEL}.`;
  }
  if (file.size > LESSON_IMAGE_MAX_BYTES) {
    const shown = formatBytes(file.size);
    const size = shown === LESSON_IMAGE_MAX_LABEL ? `${file.size.toLocaleString()} bytes` : shown;
    return `That file is ${size}. The limit is ${LESSON_IMAGE_MAX_LABEL}.`;
  }
  if (file.size === 0) {
    return "That file is empty.";
  }
  return null;
}

/**
 * Storage object path for a new upload: "<course_id>/<uuid>.<ext>".
 *
 * The first segment is what the storage policies check (via can_edit_course),
 * so it must be the owning course's id, not the uploader's. The uuid means a
 * replacement never reuses a URL, so no CDN cache-busting is needed.
 */
export function lessonImageObjectPath(courseId: string, mimeType: string, uuid: string): string {
  return `${courseId}/${uuid}.${EXTENSION[mimeType] ?? "png"}`;
}

/**
 * The storage path inside the lesson-images bucket for a stored public URL,
 * or null if the URL is not one of ours (an author-pasted external URL, or
 * a placeholder from an LLM draft that was never uploaded here). Used to
 * queue the replaced object for deletion — see AUTH-004: deletion is
 * deferred until the lesson SAVE succeeds, not fired on upload, because an
 * unsaved edit must not delete an object a published/saved version still
 * references. Mirrors lib/avatar.ts's avatarPathFromUrl.
 */
export function lessonImagePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/${LESSON_IMAGE_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  const path = url.slice(at + marker.length).split("?")[0];
  return path.length > 0 ? decodeURIComponent(path) : null;
}

/**
 * Every image URL a raw (unparsed) lesson document actually carries, in
 * authored order — AUTH-006's orphan sweep. Two authored shapes carry one
 * (lib/lessons/theoryBlocks.ts's `ImageBlockSchema`, lib/items/matching.ts's
 * `MatchingContentSchema`):
 *   - a theory block: { kind: "theory", type: "image", url }
 *   - a matching item's left/right content: { kind: "image", src }
 * Reads a raw document, not a `parseLessonDocument` result — the sweep runs
 * over every stored `lesson_versions.document`, including malformed rows a
 * later schema change left behind, so this skips anything not shaped like a
 * recognised block instead of throwing.
 */
export function extractLessonImageUrls(document: unknown): string[] {
  if (!Array.isArray(document)) return [];
  const urls: string[] = [];

  for (const block of document) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;

    if (b.kind === "theory" && b.type === "image" && typeof b.url === "string") {
      urls.push(b.url);
      continue;
    }

    if (b.kind === "practice" && b.type === "matching") {
      const payload = b.payload as Record<string, unknown> | undefined;
      for (const side of ["left", "right"] as const) {
        const entries = payload?.[side];
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
          const content = (entry as Record<string, unknown> | undefined)?.content as
            | Record<string, unknown>
            | undefined;
          if (content?.kind === "image" && typeof content.src === "string") {
            urls.push(content.src);
          }
        }
      }
    }
  }

  return urls;
}
