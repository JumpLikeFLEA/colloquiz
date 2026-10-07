import { alliengllCopy } from "@/lib/alliengll/copy";
import { FooterLayout } from "./FooterLayout";

/**
 * SHELL-012: the ONLY link from the English surface to /app (docs/handoff.md,
 * "Open questions" — a footer link only, no toggle, no nav entry). Rendered
 * by the root layout (as `EnglishFooterGate`'s server-rendered children, so
 * lib/alliengll/copy.ts stays out of the client bundle) on every page
 * under app/(english)/ without each page wiring it in — EXCEPT the landing
 * page, which renders its own bilingual `LandingFooter` instead (see
 * `EnglishFooterGate.tsx`). Not shared with Colloquiz — same "nothing here
 * is imported outside app/(english)/" boundary as lib/alliengll/copy.ts.
 *
 * Layout enriched 2026-09-28 to match the Claude Design landing import's
 * footer (docs/ui-decisions.md, owner overwrite of 0062's "single line"
 * clause — the "not nav" clause still holds: still one link off-surface,
 * plus the existing Privacy legal page, no new nav). Markup lives in the
 * shared `FooterLayout` so this and `LandingFooter` can't drift.
 */
export function EnglishFooter() {
  const f = alliengllCopy.footer;
  return (
    <FooterLayout
      heading={f.colloquizHeading}
      desc={f.colloquizDesc}
      privacyLabel={f.privacy}
      copyright={f.copyright}
    />
  );
}
