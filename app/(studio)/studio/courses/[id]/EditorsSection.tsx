"use client";

import { useState } from "react";
import { toast } from "sonner";
import { UserMinus, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import type { AuthoredCourseDetail } from "@/lib/courseAuthoring";
import { postJson } from "./postJson";

export function EditorsSection({
  courseId,
  editors,
  onChanged,
}: {
  courseId: string;
  editors: AuthoredCourseDetail["editors"];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function grant() {
    if (!email.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await postJson(`/api/admin/courses/${courseId}/editors`, { email });
      setAdding(false);
      setEmail("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add editor.");
    } finally {
      setSaving(false);
    }
  }

  async function revoke(userId: string) {
    setPendingId(userId);
    try {
      await postJson(`/api/admin/courses/${courseId}/editors/${userId}`, undefined, "DELETE");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove editor.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Editors</h2>
        <button
          onClick={() => setAdding(true)}
          className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors"
        >
          <UserPlus className="size-3.5" />
          Add editor
        </button>
      </div>

      {editors.length === 0 ? (
        <p className="text-sm text-muted-foreground">No delegated editors — only admins can edit this course.</p>
      ) : (
        <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
          {editors.map((e) => (
            <div key={e.userId} className="flex items-center gap-3 px-4 py-3">
              <p className="flex-1 min-w-0 text-sm text-foreground truncate">
                {e.displayName || e.fullName || e.userId}
              </p>
              <button
                onClick={() => revoke(e.userId)}
                disabled={pendingId !== null}
                aria-label={`Remove ${e.displayName || e.fullName || "editor"}`}
                className="cursor-pointer disabled:cursor-not-allowed shrink-0 p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-destructive-text transition-colors disabled:opacity-50"
              >
                <UserMinus size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add editor</DialogTitle>
            <DialogDescription>They must already have a Colloquiz account.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              type="email"
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
            />
            {error && (
              <div className="px-3 py-2 rounded-lg bg-destructive-subtle border border-destructive-border text-sm text-destructive-text">
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <button
              onClick={() => setAdding(false)}
              className="cursor-pointer px-3 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={grant}
              disabled={saving || !email.trim()}
              className="cursor-pointer disabled:cursor-not-allowed px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {saving ? "Adding…" : "Add"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
