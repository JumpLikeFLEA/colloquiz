import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { alliengllCopy } from "@/lib/alliengll/copy";

/**
 * The header row inside the course and lesson pages' gradient bands
 * (docs/decisions/0079 D9): the "Alina Cher" wordmark linking home, then on
 * the right an optional `toggle` (the course page's EN/RU `LanguageToggle`,
 * docs/decisions/0080; lesson pages pass none) and an optional back link
 * (to the catalogue, or to the course).
 * No login link (registration is offered after a lesson,
 * never before one). A signed-in learner's `account` chip (SHELL-019,
 * docs/decisions/0086) goes last, at the far right, where the landing has
 * it too; the back link's `-mr-3` (which lines its text up with the column
 * edge) only applies when nothing follows it.
 *
 * What yields at 360px once the chip became the labelled pill (SHELL-040,
 * docs/decisions/0252). The pill's label is never hidden. Measured: a bar
 * with the pill and a toggle or an action (the course page; the notebook)
 * does not fit on one row even with the back link removed, so below `sm`
 * that bar is two rows, in the landing header's phone grid (LandingHeader):
 * row 1 the wordmark and the pill, row 2 the back link with its label and the
 * toggle or action. DOM order is the phone's order, so focus order matches
 * what is seen; the `sm:order-*` classes rebuild the one row from `sm` up,
 * exactly as before. Every other bar with the pill (lesson, /my, /runs,
 * join, invite) stays one row, and there the back link shows only its arrow
 * below `sm`, keeping the label for screen readers. Signed-out bars are
 * unchanged. The look is the Alina Cher grid paper
 * (SHELL-028): the wordmark in the display face, ink links; the white-on-gradient
 * tone is gone (SHELL-035, docs/decisions/0196). A Server Component: on the lesson page it's rendered
 * by page.tsx and handed to the client `LessonPageClient` as a node, so the
 * icon costs no client JS.
 */
export function BandTopBar({
  back,
  toggle,
  action,
  account,
}: {
  back?: { href: string; label: string };
  toggle?: ReactNode;
  /** PROG-019: one icon control before the back link (the notebook's download). Crowds like the toggle. */
  action?: ReactNode;
  account?: ReactNode;
}) {
  const backClass =
    "min-h-11 min-w-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand";
  const wordmark = (
    <Link
      href="/"
      className="-mx-1 whitespace-nowrap rounded-md px-1 font-display text-base tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand sm:mr-auto sm:text-xl"
    >
      {alliengllCopy.wordmark}
    </Link>
  );

  // Two rows below `sm`: the pill shares the bar with a toggle or an action.
  if (account && (toggle || action)) {
    return (
      <header data-bar="stacked" className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:flex sm:gap-x-1.5">
        <span className="justify-self-start sm:order-1 sm:mr-auto">{wordmark}</span>
        <span className="justify-self-end sm:order-4">{account}</span>
        {back ? (
          <Link href={back.href} className={`-ml-3 inline-flex justify-self-start sm:order-3 sm:ml-0 ${backClass}`}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span>{back.label}</span>
          </Link>
        ) : (
          <span aria-hidden="true" />
        )}
        <span className="flex items-center gap-1.5 justify-self-end sm:order-2">
          {toggle}
          {action}
        </span>
      </header>
    );
  }

  // One row. With the pill, the back link shows only its arrow below `sm`.
  const crowded = Boolean(account);
  return (
    <header className="flex items-center justify-between gap-3">
      {wordmark}
      {(toggle || action || back || account) && (
        <div className="flex items-center gap-1.5">
          {toggle}
          {action}
          {back && (
            <Link
              href={back.href}
              aria-label={crowded ? back.label : undefined}
              className={`${account ? "" : "-mr-3 "}inline-flex ${backClass}`}
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
