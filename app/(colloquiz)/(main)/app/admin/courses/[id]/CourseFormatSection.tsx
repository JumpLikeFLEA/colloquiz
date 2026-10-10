"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import type { CourseFormat } from "@/lib/courseAuthoring";
import { pluralize } from "@/lib/format";
import { postJson } from "./postJson";

// AUTH-010 — the course's format (058 `courses.format`) and, for a cohort
// course, its "how to join" link and the way to its runs page. Every rule is
// the RPC's (set_course_format, set_course_how_to_join_url); this section
// shows the state the page read and toasts a refusal. The run summary is
// computed on the server (page.tsx) so the "in progress" notice can't
// disagree between server and client render.

export type CourseRunSummary = { count: number; inProgress: boolean };

const FORMAT_LABELS: Record<CourseFormat, string> = {
  self_paced: "Self-paced",
  cohort: "Cohort",
};

const FORMAT_HINTS: Record<CourseFormat, string> = {
  self_paced: "Learners open any lesson they have access to, at any time.",
  cohort:
    "Runs with a start date. Lessons that need a purchase open by week, counted from the learner's run start. Lessons open to anyone or to signed-in learners ignore the schedule.",
};

export function CourseFormatSection({
  courseId,
  format,
  howToJoinUrl,
  runs,
  onChanged,
}: {
  courseId: string;
  format: CourseFormat;
  howToJoinUrl: string | null;
  runs: CourseRunSummary;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [joinUrl, setJoinUrl] = useState(howToJoinUrl ?? "");
  const locked = runs.count > 0;

  async function changeFormat(next: CourseFormat) {
    if (next === format) return;
    setBusy(true);
    try {
      await postJson(`/api/admin/courses/${courseId}/format`, { format: next });
      toast.success(`Format set to ${FORMAT_LABELS[next]}.`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change the format.");
    } finally {
      setBusy(false);
    }
  }

  async function saveJoinUrl() {
    setBusy(true);
    try {
      await postJson(`/api/admin/courses/${courseId}/join-url`, { url: joinUrl.trim() || null });
      toast.success("Join link saved.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the join link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">Format</h2>
      <div className="flex flex-col gap-1">
        <Select value={format} onValueChange={(v) => changeFormat(v as CourseFormat)} disabled={busy || locked}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Course format">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(FORMAT_LABELS) as CourseFormat[]).map((f) => (
              <SelectItem key={f} value={f}>
                {FORMAT_LABELS[f]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {FORMAT_HINTS[format]}
          {locked && " Locked: the format can't change once the course has a run."}
        </p>
      </div>

      {format === "cohort" && (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor="how-to-join-url" className="text-xs font-medium text-foreground">
              How to join (link)
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="how-to-join-url"
                value={joinUrl}
                onChange={(e) => setJoinUrl(e.target.value)}
                placeholder="https://… (optional)"
                inputMode="url"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
              />
              <button
                onClick={saveJoinUrl}
                disabled={busy || joinUrl.trim() === (howToJoinUrl ?? "")}
                className="cursor-pointer disabled:cursor-not-allowed shrink-0 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
              >
                Save
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Shown to a visitor who isn&rsquo;t enrolled, e.g. your Patreon page.
            </p>
          </div>

          {runs.inProgress && (
            <p className="px-3 py-2 rounded-lg bg-warning-subtle text-xs text-warning">
              A run is in progress. A published lesson&rsquo;s week can only move earlier, and a published lesson
              can&rsquo;t be switched to Purchase required, so nothing re-locks for learners who can already open
              it.
            </p>
          )}

          <Link
            href={`/app/admin/courses/${courseId}/runs`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            <CalendarClock className="size-3.5" />
            Runs and calls
            <span className="text-muted-foreground font-normal">({pluralize(runs.count, "run")})</span>
          </Link>
        </>
      )}
    </section>
  );
}
