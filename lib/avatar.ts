// Avatar limits and path rules. Pure and dependency-free, so the client
// component, any server code, and the tests can all share one definition.
//
// These MUST stay in sync with the bucket settings in migration 022 — that is
// where the limits are actually enforced. The copies here exist so the UI can
// state them before the picker opens and reject a bad file without a round trip.

export const AVATAR_BUCKET = "avatars";

/** 2 MB, matching the bucket's file_size_limit. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** Matching the bucket's allowed_mime_types. */
export const AVATAR_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** For the file input's `accept`, so the OS picker filters before we ever see a file. */
export const AVATAR_ACCEPT = AVATAR_MIME_TYPES.join(",");

export const AVATAR_MAX_LABEL = "2 MB";
export const AVATAR_TYPES_LABEL = "PNG, JPEG or WebP";

/** Stated in the UI next to the button, BEFORE the user picks a file. */
export const AVATAR_LIMITS_HINT = `${AVATAR_TYPES_LABEL}, up to ${AVATAR_MAX_LABEL}`;

const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  // Drop a trailing ".0" so 2 MB reads as "2 MB", matching AVATAR_MAX_LABEL —
  // which is what lets validateAvatarFile notice the two would collide.
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

/**
 * Returns a human-readable reason the file is unusable, or null if it is fine.
 *
 * The message names the actual problem and the actual limit — "that file is
 * 4.7 MB; the limit is 2 MB" — because "upload failed" tells the user nothing
 * about what to do next.
 */
export function validateAvatarFile(file: { type: string; size: number }): string | null {
  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
    return `That file is ${file.type || "an unrecognised type"}. Avatars must be ${AVATAR_TYPES_LABEL}.`;
  }
  if (file.size > AVATAR_MAX_BYTES) {
    // Just over the limit rounds to the limit's own label ("that file is 2 MB,
    // the limit is 2 MB"), which reads like a bug. Fall back to exact bytes.
    const shown = formatBytes(file.size);
    const size = shown === AVATAR_MAX_LABEL ? `${file.size.toLocaleString()} bytes` : shown;
    return `That file is ${size}. The limit is ${AVATAR_MAX_LABEL}.`;
  }
  if (file.size === 0) {
    return "That file is empty.";
  }
  return null;
}

/**
 * Storage object path for a new upload: "<user_id>/<uuid>.<ext>".
 *
 * The first segment is what the storage policies check, so it must be the
 * owner's id. The uuid means a replacement never reuses a URL, which sidesteps
 * CDN caching entirely — no cache-busting query string needed.
 */
export function avatarObjectPath(userId: string, mimeType: string, uuid: string): string {
  return `${userId}/${uuid}.${EXTENSION[mimeType] ?? "png"}`;
}

/**
 * The storage path inside the avatars bucket for a stored public URL, or null
 * if the URL is not one of ours. Used to delete the previous object on replace
 * or remove, so old avatars do not accumulate in the bucket.
 */
export function avatarPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/${AVATAR_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  const path = url.slice(at + marker.length).split("?")[0];
  return path.length > 0 ? decodeURIComponent(path) : null;
}
