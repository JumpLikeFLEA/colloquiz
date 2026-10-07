/**
 * ANON-009 (docs/decisions/0081) — which course a learner signed up from,
 * read off the `next` path the signup redirect carries. Pure: it only
 * extracts a slug-shaped string. Whether that slug is a PUBLISHED course is
 * decided in SQL by record_signup_acquisition() (migration 053), never here
 * and never from a client-supplied id.
 *
 * Callers pass the path AFTER `safeNext()` (lib/safeNext.ts), but nothing
 * here depends on that: the path is resolved with the same WHATWG parser
 * against a throwaway origin, so dot segments, backslashes and `//host`
 * forms are normalised exactly as a browser would before the prefix check.
 */

/** Same shape create_course() enforces on courses.slug (044) and
 * LESSON_SLUG_RE enforces on lessons (lib/lessonSlug.ts). */
const COURSE_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const PROBE_ORIGIN = "https://acquisition.invalid";
const COURSES_PREFIX = "/courses/";

export function courseSlugFromNextPath(path: string): string | null {
  let resolved: URL;
  try {
    resolved = new URL(path, PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (resolved.origin !== PROBE_ORIGIN) return null;
  if (!resolved.pathname.startsWith(COURSES_PREFIX)) return null;

  const segment = resolved.pathname.slice(COURSES_PREFIX.length).split("/", 1)[0];
  let slug: string;
  try {
    // Once, matching how the App Router decodes `[courseSlug]` for the page
    // the learner actually saw. A malformed escape is not a course.
    slug = decodeURIComponent(segment);
  } catch {
    return null;
  }
  return COURSE_SLUG_RE.test(slug) ? slug : null;
}
