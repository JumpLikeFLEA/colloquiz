"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { fromLocalDateTime, MAX_WEEKLY_REPEATS, toLocalDateTime, weeklyRepeats } from "@/lib/cohortSchedule";
import type { CourseCall } from "@/lib/courseRuns";
import { LocalTime } from "../LocalTime";
import { postJson } from "../postJson";

// AUTH-010 — add a call to a run (optionally repeated weekly), or edit one.
// "Repeat weekly ×N" steps the wall-clock date (lib/cohortSchedule.ts
// `weeklyRepeats`), so a 19:00 call stays at 19:00 across a clock change,
// then sends N instants to the calls route, which calls create_call once
// for each (docs/decisions/0106 Decision 4). Mounted only while open.
export function CallDialog({
  courseId,
  runId,
  call,
  onClose,
  onSaved,
}: {
  courseId: string;
  runId: string;
  call: CourseCall | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [start, setStart] = useState(call ? toLocalDateTime(call.startsAt) : "");
  const [meetUrl, setMeetUrl] = useState(call?.meetUrl ?? "");
  const [title, setTitle] = useState(call?.title ?? "");
  const [repeat, setRepeat] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const times = call ? [start] : weeklyRepeats(start, repeat);
  const instants = times.map(fromLocalDateTime).filter((t): t is string => t !== null);

  async function save() {
    if (instants.length === 0) {
      setError("Please enter a date and time.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const fields = { meetUrl: meetUrl.trim(), title: title.trim() || null };
      if (call) {
        await postJson(`/api/admin/courses/${courseId}/calls/${call.id}`, { ...fields, startsAt: instants[0] }, "PATCH");
      } else {
        await postJson(`/api/admin/courses/${courseId}/runs/${runId}/calls`, { ...fields, startsAt: instants });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the call.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{call ? "Edit call" : "Add call"}</DialogTitle>
          <DialogDescription>Learners on this run&rsquo;s extended tier see the time and the link.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="call-start" className="text-xs font-medium text-foreground">
              {call || repeat === 1 ? "Date and time" : "First call"}
            </label>
            <input
              id="call-start"
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
            />
          </div>
          <input
            value={meetUrl}
            onChange={(e) => setMeetUrl(e.target.value)}
            placeholder="Google Meet link (https://…)"
            inputMode="url"
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional), e.g. Speaking club"
            maxLength={120}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
          />
          {!call && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">Repeat weekly</label>
              <Select value={String(repeat)} onValueChange={(v) => setRepeat(Number(v))}>
                <SelectTrigger className="w-full sm:w-48" aria-label="Repeat weekly">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: MAX_WEEKLY_REPEATS }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n === 1 ? "Once" : `${n} weeks in a row`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {repeat > 1 && instants.length > 0 && (
                <ul className="text-xs text-muted-foreground space-y-0.5 mt-1">
                  {instants.map((t) => (
                    <li key={t}>
                      <LocalTime iso={t} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {error && (
            <div className="px-3 py-2 rounded-lg bg-destructive-subtle border border-destructive-border text-sm text-destructive-text">
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <button
            onClick={onClose}
            className="cursor-pointer px-3 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || instants.length === 0 || !meetUrl.trim()}
            className="cursor-pointer disabled:cursor-not-allowed px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : call ? "Save" : instants.length > 1 ? `Add ${instants.length} calls` : "Add call"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
