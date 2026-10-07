import type { ReactNode } from "react";
import Link from "next/link";
import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import { landingCopy } from "./landingCopy";
import { LanguageToggle } from "./LanguageToggle";

/**
 * Landing-page header: wordmark, EN/RU toggle, login link. The toggle is
 * the shared `LanguageToggle` the course pages also carry (docs/decisions/
 * 0080, extending the 2026-09-28 landing exception in docs/handoff.md,
 * "Audience and language"); the login link is landing-only.
 * "Alliengll" here is a page title, not a branding decision: siteName in
 * lib/alliengll/copy.ts stays "Colloquiz" (docs/handoff.md, "Open
 * questions" — naming is still deliberately deferred).
 *
 * The login link carries `next=/`: that is what marks /login as the English
 * entry point, so a signup there threads the funnel source (ANON-014,
 * docs/decisions/0085).
 *
 * A signed-in learner gets `account` (the server-rendered `AccountMenu`,
 * SHELL-019, docs/decisions/0086) in the login link's place: /login would
 * only bounce them back to / (proxy.ts), so the link looked dead.
 *
 * Sits INSIDE the hero's brand-gradient band (docs/decisions/0078), so it is
 * white-on-gradient: translucent white surfaces (`bg-white/10`, the
 * AuthLeftPanel vocabulary) rather than the page's own card/muted tokens,
 * which would read as grey patches on indigo. The gradient is dark in both
 * themes, so these need no dark-mode variant.
 */
export function LandingHeader({
  lang,
  onSetLang,
  account,
}: {
  lang: SurfaceLang;
  onSetLang: (lang: SurfaceLang) => void;
  account: ReactNode;
}) {
  const t = landingCopy[lang];

  return (
    <header className="flex items-center justify-between gap-2">
      <span className="text-lg font-semibold tracking-tight text-white">{t.wordmark}</span>
      <div className="flex items-center gap-1.5">
        <LanguageToggle lang={lang} label={t.languageGroupLabel} onChange={onSetLang} />
        {account ?? (
          <Link
            href="/login?next=/"
            className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white"
          >
            {t.login}
          </Link>
        )}
      </div>
    </header>
  );
}
