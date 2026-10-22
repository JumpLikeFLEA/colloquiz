"use client";

import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { voiceListQuery } from "@/lib/voice/analysis/studioList";

// VOICE-015: the list's one filter lives in the URL (parseVoiceListFilters allow-lists it), the
// review queue's pattern. Changing the course goes back to page 1.

const ANY = "any";

export function VoiceFilters({ course, courses }: { course: string | null; courses: { id: string; title: string }[] }) {
  const router = useRouter();
  return (
    <Select
      value={course ?? ANY}
      onValueChange={(v) => router.push(`/studio/voice${voiceListQuery({ course: v === ANY ? null : v })}`)}
    >
      <SelectTrigger className="w-full sm:w-72" aria-label="Course">
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
  );
}
