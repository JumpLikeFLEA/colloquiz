/**
 * The English surface's EN/RU choice (docs/decisions/0080). The landing page
 * and the course pages share one toggle and one saved choice; lesson pages
 * have no toggle and their chrome is always English; everything else on the
 * surface (404, error boundary) stays Russian.
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
const LESSON_PAGE = /^\/courses\/[^/]+\/[^/]+$/;
const INVITE_PAGE = /^\/invite\/[^/]+$/;

/** The 404 and the error boundary's chrome is Russian on every path they
 * can appear on (docs/handoff.md, "Audience and language"). They render on
 * the URL that failed, so the path alone can't tell them apart from the page
 * that should have rendered there; they claim this language themselves
 * (`PageLang`, app/(english)/HtmlLang.tsx). */
export const BOUNDARY_LANG: SurfaceLang = "ru";

function trimPath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

/**
 * The language of the interface chrome on `pathname`, which is what
 * `<html lang>` must say (WCAG 2.1 SC 3.1.1; SHELL-018):
 *
 *   /                       → the saved choice (the landing has the toggle)
 *   /courses/<course>       → the saved choice (the page has the toggle)
 *   /courses/<c>/<lesson>   → "en" (lesson chrome is always English)
 *   /invite/<token>         → "en" (the claim page, COH-003, no toggle)
 *   anything else           → "ru" (404 and error pages stay Russian)
 */
export function pageLangForPath(pathname: string, savedLang: SurfaceLang): SurfaceLang {
  const path = trimPath(pathname);
  if (path === "/" || COURSE_PAGE.test(path)) return savedLang;
  if (LESSON_PAGE.test(path) || INVITE_PAGE.test(path)) return "en";
  return BOUNDARY_LANG;
}

/**
 * Which language the shared footer renders in on `pathname`: the page's own
 * language (`pageLangForPath`), or null on `/`, whose `LandingContent`
 * renders its own footer so it follows the landing's client-side toggle
 * state.
 */
export function footerLangForPath(pathname: string, savedLang: SurfaceLang): SurfaceLang | null {
  if (trimPath(pathname) === "/") return null;
  return pageLangForPath(pathname, savedLang);
}
