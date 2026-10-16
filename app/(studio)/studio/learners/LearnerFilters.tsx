"use client";

import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { learnerFiltersQuery, type LearnerFilters as Filters, type RosterFilterOptions } from "@/lib/learners/roster";

// AUTH-011: the roster's filters live in the URL (parseLearnerFilters
// allow-lists them), the review queue's pattern. Changing the course clears
// the run, which belongs to a course.

const ANY = "any";

export function LearnerFilters({
  filters,
  options,
  groups = [],
}: {
  filters: Filters;
  options: RosterFilterOptions;
  /** The teacher's own groups (TCH-002); the Group select shows only when there are some. */
  groups?: { id: string; name: string }[];
}) {
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

      {(groups.length > 0 || filters.group) && (
        <Select value={filters.group ?? ANY} onValueChange={(v) => go({ group: v === ANY ? null : v })}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Group">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All students</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
