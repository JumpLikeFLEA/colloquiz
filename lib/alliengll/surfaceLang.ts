/**
 * The English surface's EN/RU choice (docs/decisions/0080). The landing page
 * and the course pages share one toggle and one saved choice; everything
 * else on the surface has no toggle.
 *
 * Pure, so it is unit-tested and safe to import from a Client Component
 * (EnglishFooterGate). Reading the cookie itself (`next/headers`) stays in
 * the Server Components and the Server Action that need it.
 */

export type SurfaceLang = "ru" | "en";

/** The cookie holding the saved choice. The value still says "landing"
 * because the toggle started there (2026-09-28); renaming it would drop
 * every visitor's saved choice for no benefit. */
export const SURFACE_LANG_COOKIE = "colloquiz_landing_lang";

/** A first-time visitor with no cookie sees English (owner, 2026-09-28). */
export const DEFAULT_SURFACE_LANG: SurfaceLang = "en";

/** 1 year: "remember this visitor's choice", not a session default. */
export const SURFACE_LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The saved choice from a raw cookie value; anything unrecognised (absent,
 * tampered, a future locale) falls back to the default. */
export function parseSurfaceLang(value: string | undefined): SurfaceLang {
  return value === "ru" || value === "en" ? value : DEFAULT_SURFACE_LANG;
}

const COURSE_PAGE = /^\/courses\/[^/]+$/;

/**
 * Which language the shared footer renders in on `pathname`, or null where
 * the page renders its own footer instead (`/`, whose `LandingContent`
 * follows the landing's client-side toggle state).
 *
 *   /                       → null (LandingContent renders it)
 *   /courses/<course>       → the saved choice (the page has the toggle)
 *   anything else           → "ru" (lesson, 404 and error pages)
 */
export function footerLangForPath(pathname: string, savedLang: SurfaceLang): SurfaceLang | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === "/") return null;
  if (COURSE_PAGE.test(path)) return savedLang;
  return "ru";
}
