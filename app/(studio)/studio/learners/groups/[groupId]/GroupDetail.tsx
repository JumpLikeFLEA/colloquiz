"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2, UserMinus, UserPlus } from "lucide-react";
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
import { GROUP_EXPORT_NOTE, GROUP_NAME_MAX } from "@/lib/teacherGroups";
import { postJson } from "@/app/(studio)/studio/courses/[id]/postJson";
import { WriteArea } from "@/app/(studio)/studio/StudioWriteLock";

// TCH-002 (docs/decisions/0149) — one group: rename, delete, its members
// with Remove, and the linked students who are not in it yet with Add.
// Composed from the student-link panel's classes and AlertDialog confirms;
// no new tokens. "Linked" is decided in SQL (add_teacher_group_members).

const SECONDARY_BUTTON =
  "cursor-pointer inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const PRIMARY_BUTTON =
  "cursor-pointer inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export type GroupPerson = { userId: string; label: string };

function GroupDetailInner({
  groupId,
  name,
  members,
  candidates,
}: {
  groupId: string;
  name: string;
  members: GroupPerson[];
  candidates: GroupPerson[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(name);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function act(body: Record<string, unknown>, success: string, then?: () => void) {
    setBusy(true);
    try {
      await postJson("/api/studio/teacher-groups", { groupId, ...body });
      toast.success(success);
      then?.();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card px-4 py-3 space-y-2">
        <label htmlFor="group-name" className="text-sm font-semibold text-foreground">
          Name
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="group-name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={GROUP_NAME_MAX}
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
          />
          <button
            onClick={() => act({ action: "rename", name: draft }, "Group renamed.")}
            disabled={busy || !draft.trim() || draft.trim() === name}
            className={SECONDARY_BUTTON}
          >
            <Pencil className="size-4" />
            Rename
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{GROUP_EXPORT_NOTE}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">
          {members.length === 1 ? "1 student" : `${members.length} students`}
        </h2>
        {members.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No one in this group yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <li
                key={m.userId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card px-4 py-3"
              >
                <span className="text-sm font-semibold text-foreground break-all min-w-0">{m.label}</span>
                <button
                  onClick={() => act({ action: "remove", studentId: m.userId }, "Removed from the group.")}
                  disabled={busy}
                  className={SECONDARY_BUTTON}
                  aria-label={`Remove ${m.label} from the group`}
                >
                  <UserMinus className="size-4" />
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Add students</h2>
        {candidates.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Every student linked to you is already in this group, or no one has linked yet.
          </p>
        ) : (
          <div className="rounded-2xl border border-border bg-card px-4 py-3 space-y-3">
            <ul className="space-y-1">
              {candidates.map((c) => (
                <li key={c.userId}>
                  <label className="flex items-center gap-3 min-h-11 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={picked.has(c.userId)}
                      onChange={() => toggle(c.userId)}
                      className="size-4 accent-brand"
                    />
                    <span className="text-sm text-foreground break-all min-w-0">{c.label}</span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              onClick={() =>
                act({ action: "add", studentIds: [...picked] }, "Added to the group.", () => setPicked(new Set()))
              }
              disabled={busy || picked.size === 0}
              className={PRIMARY_BUTTON}
            >
              <UserPlus className="size-4" />
              {picked.size > 0 ? `Add ${picked.size} to group` : "Add to group"}
            </button>
            <p className="text-xs text-muted-foreground">{GROUP_EXPORT_NOTE}</p>
          </div>
        )}
      </section>

      <section className="pt-2">
        <button onClick={() => setConfirmDelete(true)} disabled={busy} className={SECONDARY_BUTTON}>
          <Trash2 className="size-4" />
          Delete group
        </button>
      </section>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The group is removed. The students stay linked to you and in your other groups. It can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => act({ action: "delete" }, "Group deleted.", () => router.push("/studio/learners/groups"))}
            >
              Delete group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// TCH-008 (docs/decisions/0155): a frozen seat disables everything inside, with the
// reason as the tooltip; unfrozen, this renders exactly the component above.
export function GroupDetail(props: React.ComponentProps<typeof GroupDetailInner>) {
  return (
    <WriteArea>
      <GroupDetailInner {...props} />
    </WriteArea>
  );
}
