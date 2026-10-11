"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { courseDeleteBlockedMessage } from "@/lib/courseDelete";

/**
 * AUTH-018 (docs/decisions/0125 Decision 8, 0129). The course editor's last
 * section. `blockers` comes from course_delete_blockers() (068), read by the
 * page on the server: empty means deletable and shows the danger zone (the
 * Settings > Data and privacy markup); otherwise one muted line names the
 * first blocker. The DELETE route re-checks everything under a row lock, so
 * a stale page can only be refused, never delete more than it should.
 */
export function DeleteCourseSection({
  courseId,
  courseTitle,
  blockers,
}: {
  courseId: string;
  courseTitle: string;
  blockers: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blockedMessage = courseDeleteBlockedMessage(blockers);
  // Same comparison as delete_course: trimmed, case-sensitive.
  const armed = confirmText.trim() === courseTitle.trim();

  function reset() {
    setConfirmText("");
    setError(null);
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/courses/${courseId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmTitle: confirmText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not delete the course.");
      toast.success(`Deleted "${courseTitle}".`);
      router.push("/studio/courses");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the course.");
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Delete course</h2>

      {blockedMessage ? (
        <p className="text-xs text-muted-foreground">{blockedMessage}</p>
      ) : (
        <div className="p-5 rounded-2xl border border-destructive-border bg-destructive-subtle flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-destructive-text shrink-0 mt-0.5" />
            <p className="text-xs text-destructive-text/80">
              Nobody has played this draft yet, so it can be deleted. Its lessons, versions, runs, calls
              and images go with it. This cannot be undone.
            </p>
          </div>

          <button
            type="button"
            onClick={() => { reset(); setOpen(true); }}
            className="inline-flex items-center gap-2 self-start px-4 py-2 rounded-xl border border-destructive-border bg-card text-destructive-text hover:bg-destructive-subtle transition-colors text-sm font-medium cursor-pointer"
          >
            <Trash2 size={15} />
            Delete course
          </button>
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) { reset(); setOpen(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this course?</DialogTitle>
            <DialogDescription>
              This is permanent and cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="delete-course-confirm" className="text-xs text-muted-foreground">
              Type <span className="font-medium text-foreground">{courseTitle}</span> to confirm
            </label>
            <Input
              id="delete-course-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              placeholder={courseTitle}
            />
          </div>

          {error && <p className="text-sm text-destructive-text">{error}</p>}

          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="px-4 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={!armed || busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-white text-sm font-medium hover:bg-destructive-hover transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              {busy ? "Deleting…" : "Delete course"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
