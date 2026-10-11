"use client";

import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { learnerFiltersQuery, type LearnerFilters as Filters, type RosterFilterOptions } from "@/lib/learners/roster";

// AUTH-011: the roster's filters live in the URL (parseLearnerFilters
// allow-lists them), the review queue's pattern. Changing the course clears
// the run, which belongs to a course.

const ANY = "any";

export function LearnerFilters({ filters, options }: { filters: Filters; options: RosterFilterOptions }) {
  const router = useRouter();
  const go = (next: Partial<Filters>) => router.push(`/studio/learners${learnerFiltersQuery({ ...filters, ...next })}`);

  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      <Select value={filters.course ?? ANY} onValueChange={(v) => go({ course: v === ANY ? null : v, run: null })}>
        <SelectTrigger className="w-full sm:w-56" aria-label="Course">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>All courses</SelectItem>
          {options.courses.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.run ?? ANY}
        onValueChange={(v) => go({ run: v === ANY ? null : v })}
        disabled={options.runs.length === 0 && !filters.run}
      >
        <SelectTrigger className="w-full sm:w-48" aria-label="Run">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>All runs</SelectItem>
          {options.runs.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.title || "Untitled run"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
