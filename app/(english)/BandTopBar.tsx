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
 * never before one). A Server Component: on the lesson page it's rendered
 * by page.tsx and handed to the client `LessonPageClient` as a node, so the
 * icon costs no client JS.
 */
export function BandTopBar({ back, toggle }: { back?: { href: string; label: string }; toggle?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3">
      <Link
        href="/"
        className="-mx-1 rounded-md px-1 text-lg font-semibold tracking-tight text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        {alliengllCopy.wordmark}
      </Link>
      {(toggle || back) && (
        <div className="flex items-center gap-1.5">
          {toggle}
          {back && (
            <Link
              href={back.href}
              className="-mr-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white/90 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              {back.label}
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
