import Link from "next/link";
import type { LandingLang } from "./landingCopy";
import { landingCopy } from "./landingCopy";

/**
 * Landing-page-only header: wordmark, EN/RU toggle, login link. See the
 * 2026-09-28 landing exception in docs/handoff.md ("Audience and
 * language") — this toggle exists nowhere else on the English surface.
 * "Alliengll" here is a page title, not a branding decision: siteName in
 * lib/alliengll/copy.ts stays "Colloquiz" (docs/handoff.md, "Open
 * questions" — naming is still deliberately deferred).
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
}: {
  lang: LandingLang;
  onSetLang: (lang: LandingLang) => void;
}) {
  const t = landingCopy[lang];

  return (
    <header className="flex items-center justify-between gap-2">
      <span className="text-lg font-semibold tracking-tight text-white">{t.wordmark}</span>
      <div className="flex items-center gap-1.5">
        <div role="group" aria-label={t.languageGroupLabel} className="flex gap-0.5 rounded-lg bg-white/10 p-0.5 ring-1 ring-white/20">
          {(["en", "ru"] as const).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => onSetLang(code)}
              aria-pressed={lang === code}
              lang={code}
              className={`min-w-11 cursor-pointer rounded-md px-2.5 py-2 text-xs font-semibold tracking-wide transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white ${
                lang === code ? "bg-white text-brand-deep shadow-sm" : "text-white/75 hover:text-white"
              }`}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
        <Link
          href="/login"
          className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white"
        >
          {t.login}
        </Link>
      </div>
    </header>
  );
}
