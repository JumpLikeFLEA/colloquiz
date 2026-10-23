"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { DateTimeField } from "@/app/components/DateTimeField";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { buildEventPayload, EVENT_TITLE_MAX, type CalendarEvent } from "@/lib/calendarEvents";
import { toLocalDateTime } from "@/lib/cohortSchedule";
import { LocalTime } from "@/app/(studio)/studio/courses/[id]/LocalTime";
import { postJson } from "@/app/(studio)/studio/courses/[id]/postJson";

// COH-014 (docs/decisions/0158) — the dated events of one run or one group:
// add, edit, delete. Mounted on the runs page (one per run card) and on the
// group page; the caller wraps it in WriteArea (TCH-008) where it is not
// already inside one. Composed from the runs page's call list (row list,
// icon buttons, Add button) and CallDialog's fields; no new tokens. Who may
// write is decided in SQL (084): a refusal arrives as a toast or the dialog's
// error box.

export type EventScope = { kind: "run"; runId: string } | { kind: "group"; groupId: string };

const ICON_BUTTON =
  "cursor-pointer disabled:cursor-not-allowed shrink-0 p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50";
const INPUT = "px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none";

function EventDialog({
  scope,
  event,
  onClose,
  onSaved,
}: {
  scope: EventScope;
  event: CalendarEvent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [start, setStart] = useState(event ? toLocalDateTime(event.startsAt) : "");
  const [end, setEnd] = useState(event?.endsAt ? toLocalDateTime(event.endsAt) : "");
  const [link, setLink] = useState(event?.link ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const built = buildEventPayload({ title, start, end, link });
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await postJson(
        "/api/studio/calendar-events",
        event
          ? { action: "update", eventId: event.id, ...built.payload }
          : {
              action: "create",
              runId: scope.kind === "run" ? scope.runId : null,
              groupId: scope.kind === "group" ? scope.groupId : null,
              ...built.payload,
            },
      );
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the event.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{event ? "Edit event" : "Add event"}</DialogTitle>
          <DialogDescription>
            {scope.kind === "run"
              ? "Everyone enrolled in this run, on either tier, can see it."
              : "The students in this group can see it. They don't see the group's name."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="event-title" className="text-xs font-medium text-foreground">
              Title
            </label>
            <input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Test day, No call this week"
              maxLength={EVENT_TITLE_MAX}
              className={INPUT}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="event-start" className="text-xs font-medium text-foreground">
              Starts
            </label>
            <DateTimeField id="event-start" value={start} onChange={setStart} timeLabel="Start time" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="event-end" className="text-xs font-medium text-foreground">
              Ends <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <DateTimeField id="event-end" value={end} onChange={setEnd} timeLabel="End time" optional />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="event-link" className="text-xs font-medium text-foreground">
              Link <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              id="event-link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://…"
              inputMode="url"
              className={INPUT}
            />
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
            disabled={saving || !title.trim() || !start}
            className="cursor-pointer disabled:cursor-not-allowed px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : event ? "Save" : "Add event"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CalendarEventsSection({ scope, events }: { scope: EventScope; events: CalendarEvent[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<{ event: CalendarEvent | null } | null>(null);
  const [confirm, setConfirm] = useState<CalendarEvent | null>(null);

  async function remove(event: CalendarEvent) {
    setBusy(true);
    try {
      await postJson("/api/studio/calendar-events", { action: "delete", eventId: event.id });
      toast.success("Event deleted.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-foreground">
          Events{" "}
          <span className="text-muted-foreground font-normal">
            ({events.length === 1 ? "1 event" : `${events.length} events`},{" "}
            {scope.kind === "run" ? "both tiers" : "this group's students"})
          </span>
        </h3>
        <button
          onClick={() => setDialog({ event: null })}
          disabled={busy}
          className="cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
        >
          <Plus className="size-3" />
          Add event
        </button>
      </div>
      {events.length > 0 && (
        <div className="rounded-xl border border-border divide-y divide-border">
          {events.map((event) => (
            <div key={event.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <div className="flex-1 min-w-48">
                <p className="text-sm text-foreground break-words">{event.title}</p>
                <p className="text-xs text-muted-foreground">
                  <LocalTime iso={event.startsAt} />
                  {event.endsAt && (
                    <>
                      {" – "}
                      <LocalTime iso={event.endsAt} />
                    </>
                  )}
                </p>
                {event.link && (
                  <a
                    href={event.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground break-all"
                  >
                    {event.link}
                    <ExternalLink className="size-3 shrink-0" />
                  </a>
                )}
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-1">
                <button onClick={() => setDialog({ event })} disabled={busy} aria-label={`Edit ${event.title}`} className={ICON_BUTTON}>
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setConfirm(event)}
                  disabled={busy}
                  aria-label={`Delete ${event.title}`}
                  className={`${ICON_BUTTON} hover:text-destructive-text`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {dialog && (
        <EventDialog
          scope={scope}
          event={dialog.event}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            router.refresh();
          }}
        />
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">Delete &ldquo;{confirm?.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>It disappears from the calendar of everyone who could see it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) remove(confirm);
                setConfirm(null);
              }}
              className="rounded-xl"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
