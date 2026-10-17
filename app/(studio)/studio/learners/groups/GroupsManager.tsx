"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Users } from "lucide-react";
import { GROUP_EXPORT_NOTE, GROUP_NAME_MAX, type TeacherGroup } from "@/lib/teacherGroups";
import { postJson } from "@/app/(studio)/studio/courses/[id]/postJson";
import { WriteArea } from "@/app/(studio)/studio/StudioWriteLock";

// TCH-002 (docs/decisions/0149) — the teacher's groups: a create field and
// one row per group, linking to its page. Composed from the student-link
// panel's classes; no new tokens. Who may create a group, and the name rules,
// are decided in SQL (077); this relays and shows the message.

const PRIMARY_BUTTON =
  "cursor-pointer inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

function GroupsManagerInner({ groups }: { groups: TeacherGroup[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const data = (await postJson("/api/studio/teacher-groups", { action: "create", name })) as { id: string };
      toast.success("Group created.");
      setName("");
      router.push(`/studio/learners/groups/${data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the group.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="rounded-2xl border border-border bg-card px-4 py-3 space-y-2">
        <label htmlFor="new-group-name" className="text-sm font-semibold text-foreground">
          New group
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="new-group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={GROUP_NAME_MAX}
            placeholder="Group name"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
          />
          <button type="submit" disabled={busy || !name.trim()} className={PRIMARY_BUTTON}>
            <Plus className="size-4" />
            Create group
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{GROUP_EXPORT_NOTE}</p>
      </form>

      {groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No groups yet. A group collects students linked to you, to filter Learners and, later, to assign homework.
        </p>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => (
            <li key={g.id}>
              <Link
                href={`/studio/learners/groups/${g.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 hover:bg-accent transition-colors"
              >
                <span className="text-sm font-semibold text-foreground break-all">{g.name}</span>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                  <Users className="size-3.5" aria-hidden />
                  {g.memberCount === 1 ? "1 student" : `${g.memberCount} students`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// TCH-008 (docs/decisions/0155): a frozen seat disables everything inside, with the
// reason as the tooltip; unfrozen, this renders exactly the component above.
export function GroupsManager(props: React.ComponentProps<typeof GroupsManagerInner>) {
  return (
    <WriteArea>
      <GroupsManagerInner {...props} />
    </WriteArea>
  );
}
