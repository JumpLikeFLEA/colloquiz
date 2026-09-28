import type { LandingLang } from "./landingCopy";
import { landingCopy } from "./landingCopy";
import { FooterLayout } from "./FooterLayout";

/**
 * The landing page's own footer — same markup as `EnglishFooter`
 * (`FooterLayout`), but reactive to the landing EN/RU toggle. The wordmark
 * ("Colloquiz ↗") and copyright line are NOT translated, matching the
 * design import: only the description and the Privacy label are templated
 * there. Rendered by `LandingContent` instead of the shared
 * `EnglishFooter` (see `EnglishFooterGate.tsx`).
 */
export function LandingFooter({ lang }: { lang: LandingLang }) {
  const t = landingCopy[lang];
  return (
    <FooterLayout
      heading="Colloquiz ↗"
      desc={t.footerDesc}
      privacyLabel={t.footerPrivacy}
      copyright="© 2026 Alliengll"
    />
  );
}
