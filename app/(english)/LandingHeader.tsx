import type { ReactNode } from "react";
import Link from "next/link";
import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";
import { TAGLINE } from "@/lib/alliengll/tagline";
import { landingCopy } from "./landingCopy";
import { LanguageToggle } from "./LanguageToggle";

/**
 * Landing-page header: wordmark and tagline, "Courses", the EN/RU toggle and
 * the login link or the account pill (SHELL-027, docs/decisions/0165). It sits on
 * the paper ground, ink on grid, not on a gradient band any more. The toggle
 * is the shared `LanguageToggle` the course pages also carry (docs/decisions/
 * 0080, extending the 2026-09-28 landing exception in docs/handoff.md,
 * "Audience and language"), here on the page ground. "Alina Cher" is the
 * English surface's name (owner, 2026-10-17, docs/decisions/0161) and
 * "английский с умом" its tagline, Russian in both languages (0156 Decision
 * 11). The tagline has no oval: the owner's mockups put it on the headline's
 * "сказать" / "say" instead (SHELL-031, docs/decisions/0167, settling 0165
 * Decision 3).
 *
 * The login link carries `next=/`: that is what marks /login as the English
 * entry point, so a signup there threads the funnel source (ANON-014,
 * docs/decisions/0085).
 *
 * A signed-in learner gets `account` (the server-rendered `AccountPill`,
 * SHELL-040, docs/decisions/0252) in the login
 * link's place: /login would only bounce them back to / (proxy.ts).
 *
 * Layout (SHELL-040, docs/decisions/0252): a two-column grid on a phone, the
 * same signed in and signed out. Row 1: the wordmark and the account slot (the
 * pill, or "Log in"). Row 2: the tagline, then the toggle and "Courses". From
 * `sm` one flex row, as before: wordmark, tagline, Courses (pushed right),
 * toggle, account. The DOM order is the phone's; the `sm:order-*` classes and
 * `sm:contents` on row 2's group rebuild the row, and `sm:gap-x-1.5` plus the
 * `sm:ml-2.5` margins give the old 16px / 6px spacing. The labelled pill took
 * the room the wordmark needed in the old row 1 (measured in 0252).
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
    <header className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 sm:flex sm:gap-x-1.5">
      <span className="font-display text-lg tracking-tight text-foreground sm:order-1 sm:text-xl">{t.wordmark}</span>
      <span className="flex justify-self-end sm:order-5">
        {account ?? (
          <Link
            href="/login?next=/"
            className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand"
          >
            {t.login}
          </Link>
        )}
      </span>
      <span className="font-accent text-lg leading-none text-brand-text sm:order-2 sm:ml-2.5 sm:text-xl">
        {TAGLINE}
      </span>
      <div className="flex items-center gap-1.5 justify-self-end sm:contents">
        <span className="sm:order-4 sm:ml-2.5">
          <LanguageToggle lang={lang} label={t.languageGroupLabel} onChange={onSetLang} />
        </span>
        {/* A plain <a>, not Link: a Link to the hash already in the URL does not
            scroll (Next scrolls only when the hash changes, `onlyHashChange` in
            next/dist/client/components/segment-cache/navigation.js). */}
        <a
          href="#catalogue"
          className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand sm:order-3 sm:ml-auto"
        >
          {t.navCourses}
        </a>
      </div>
    </header>
  );
}
