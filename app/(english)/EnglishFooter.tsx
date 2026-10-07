import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import { FOOTER_COPYRIGHT, FOOTER_HEADING, footerCopy } from "./footerCopy";
import { FooterLayout } from "./FooterLayout";

/**
 * SHELL-012: the ONLY link from the English surface to /app (docs/handoff.md,
 * "Open questions" — a footer link only, no toggle, no nav entry). Rendered
 * in two places:
 * - by the root layout, once per language, as server-rendered props of
 *   `EnglishFooterGate`, which picks the variant for the current route
 *   (docs/decisions/0080: the saved choice on a course page, English on
 *   a lesson, Russian elsewhere) and renders nothing on `/`;
 * - by `LandingContent` on `/`, with the landing toggle's live state.
 * Not shared with Colloquiz — same "nothing here is imported outside
 * app/(english)/" boundary as lib/alliengll/copy.ts.
 *
 * Layout enriched 2026-09-28 to match the Claude Design landing import's
 * footer (docs/ui-decisions.md, owner overwrite of 0062's "single line"
 * clause — the "not nav" clause still holds: still one link off-surface,
 * plus the existing Privacy legal page, no new nav). Markup lives in
 * `FooterLayout`.
 */
export function EnglishFooter({ lang }: { lang: SurfaceLang }) {
  const t = footerCopy[lang];
  return <FooterLayout heading={FOOTER_HEADING} desc={t.desc} privacyLabel={t.privacy} copyright={FOOTER_COPYRIGHT} />;
}
