/**
 * The one UUID pattern (OPS-035). Every id check in app/ and lib/ imports it from here, so a
 * copy cannot drift (the old lib/courseImport/formats.ts copy had no /i flag).
 */

/** Pattern fragment, lower-case hex, for composing larger regexes (object names). */
export const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** A whole string that is one UUID, either case. Not a type guard on non-strings: use `isUuid`. */
export const UUID_RE = new RegExp(`^${UUID_PATTERN}$`, "i");

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
