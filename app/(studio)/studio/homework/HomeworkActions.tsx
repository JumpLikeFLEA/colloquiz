"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { HOMEWORK_NOTE_MAX } from "@/lib/homework/homework";
import { postJson } from "@/app/(studio)/studio/courses/[id]/postJson";
import { WriteArea } from "@/app/(studio)/studio/StudioWriteLock";

// TCH-005 (docs/decisions/0152) — edit the due date and note of one
// assignment, or delete it. Only those two fields change (update_homework,
// 080); the content and the targets do not: delete and assign again. Composed
// from the group page's buttons and AlertDialog and the invite dialog's
// fields; no new tokens.

const INPUT_CLASS = "px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none";
const SECONDARY_BUTTON =
  "cursor-pointer inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const PRIMARY_BUTTON =
  "cursor-pointer inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

function HomeworkActionsInner({
  assignmentId,
  title,
  dueOn,
  note,
}: {
  assignmentId: string;
  title: string;
  dueOn: string | null;
  note: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draftDue, setDraftDue] = useState(dueOn ?? "");
  const [draftNote, setDraftNote] = useState(note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/studio/homework", {
        action: "update",
        assignmentId,
        dueOn: draftDue || null,
        note: draftNote.trim() || null,
      });
      toast.success("Homework updated.");
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await postJson("/api/studio/homework", { action: "delete", assignmentId });
      toast.success("Homework deleted.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setDraftDue(dueOn ?? "");
            setDraftNote(note ?? "");
            setError(null);
            setEditing(true);
          }}
          className={SECONDARY_BUTTON}
          aria-label={`Edit the due date and note of ${title}`}
        >
          <Pencil className="size-4" aria-hidden="true" />
          Edit
        </button>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={busy}
          className={SECONDARY_BUTTON}
          aria-label={`Delete the homework ${title}`}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Delete
        </button>
      </div>

      <Dialog open={editing} onOpenChange={(o) => !o && setEditing(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit homework</DialogTitle>
            <DialogDescription>
              {title}. Only the due date and the note change; delete it and assign again to change who gets it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={`due-${assignmentId}`} className="text-xs font-medium text-foreground">
                Due date (optional)
              </label>
              <input
                id={`due-${assignmentId}`}
                type="date"
                value={draftDue}
                onChange={(e) => setDraftDue(e.target.value)}
                className={`${INPUT_CLASS} w-full sm:w-48`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`note-${assignmentId}`} className="text-xs font-medium text-foreground">
                Note (optional)
              </label>
              <textarea
                id={`note-${assignmentId}`}
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                maxLength={HOMEWORK_NOTE_MAX}
                rows={3}
                className={INPUT_CLASS}
              />
              <p className="text-xs text-muted-foreground">
                {draftNote.length} / {HOMEWORK_NOTE_MAX}
              </p>
            </div>
            {error && (
              <div className="px-3 py-2 rounded-lg bg-destructive-subtle border border-destructive-border text-sm text-destructive-text">
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setEditing(false)} className={SECONDARY_BUTTON}>
              Cancel
            </button>
            <button type="button" onClick={save} disabled={busy} className={PRIMARY_BUTTON}>
              {busy ? "Saving…" : "Save"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this homework?</AlertDialogTitle>
            <AlertDialogDescription>
              {title}. Students stop seeing it. Their answers and scores stay with them, and you can no longer read
              answers for lessons you don&apos;t edit. It can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Delete homework</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// TCH-008 (docs/decisions/0155): a frozen seat disables everything inside, with the
// reason as the tooltip; unfrozen, this renders exactly the component above.
export function HomeworkActions(props: React.ComponentProps<typeof HomeworkActionsInner>) {
  return (
    <WriteArea>
      <HomeworkActionsInner {...props} />
    </WriteArea>
  );
}
