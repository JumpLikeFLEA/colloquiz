"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export type ProgressTab = "stats" | "achievements" | "history";

const TABS: { tab: ProgressTab; href: string; label: string }[] = [
  { tab: "stats", href: "/progress?tab=stats", label: "Stats" },
  { tab: "achievements", href: "/progress?tab=achievements", label: "Achievements" },
  // Deliberately no filter params: the tab link is the unfiltered view, and a
  // filtered history is reached by the controls on the tab itself.
  { tab: "history", href: "/progress?tab=history", label: "History" },
];

/**
 * Real navigations (URL-driven), so links with aria-current, not an ARIA tablist.
 *
 * /progress is a dynamic route with no loading.tsx, so a click waits on a server
 * round trip while the previous tab's content stays on screen. Without feedback
 * the pill would not move for a few hundred ms and the click would read as
 * dropped, so the pending tab takes the active styling optimistically. Only the
 * styling: aria-current stays truthful to the server, because the page really
 * has not changed yet.
 */
export function ProgressTabs({ tab }: { tab: ProgressTab }) {
  const [pendingTab, setPendingTab] = useState<ProgressTab | null>(null);
  const shown = pendingTab ?? tab;

  return (
    <div className="flex items-center gap-2">
      {TABS.map((t) => (
        <Link
          key={t.tab}
          href={t.href}
          aria-current={t.tab === tab ? "page" : undefined}
          className={cn(
            "inline-flex items-center rounded-xl px-4 py-2 text-sm font-medium transition-colors",
            t.tab === shown
              ? "bg-brand-subtle text-brand-text"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          {t.label}
          <PendingProbe tab={t.tab} onPendingChange={setPendingTab} />
        </Link>
      ))}
    </div>
  );
}

/**
 * useLinkStatus only works inside a Link, and each Link only knows its own
 * pending state — so the two are lifted into one place here, otherwise both
 * pills would light up at once during a switch.
 */
function PendingProbe({
  tab,
  onPendingChange,
}: {
  tab: ProgressTab;
  onPendingChange: (tab: ProgressTab | null) => void;
}) {
  const { pending } = useLinkStatus();

  useEffect(() => {
    if (!pending) return;
    onPendingChange(tab);
    // Clearing on the way out is safe: `pending` flips false in the same commit
    // that lands the new `tab` prop, so the fallback is already correct.
    return () => onPendingChange(null);
  }, [pending, tab, onPendingChange]);

  return null;
}
