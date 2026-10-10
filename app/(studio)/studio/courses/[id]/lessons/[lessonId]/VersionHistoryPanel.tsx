"use client";

import type { LessonVersionSummary } from "@/lib/lessonContentAuthoring";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";

// Version history (AUTH-002 acceptance): every lesson_versions row is an
// append-only save (migration 041) — this lists them and lets any one of
// them be restored, which the parent (LessonContentEditor) implements by
// loading that version's document and immediately saving it again as a new
// version, never by mutating the old row.

export function VersionHistoryPanel({
  open,
  onOpenChange,
  versions,
  currentVersionId,
  onRestore,
  restoringId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versions: LessonVersionSummary[];
  currentVersionId: string | null;
  onRestore: (versionId: string) => void;
  restoringId: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>
            Every save is kept. Restoring an older version creates a new draft from it — it does not delete
            anything.
          </DialogDescription>
        </DialogHeader>
        {versions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No saved versions yet.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto divide-y divide-border">
            {versions.map((v) => {
              const isCurrent = v.id === currentVersionId;
              return (
                <div key={v.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">
                      {new Date(v.createdAt).toLocaleString()}
                      {isCurrent && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-brand-subtle text-brand-text">
                          Current
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {v.source === "import" ? "Imported" : "Saved"}
                      {v.authorFullName || v.authorDisplayName
                        ? ` by ${v.authorFullName ?? v.authorDisplayName}`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRestore(v.id)}
                    disabled={isCurrent || restoringId !== null}
                    className="cursor-pointer disabled:cursor-not-allowed shrink-0 px-2.5 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-accent disabled:opacity-50 transition-colors"
                  >
                    {restoringId === v.id ? "Restoring…" : "Restore as draft"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
