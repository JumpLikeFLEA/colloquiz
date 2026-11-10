import Link from "next/link";
import { cn } from "@/lib/utils";

// The three lists behind the sidebar's one "Reviews" entry (docs/decisions/0225
// Decision 4, superseding 0208 Decision 2's label): the cohort recordings queue,
// the written answers and the AI feedback list. Each page keeps its own route, so
// inbox links, #final-comments and Guide paths still work. Real navigations, so
// links with aria-current, not an ARIA tablist; the pill classes are
// ProgressTabs' (Colloquiz Progress).

type ReviewsTab = "reviews" | "writing" | "voice";

const TABS: { tab: ReviewsTab; href: string; label: string }[] = [
  { tab: "reviews", href: "/studio/reviews", label: "Recordings" },
  { tab: "writing", href: "/studio/writing", label: "Written answers" },
  { tab: "voice", href: "/studio/voice", label: "AI feedback" },
];

export function ReviewsTabs({ tab }: { tab: ReviewsTab }) {
  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Reviews">
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
