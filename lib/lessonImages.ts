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

/**
 * Output max widths for the client-side resize/WebP-encode done before
 * upload (INFRA-002, lib/imageResize.ts). A theory image renders up to
 * 1024px CSS width (app/components/lesson-player/blocks/ImageBlock.tsx's
 * `sizes`), same breakpoint COVER_MAX_OUTPUT_WIDTH was derived from, so
 * doubled for DPR 2. A matching element's image renders in a 48px box
 * (MatchingContentView.tsx's `sizes="48px"`) — 400 is a generous margin over
 * that display size, not a tight fit to it.
 */
export const LESSON_IMAGE_MAX_WIDTH_THEORY = 2048;
export const LESSON_IMAGE_MAX_WIDTH_MATCHING = 400;

/** Stated in the UI next to the button, BEFORE the user picks a file. */
export const LESSON_IMAGE_LIMITS_HINT = `${LESSON_IMAGE_TYPES_LABEL}, up to ${LESSON_IMAGE_MAX_LABEL}`;

/**
 * Lesson audio (docs/decisions/0217) lives in the same bucket, so course
 * delete, duplicate and the orphan sweep handle it with the images. These
 * match the audio types migration 108 added to the bucket's
 * allowed_mime_types. MP3 and M4A/AAC only: every browser the audience uses
 * plays them. The size limit is the bucket's, shared with images.
 */
export const LESSON_AUDIO_MIME_TYPES = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac"] as const;

/** The extensions as well as the types: some systems report an MP3 as
 * "audio/mp3" or give no type at all, and the picker would hide it. */
export const LESSON_AUDIO_ACCEPT = [...LESSON_AUDIO_MIME_TYPES, ".mp3", ".m4a", ".aac"].join(",");

export const LESSON_AUDIO_TYPES_LABEL = "MP3 or M4A";

/** Stated in the UI next to the button, BEFORE the user picks a file. */
export const LESSON_AUDIO_LIMITS_HINT = `${LESSON_AUDIO_TYPES_LABEL}, up to ${LESSON_IMAGE_MAX_LABEL}`;

const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
};

const AUDIO_TYPE_BY_EXTENSION: Record<string, (typeof LESSON_AUDIO_MIME_TYPES)[number]> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
};

/**
 * The bucket MIME type to upload an audio file as, or null if it isn't MP3 or
 * M4A/AAC. A listed type is kept; "audio/mp3" (reported by some systems) and
 * an empty type fall back to the file's extension, so the upload carries a
 * type the bucket accepts.
 */
export function lessonAudioMimeType(file: { type: string; name: string }): (typeof LESSON_AUDIO_MIME_TYPES)[number] | null {
  const listed = LESSON_AUDIO_MIME_TYPES.find((type) => type === file.type);
  if (listed) return listed;
  if (file.type !== "" && file.type !== "audio/mp3") return null;
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  return AUDIO_TYPE_BY_EXTENSION[extension] ?? null;
}

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
 * Returns a human-readable reason the audio file is unusable, or null if it
 * is fine. Same limits as an image: the bucket has one size limit.
 */
export function validateLessonAudioFile(file: { type: string; name: string; size: number }): string | null {
  if (!lessonAudioMimeType(file)) {
    return `That file is ${file.type || "an unrecognised type"}. Lesson audio must be ${LESSON_AUDIO_TYPES_LABEL}.`;
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
 * Every bucket URL a raw (unparsed) lesson document actually carries, in
 * authored order — AUTH-006's orphan sweep, and the duplicate's copy plan
 * (lib/duplicateImages.ts). Three authored shapes carry one
 * (lib/lessons/theoryBlocks.ts's `ImageBlockSchema` and `AudioBlockSchema`,
 * lib/items/matching.ts's `MatchingContentSchema`):
 *   - a theory block: { kind: "theory", type: "image" | "audio", url }
 *   - a matching item's left/right content: { kind: "image", src }
 * The name predates audio (0217); a shape missing here is lost when a course
 * is duplicated (docs/decisions/0214).
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

    if (b.kind === "theory" && (b.type === "image" || b.type === "audio") && typeof b.url === "string") {
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
