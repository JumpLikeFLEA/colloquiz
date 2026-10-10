import Link from "next/link";
import { Compass } from "lucide-react";

/**
 * Studio's 404, inside the Studio root layout. Also what a signed-in
 * non-editor sees on any /studio path (app/(studio)/studio/layout.tsx).
 * Same markup as app/(colloquiz)/not-found.tsx.
 */
export default function StudioNotFound() {
  return (
    <div className="min-h-svh flex items-center justify-center bg-background px-6 py-16">
      <div className="max-w-md w-full text-center flex flex-col items-center gap-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-subtle">
          <Compass size={22} className="text-brand-text" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-lg font-semibold text-foreground">Page not found</h1>
          <p className="text-sm text-muted-foreground">
            The page you were looking for doesn&apos;t exist or may have moved.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white hover:bg-brand-hover transition-colors text-sm font-medium"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
