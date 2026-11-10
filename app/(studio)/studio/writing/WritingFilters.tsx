"use client";

import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import {
  WRITING_STATUS_FILTERS,
  writingFiltersQuery,
  type WritingFilters as Filters,
  type WritingStatusFilter,
} from "@/lib/writing/review";
import { WRITING_STATUS_FILTER_LABEL } from "./labels";

// WRITE-003: the Written answers tab's filters live in the URL (parseWritingFilters allow-lists
// them), the recordings queue's pattern: two columns at 360px.

const ANY = "any";

export function WritingFilters({ filters, courses }: { filters: Filters; courses: { id: string; title: string }[] }) {
  const router = useRouter();
  const go = (next: Partial<Filters>) => router.push(`/studio/writing${writingFiltersQuery({ ...filters, ...next })}`);

  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      <Select value={filters.course ?? ANY} onValueChange={(v) => go({ course: v === ANY ? null : v })}>
        <SelectTrigger className="w-full sm:w-56" aria-label="Course">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>All courses</SelectItem>
          {courses.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.status} onValueChange={(v) => go({ status: v as WritingStatusFilter })}>
        <SelectTrigger className="w-full sm:w-40" aria-label="Status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {WRITING_STATUS_FILTERS.map((s) => (
            <SelectItem key={s} value={s}>
              {WRITING_STATUS_FILTER_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
