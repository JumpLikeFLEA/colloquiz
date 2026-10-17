import { Lock } from "lucide-react";
import type { WriteBanner } from "@/lib/studioWriteLock";

// TCH-008 (docs/decisions/0155). Shown at the top of every Studio page while
// the caller cannot write. Composed from the warning pill's tokens and the
// runs page's card frame; a Server Component, so it adds no client JS.
export function ReadOnlyBanner({ banner }: { banner: WriteBanner }) {
  return (
    <div role="status" className="mb-6 flex items-start gap-3 rounded-2xl border border-border bg-warning-subtle p-4">
      <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-warning">{banner.title}</p>
        <p className="mt-1 text-sm text-foreground">{banner.detail}</p>
      </div>
    </div>
  );
}
