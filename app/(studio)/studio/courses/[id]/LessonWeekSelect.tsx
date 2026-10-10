"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";

// AUTH-010 — a cohort lesson's week (058 `lessons.week`), next to its access
// level in the course editor's lesson row and built the same way (AUTH-009's
// Select). Weeks 1–8 are offered: a cohort runs four weeks (docs/handoff.md),
// and 8 leaves room for a longer course without a free-number field. A week
// already stored above 8 is still listed, so the control never hides a value
// (docs/decisions/0106 Decision 1).
const DEFAULT_MAX_WEEK = 8;
const NO_WEEK = "none";

export function LessonWeekSelect({
  lessonTitle,
  week,
  disabled,
  onChange,
}: {
  lessonTitle: string;
  week: number | null;
  disabled: boolean;
  onChange: (week: number | null) => void;
}) {
  const max = Math.max(DEFAULT_MAX_WEEK, week ?? 0);
  const weeks = Array.from({ length: max }, (_, i) => i + 1);

  return (
    <Select
      value={week === null ? NO_WEEK : String(week)}
      onValueChange={(v) => onChange(v === NO_WEEK ? null : Number(v))}
      disabled={disabled}
    >
      <SelectTrigger size="sm" className="w-28 shrink-0 text-xs" aria-label={`Week of ${lessonTitle}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_WEEK} className="text-xs">
          No week
        </SelectItem>
        {weeks.map((w) => (
          <SelectItem key={w} value={String(w)} className="text-xs">
            Week {w}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
