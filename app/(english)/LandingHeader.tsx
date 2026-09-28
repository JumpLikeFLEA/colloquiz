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
      <span className="text-lg font-semibold tracking-tight text-foreground">{t.wordmark}</span>
      <div className="flex items-center gap-1.5">
        <div role="group" aria-label="Language" className="flex gap-0.5 rounded-lg bg-muted p-0.5">
          <button
            type="button"
            onClick={() => onSetLang("en")}
            aria-pressed={lang === "en"}
            lang="en"
            className={`min-w-11 rounded-md px-2.5 py-2 text-xs font-semibold tracking-wide ${
              lang === "en"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground"
            }`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => onSetLang("ru")}
            aria-pressed={lang === "ru"}
            lang="ru"
            className={`min-w-11 rounded-md px-2.5 py-2 text-xs font-semibold tracking-wide ${
              lang === "ru"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground"
            }`}
          >
            RU
          </button>
        </div>
        <Link
          href="/login"
          className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          {t.login}
        </Link>
      </div>
    </header>
  );
}
