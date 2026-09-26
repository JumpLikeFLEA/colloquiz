"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

/**
 * Error boundary for the auth surface (login / signup / reset). Deliberately
 * self-contained and centered — there is no shell to preserve here, and a user
 * who cannot even reach the sign-in form needs a plain way to retry. Composed
 * from the ErrorDialog copy voice and classes already used in AuthScreen.
 */
export default function AuthError({
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
    <div className="min-h-svh flex items-center justify-center bg-background px-6 py-16">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-6 flex flex-col items-center gap-5 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive-subtle">
          <AlertCircle size={22} className="text-destructive-text" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            We couldn&apos;t load the sign-in screen. Please try again.
          </p>
          {error?.digest && (
            <p className="text-xs text-muted-foreground/70 font-mono">
              Reference: {error.digest}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white hover:bg-brand-hover transition-colors text-sm font-medium cursor-pointer"
        >
          <RotateCcw size={15} />
          Try again
        </button>
      </div>
    </div>
  );
}
