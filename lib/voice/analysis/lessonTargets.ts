/**
 * Where an interim analysis's course links open now (VOICE-017, docs/decisions/0229 Decision 18).
 * The stored result keeps each link's lesson ID and the number the outline gave it; the title and
 * the slug are read when the page is built, so a rename or a reorder cannot point a link at the
 * wrong lesson. A lesson that is gone, unpublished or archived has no target, and the view then
 * shows "Lesson N" with no link.
 *
 * Pure: the reads are in statusDeps.ts and studioRead.ts, which only ever ask for lessons under
 * the caller's own session. Nothing here decides access.
 */

export type LessonTarget = { title: string; href: string };
/** Keyed by lesson id. */
export type LessonTargets = Record<string, LessonTarget>;

/** The most links an interim result keeps (schema.ts MAX_COURSE_LINKS), so the most ids to look up. */
const MAX_IDS = 4;

/** The lesson ids an interim result links to, read leniently from the stored JSON. */
export function courseLinkLessonIds(result: unknown): string[] {
  if (typeof result !== "object" || result === null) return [];
  const r = result as Record<string, unknown>;
  if (r.kind !== "interim" || !Array.isArray(r.courseLinks)) return [];
  const ids: string[] = [];
  for (const l of r.courseLinks) {
    const id = typeof l === "object" && l !== null ? (l as Record<string, unknown>).lessonId : null;
    if (typeof id === "string" && id && !ids.includes(id)) ids.push(id);
    if (ids.length >= MAX_IDS) break;
  }
  return ids;
}

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

// PostgREST embeds a to-one relation as an object; tolerate a one-element array too.
function one(v: unknown): Record<string, unknown> | null {
  const o = Array.isArray(v) ? v[0] : v;
  return typeof o === "object" && o !== null ? (o as Record<string, unknown>) : null;
}

/** `lessons` rows with their course's slug. Only a published, non-archived lesson gets a target. */
export function toLessonTargets(rows: readonly unknown[]): LessonTargets {
  const out: LessonTargets = {};
  for (const raw of rows) {
    const r = one(raw);
    if (!r) continue;
    const id = str(r.id);
    const slug = str(r.slug);
    const title = str(r.title);
    const courseSlug = str(one(r.courses)?.slug);
    if (!id || !slug || !title || !courseSlug) continue;
    if (r.archived_at != null || r.published_version_id == null) continue;
    out[id] = { title, href: `/courses/${courseSlug}/${slug}` };
  }
  return out;
}

/** The rows' columns, for a `.select(...)` on `lessons`. */
export const LESSON_TARGET_COLUMNS = "id, slug, title, published_version_id, archived_at, courses(slug)";

/** The client's read of a `lessonTargets` value off the status JSON; anything else is dropped. */
export function parseLessonTargets(raw: unknown): LessonTargets {
  const out: LessonTargets = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const o = one(v);
    const title = str(o?.title);
    const href = str(o?.href);
    // A same-site path only: this text becomes a link.
    if (title && href && /^\/courses\/[^/\s]+\/[^/\s]+$/.test(href)) out[id] = { title, href };
  }
  return out;
}
