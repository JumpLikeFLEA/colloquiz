import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";

/**
 * The English surface's footer strings, in both languages (docs/decisions/
 * 0080). Which language a route's footer uses is `footerLangForPath`'s call
 * (lib/alliengll/surfaceLang.ts); the landing page passes its own toggle
 * state instead. The heading and copyright line are not translated, as in
 * the design import the footer came from (docs/ui-decisions.md, 2026-09-28).
 *
 * Its own small module, not part of lib/alliengll/copy.ts: `EnglishFooter`
 * also renders inside the landing's Client Component, and importing copy.ts
 * there would ship that whole object to `/` (docs/decisions/0079, "Budget").
 */
export const FOOTER_HEADING = "Colloquiz ↗";
export const FOOTER_COPYRIGHT = "© 2026 Alliengll";

export const footerCopy: Record<SurfaceLang, { desc: string; privacy: string }> = {
  ru: { desc: "Наше приложение с квизами", privacy: "Конфиденциальность" },
  en: { desc: "Our quiz app", privacy: "Privacy" },
};
