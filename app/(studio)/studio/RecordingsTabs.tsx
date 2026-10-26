import Link from "next/link";
import { cn } from "@/lib/utils";

// The two lists behind the sidebar's one "Recordings" entry (docs/decisions/0208
// Decision 2): the cohort review queue and the AI feedback list. Each page keeps
// its own route, so inbox links, #final-comments and Guide paths still work.
// Real navigations, so links with aria-current, not an ARIA tablist; the pill
// classes are ProgressTabs' (Colloquiz Progress).

type RecordingsTab = "reviews" | "voice";

const TABS: { tab: RecordingsTab; href: string; label: string }[] = [
  { tab: "reviews", href: "/studio/reviews", label: "Teacher review" },
  { tab: "voice", href: "/studio/voice", label: "AI feedback" },
];

export function RecordingsTabs({ tab }: { tab: RecordingsTab }) {
  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Recordings">
      {TABS.map((t) => (
        <Link
          key={t.tab}
          href={t.href}
          prefetch={false}
          aria-current={t.tab === tab ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center rounded-xl px-4 py-2 text-sm font-medium transition-colors",
            t.tab === tab ? "bg-brand-subtle text-brand-text" : "text-muted-foreground hover:bg-accent",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
