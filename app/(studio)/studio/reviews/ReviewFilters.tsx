"use client";

import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { STATUS_FILTERS, reviewFiltersQuery, type FilterOptions, type ReviewFilters as Filters } from "@/lib/reviews/queue";
import { STATUS_FILTER_LABEL, weekLabel } from "./statusLabels";

// VOICE-006: the queue's filters live in the URL (parseReviewFilters
// allow-lists them), so a per-course link from the editor and a reload
// both land on the same view. Changing the course clears run and week,
// which belong to a course.

const ANY = "any";

export function ReviewFilters({ filters, options }: { filters: Filters; options: FilterOptions }) {
  const router = useRouter();
  const go = (next: Partial<Filters>) => router.push(`/studio/reviews${reviewFiltersQuery({ ...filters, ...next })}`);

  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      <Select
        value={filters.course ?? ANY}
        onValueChange={(v) => go({ course: v === ANY ? null : v, run: null, week: null })}
      >
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

      <Select value={filters.run ?? ANY} onValueChange={(v) => go({ run: v === ANY ? null : v })}>
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

      <Select
        value={filters.week == null ? ANY : String(filters.week)}
        onValueChange={(v) => go({ week: v === ANY ? null : Number(v) })}
      >
        <SelectTrigger className="w-full sm:w-36" aria-label="Week">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>All weeks</SelectItem>
          {options.weeks.map((w) => (
            <SelectItem key={w} value={String(w)}>
              {weekLabel(w)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.status} onValueChange={(v) => go({ status: v as Filters["status"] })}>
        <SelectTrigger className="w-full sm:w-40" aria-label="Status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_FILTERS.map((s) => (
            <SelectItem key={s} value={s}>
              {STATUS_FILTER_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
