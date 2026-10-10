"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { fromLocalDateTime, toLocalDateTime } from "@/lib/cohortSchedule";
import { postJson } from "../postJson";
import type { RunWithPhase } from "./RunsView";

// AUTH-010 — create a run, or edit one (update_run, 058, a full replace).
// A started run's start is shown locked and sent back unchanged: update_run
// refuses any other value (run_started), which is the no-re-lock rule for
// runs (docs/decisions/0093 Decision 5). The end is never entered here:
// 058's trigger derives it from the course's weeks.
// Mounted only while open, so the wall-clock initial value is computed in
// the browser (the editor's own timezone), never on the server.
export function RunDialog({
  courseId,
  run,
  onClose,
  onSaved,
}: {
  courseId: string;
  run: RunWithPhase | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const startLocked = run !== null && run.phase !== "upcoming";
  const [title, setTitle] = useState(run?.title ?? "");
  const [start, setStart] = useState(run ? toLocalDateTime(run.startsAt) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const startsAt = startLocked ? run!.startsAt : fromLocalDateTime(start);
    if (!startsAt) {
      setError("Please enter a start date and time.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = { startsAt, title: title.trim() || null };
      if (run) await postJson(`/api/admin/courses/${courseId}/runs/${run.id}`, body, "PATCH");
      else await postJson(`/api/admin/courses/${courseId}/runs`, body);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the run.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{run ? "Edit run" : "New run"}</DialogTitle>
          <DialogDescription>
            Week 1 opens at the start, week N seven days after week N&minus;1. The end follows from the
            course&rsquo;s latest week.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional), e.g. November 2026"
            maxLength={120}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="run-start" className="text-xs font-medium text-foreground">
              Start
            </label>
            <input
              id="run-start"
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              disabled={startLocked}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none disabled:opacity-60 disabled:cursor-not-allowed"
            />
            {startLocked && (
              <p className="text-xs text-muted-foreground">
                Locked: this run has started. Moving its start would re-lock lessons its learners can already
                open.
              </p>
            )}
          </div>
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
            disabled={saving || (!startLocked && !start)}
            className="cursor-pointer disabled:cursor-not-allowed px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : run ? "Save" : "Create run"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
