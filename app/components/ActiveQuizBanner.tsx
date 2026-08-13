"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Play, Clock } from "lucide-react";

type Summary = { quizId: string; title: string; currentIndex: number } | null;

// Slim "Resume your quiz" strip shown on every main page while a quiz is active.
// App Router shared layouts don't re-run on client navigation, so this
// self-refreshes on each pathname change. Hidden while actually taking a quiz.
export function ActiveQuizBanner({
  initialSummary = null,
}: {
  initialSummary?: Summary;
}) {
  const pathname = usePathname();
  // Seeded from the server render (layout) so the banner is correct on first
  // paint without a mount fetch. The layout only re-runs on a full load, so on
  // client navigation (shared layout, no re-run) this still self-refreshes.
  const [summary, setSummary] = useState<Summary>(initialSummary);

  const onQuizScreen = pathname.startsWith("/quiz/");

  // Skip the fetch for the initial pathname — the server already supplied its
  // summary. Fetch only on subsequent pathname changes (client navigation).
  const seeded = useRef(true);

  useEffect(() => {
    // No clearing here — the render guard below already hides the banner on a
    // quiz screen, and the refetch on the next pathname change replaces the
    // summary with the current session.
    if (seeded.current) {
      seeded.current = false;
      return;
    }
    if (onQuizScreen) return;
    let cancelled = false;
    fetch("/api/quiz/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Summary) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname, onQuizScreen]);

  if (!summary || onQuizScreen) return null;

  return (
    <div className="flex items-center gap-3 px-5 py-2.5 bg-brand-subtle border-b border-brand/20">
      <Clock size={15} className="text-brand-text shrink-0" />
      <p className="text-sm text-brand-text min-w-0 truncate">
        You have a quiz in progress
        <span className="text-muted-foreground"> — {summary.title}</span>
      </p>
      <Link
        href={`/quiz/${summary.quizId}`}
        className="ml-auto shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors"
      >
        <Play size={14} />
        Resume
      </Link>
    </div>
  );
}
