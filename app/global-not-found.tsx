import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import { alliengllCopy } from "@/lib/alliengll/copy";
import "./globals.css";

/**
 * Global 404 — fires for a URL that matches no route in EITHER root layout
 * (docs/decisions/0046). Required because this app now has two root layouts
 * (app/(english)/, app/(colloquiz)/) with no single layout to compose a
 * shared 404 from (Next docs, not-found.md: "multiple root layouts, so
 * there's no single layout to compose a global 404 page from" — exactly this
 * case). Unlike app/global-error.tsx (an error boundary that can fire while
 * the app is mid-failure, hence inline-styled and dependency-free), a global
 * 404 is an ordinary routing outcome — the Next docs' own example imports
 * globals.css and a font — so this uses the same tokens and classes as every
 * other page rather than literal hex.
 *
 * Russian-first per this card's acceptance: the English surface is the
 * primary surface on colloquiz.app (docs/handoff.md), so an unmatched URL —
 * the most likely stray/mistyped link from a reel or a Telegram post — reads
 * in the audience's language first.
 *
 * Requires `experimental.globalNotFound: true` in next.config.ts (still
 * experimental as of Next 16 — see docs/decisions/0046's "Experimental-flag
 * risk, recorded").
 */
export const metadata: Metadata = {
  title: alliengllCopy.notFound.title,
  description: alliengllCopy.notFound.body,
};

const geistSans = Geist({ subsets: ["latin"] });

export default function GlobalNotFound() {
  return (
    <html lang="ru" className={`${geistSans.className} h-full antialiased`}>
      <body className="h-full flex items-center justify-center bg-background px-6 py-16">
        <div className="max-w-md w-full text-center flex flex-col items-center gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="text-lg font-semibold text-foreground">{alliengllCopy.notFound.title}</h1>
            <p className="text-sm text-muted-foreground">{alliengllCopy.notFound.body}</p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white hover:bg-brand-hover transition-colors text-sm font-medium"
          >
            {alliengllCopy.notFound.backHome}
          </Link>
        </div>
      </body>
    </html>
  );
}
