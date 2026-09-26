"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RotateCcw } from "lucide-react";

/**
 * Error boundary for the authenticated app. Renders INSIDE the (main) layout,
 * so the sidebar and top bar stay in place and only the page content is
 * replaced — the user is not thrown out of the shell by one page's failure.
 * Client component with a `reset()` that re-renders the failed segment.
 *
 * No Figma source; composed from the card/border tokens and the ErrorDialog
 * copy voice, the NotificationBell precedent.
 */
export default function MainError({
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
    <div className="flex items-center justify-center py-16">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-6 flex flex-col items-center gap-5 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive-subtle">
          <AlertCircle size={22} className="text-destructive-text" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            This page ran into an unexpected error. Trying again often clears it.
          </p>
          {error?.digest && (
            <p className="text-xs text-muted-foreground/70 font-mono">
              Reference: {error.digest}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white hover:bg-brand-hover transition-colors text-sm font-medium cursor-pointer"
          >
            <RotateCcw size={15} />
            Try again
          </button>
          <Link
            href="/app"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-foreground hover:bg-accent transition-colors text-sm font-medium"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
