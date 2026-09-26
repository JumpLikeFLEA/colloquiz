import Link from "next/link";
import { alliengllCopy } from "@/lib/alliengll/copy";

/**
 * In-segment 404 — renders inside THIS root layout (fonts, globals.css,
 * dark-mode script) for a `notFound()` call from within app/(english)/ (e.g.
 * an unpublished lesson). Distinct from app/global-not-found.tsx, which
 * handles a URL that doesn't match any route at all and can't rely on any
 * layout being mounted (docs/decisions/0046).
 */
export default function EnglishNotFound() {
  return (
    <div className="min-h-svh flex items-center justify-center bg-background px-6 py-16">
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
    </div>
  );
}
