"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, UserPlus } from "lucide-react";
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

type Editor = {
  userId: string;
  grantedAt: string;
  name: string | null;
};

/**
 * Admin-only panel for granting and revoking course-editor rights. Renders
 * exclusively behind the isAdmin gate in the page (the grant/revoke RPCs
 * themselves also require is_admin, so a spoofed render still 403s).
 *
 * The list is fetched client-side after mount rather than passed from the
 * server: no reason to pull the identity join into the server render just to
 * mirror it in local state after the first grant. All three verbs share a
 * simple refetch-on-success flow.
 */
export function CourseEditorsPanel({ slug }: { slug: string }) {
  const [editors, setEditors] = useState<Editor[] | null>(null);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The editor pending removal — its row's Remove button opens the AlertDialog;
  // confirming there calls revoke(); the "Cancel" closes the dialog.
  const [pendingRevoke, setPendingRevoke] = useState<Editor | null>(null);

  const refetch = useCallback(() => {
    return fetch(`/api/admin/courses/${slug}/editors`, { cache: "no-store" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) {
          setError((d?.error as string) ?? "Could not load editors.");
          return;
        }
        setEditors(d.editors as Editor[]);
        setError(null);
      })
      .catch(() => setError("Network error."));
  }, [slug]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/courses/${slug}/editors`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.message ?? data.error ?? "Grant failed.");
        return;
      }
      setEmail("");
      toast.success("Editor added.");
      await refetch();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function revoke(userId: string) {
    setPendingRevoke(null);
    try {
      const res = await fetch(`/api/admin/courses/${slug}/editors`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        toast.error(data.message ?? data.error ?? "Revoke failed.");
        return;
      }
      toast.success("Editor removed.");
      await refetch();
    } catch {
      toast.error("Network error.");
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Editors
      </h2>
      <p className="text-sm text-muted-foreground">
        Delegate content editing on this course to another user by email. They do not need database
        access; they cannot edit any other course.
      </p>

      <form onSubmit={grant} className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="author@example.com"
          disabled={saving}
          className="flex-1 min-w-[240px] px-3 py-2 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={saving || email.trim().length === 0}
          className="cursor-pointer disabled:cursor-not-allowed inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
        >
          <UserPlus size={15} /> {saving ? "Adding…" : "Add editor"}
        </button>
      </form>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-destructive-subtle border border-destructive-border text-sm text-destructive-text">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
        {editors === null ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : editors.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            No editors yet — only admins can edit this course.
          </div>
        ) : (
          editors.map((ed) => (
            <div key={ed.userId} className="flex items-center gap-3 p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {ed.name ?? ed.userId}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Granted {new Date(ed.grantedAt).toLocaleDateString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingRevoke(ed)}
                className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-destructive-text hover:bg-destructive-subtle transition-colors"
              >
                <Trash2 size={13} /> Remove
              </button>
            </div>
          ))
        )}
      </div>

      <AlertDialog
        open={pendingRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRevoke(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this editor?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRevoke?.name ?? "This user"} will no longer be able to edit this course.
              You can grant the right again at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRevoke) void revoke(pendingRevoke.userId);
              }}
              className="rounded-xl bg-destructive text-white hover:bg-destructive-hover"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
