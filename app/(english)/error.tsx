"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RotateCcw } from "lucide-react";
import { alliengllCopy } from "@/lib/alliengll/copy";

/**
 * PLAY-006: this surface's first route that can throw for a real reason (an
 * invariant break in lib/publicLesson.ts, or a failed Supabase read) rather
 * than a bad URL — the not-found.tsx sibling already covers the latter.
 * Same structure as app/(colloquiz)/(main)/error.tsx (card/border tokens,
 * client component with reset()), copy from lib/alliengll/copy.ts — this
 * surface's chrome is Russian throughout (docs/handoff.md, "Audience and
 * language").
 */
export default function EnglishError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-svh flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-6 flex flex-col items-center gap-5 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive-subtle">
          <AlertCircle size={22} className="text-destructive-text" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-lg font-semibold text-foreground">{alliengllCopy.error.title}</h1>
          <p className="text-sm text-muted-foreground">{alliengllCopy.error.body}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white hover:bg-brand-hover transition-colors text-sm font-medium"
          >
            <RotateCcw size={15} />
            {alliengllCopy.error.retry}
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-foreground hover:bg-accent transition-colors text-sm font-medium"
          >
            {alliengllCopy.error.backHome}
          </Link>
        </div>
      </div>
    </main>
  );
}
