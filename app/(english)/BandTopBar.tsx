import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { alliengllCopy } from "@/lib/alliengll/copy";

/**
 * The header row inside the course and lesson pages' gradient bands
 * (docs/decisions/0079 D9): the "Alliengll" wordmark linking home, then on
 * the right an optional `toggle` (the course page's EN/RU `LanguageToggle`,
 * docs/decisions/0080; lesson pages pass none) and an optional back link
 * (to the catalogue, or to the course).
 * White-on-gradient, the same treatment as the landing's `LandingHeader`
 * (0078), but with no login link (registration is offered after a lesson,
 * never before one). A signed-in learner's `account` chip (SHELL-019,
 * docs/decisions/0086) goes last, at the far right, where the landing has
 * it too; the back link's `-mr-3` (which lines its text up with the column
 * edge) only applies when nothing follows it. With the toggle AND the chip
 * in the bar (a signed-in learner on the course page), "← All courses"
 * wrapped onto two lines at 360px, so below `sm` the back link shows only
 * its arrow there, keeping the label for screen readers. A Server Component: on the lesson page it's rendered
 * by page.tsx and handed to the client `LessonPageClient` as a node, so the
 * icon costs no client JS.
 */
export function BandTopBar({
  back,
  toggle,
  account,
}: {
  back?: { href: string; label: string };
  toggle?: ReactNode;
  account?: ReactNode;
}) {
  const crowded = Boolean(toggle && account);
  return (
    <header className="flex items-center justify-between gap-3">
      <Link
        href="/"
        className="-mx-1 rounded-md px-1 text-lg font-semibold tracking-tight text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        {alliengllCopy.wordmark}
      </Link>
      {(toggle || back || account) && (
        <div className="flex items-center gap-1.5">
          {toggle}
          {back && (
            <Link
              href={back.href}
              aria-label={crowded ? back.label : undefined}
              className={`${account ? "" : "-mr-3 "}inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-white/90 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white`}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              <span className={crowded ? "hidden sm:inline" : undefined}>{back.label}</span>
            </Link>
          )}
          {account}
        </div>
      )}
    </header>
  );
}
