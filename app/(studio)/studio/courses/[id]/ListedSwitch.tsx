"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Switch } from "@/app/components/ui/switch";
import { listingHint } from "@/lib/listedCourses";
import { postJson } from "./postJson";

// TCH-010 (docs/decisions/0171) — the admin's "Listed in the catalogue" switch,
// shared by the course editor and /studio/authors. The state shown is what the
// server last returned; whether the course may be listed is decided by
// set_course_listed (088), and a refusal is toasted, not guessed in advance.
// Only a published course can be switched on; a listed course can always be
// switched off.
export function ListedSwitch({
  courseId,
  title,
  published,
  listed,
}: {
  courseId: string;
  title: string;
  published: boolean;
  listed: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function change(next: boolean) {
    setBusy(true);
    try {
      await postJson("/api/studio/course-listing", { courseId, listed: next });
      toast.success(next ? "Listed in the catalogue." : "Removed from the catalogue.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start gap-3 min-w-0">
      <Switch
        checked={listed}
        disabled={busy || (!published && !listed)}
        onCheckedChange={change}
        aria-label={`Listed in the catalogue: ${title}`}
        className="mt-0.5"
      />
      <span className="min-w-0 text-xs text-muted-foreground">{listingHint({ published, listed })}</span>
    </div>
  );
}
