"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Play, Clock } from "lucide-react";

type Summary = { quizId: string; title: string; currentIndex: number } | null;

// Slim "Resume your quiz" strip shown on every main page while a quiz is active.
// App Router shared layouts don't re-run on client navigation, so this
// self-refreshes on each pathname change. Hidden while actually taking a quiz.
export function ActiveQuizBanner() {
  const pathname = usePathname();
  const [summary, setSummary] = useState<Summary>(null);

  const onQuizScreen = pathname.startsWith("/quiz/");

  useEffect(() => {
    // No clearing here — the render guard below already hides the banner on a
    // quiz screen, and the refetch on the next pathname change replaces the
    // summary with the current session.
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
    <div className="flex items-center gap-3 px-5 py-2.5 bg-[#eef2ff] border-b border-[#4f46e5]/20">
      <Clock size={15} className="text-[#4f46e5] shrink-0" />
      <p className="text-sm text-[#4f46e5] min-w-0 truncate">
        You have a quiz in progress
        <span className="text-muted-foreground"> — {summary.title}</span>
      </p>
      <Link
        href={`/quiz/${summary.quizId}`}
        className="ml-auto shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4f46e5] text-white text-sm font-medium hover:bg-[#4338ca] transition-colors"
      >
        <Play size={14} />
        Resume
      </Link>
    </div>
  );
}
