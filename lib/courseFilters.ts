// Pure, isomorphic URL vocabulary for the course surfaces — safe to import from
// either a server or a client component. Kept out of lib/courses.ts for the same
// reason lib/historyFilters.ts is split from lib/history.ts: lib/courses.ts pulls
// in the server Supabase client (next/headers), so a client component may only
// `import type` from it. Everything here is data and pure functions.

/**
 * The three sections of a stage page, switched by `?section=`. Const-asserted so
 * the union type is derived from the single source of truth.
 */
export const COURSE_SECTIONS = ["theory", "practice", "check"] as const;

export type CourseSection = (typeof COURSE_SECTIONS)[number];

/**
 * Allow-list read of `?section=`: anything absent or unrecognized lands on
 * "theory" (a stage always opens on its reading), mirroring parseHistoryDifficulty.
 */
export function parseCourseSection(raw: string | undefined): CourseSection {
  return COURSE_SECTIONS.includes(raw as CourseSection) ? (raw as CourseSection) : "theory";
}

/**
 * Canonical URL for a stage. The default section ("theory") is omitted from the
 * query string so a plain syllabus link and a manually-reset section produce the
 * identical href (same rule as historyHref).
 */
export function stageHref(slug: string, stageKey: string, section: CourseSection = "theory"): string {
  const base = `/courses/${slug}/${stageKey}`;
  return section === "theory" ? base : `${base}?section=${section}`;
}
