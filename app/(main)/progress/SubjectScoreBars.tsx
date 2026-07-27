"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { pluralize } from "@/lib/format";
import { BAR_COLLAPSED_ROWS, type SubjectStat } from "@/lib/subjectStats";

/**
 * Average score per subject, strongest first — the chart that answers "what
 * should I study next" (read it bottom-up).
 *
 * Hand-built rather than a Recharts BarChart on purpose: a category axis has a
 * fixed pixel width and clips the names that do not fit, which is the exact bug
 * this work exists to remove. A flex row wraps a long name instead. It also
 * scales — the list collapses past BAR_COLLAPSED_ROWS rather than growing with
 * the catalogue.
 *
 * One series, so one hue for every bar: colouring bars by their own value would
 * re-encode the length as brightness and say nothing new. The number at the tip
 * carries the value, in text colour, not the bar's.
 */
export function SubjectScoreBars({ subjects }: { subjects: SubjectStat[] }) {
  const [expanded, setExpanded] = useState(false);

  const visible = expanded ? subjects : subjects.slice(0, BAR_COLLAPSED_ROWS);
  const hiddenCount = subjects.length - visible.length;

  return (
    <div className="p-5 rounded-2xl border border-border bg-card flex flex-col gap-4">
      <div>
        <p className="font-medium text-foreground">Average Score by Subject</p>
        <p className="text-xs text-muted-foreground">
          Every subject you&apos;ve attempted, strongest first
        </p>
      </div>

      {subjects.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No quizzes yet — your subject breakdown appears here after the first one.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {visible.map((s) => (
              <li
                key={s.subject}
                title={`${pluralize(s.quizzes, "quiz", "quizzes")} · ${s.avgScore}% average`}
                className="flex items-center gap-3 -mx-2 px-2 py-1.5 rounded-lg hover:bg-accent/30 transition-colors"
              >
                <span className="w-28 sm:w-44 shrink-0 text-sm text-foreground leading-snug">
                  {s.subject}
                </span>
                <span className="flex-1 h-2 bg-muted rounded-sm overflow-hidden">
                  <span
                    className="block h-full rounded-r-sm bg-[#4f46e5]"
                    style={{ width: `${s.avgScore}%` }}
                  />
                </span>
                <span className="w-10 shrink-0 text-right text-sm font-medium text-foreground tabular-nums">
                  {s.avgScore}%
                </span>
              </li>
            ))}
          </ul>

          {subjects.length > BAR_COLLAPSED_ROWS && (
            <button
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              className="self-start text-xs text-[#4f46e5] hover:underline flex items-center gap-1 cursor-pointer"
            >
              {expanded ? (
                <>
                  Show fewer <ChevronUp size={13} />
                </>
              ) : (
                <>
                  Show all {pluralize(subjects.length, "subject")} ({hiddenCount} more)
                  <ChevronDown size={13} />
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}
