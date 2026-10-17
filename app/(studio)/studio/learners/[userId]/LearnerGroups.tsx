"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GROUP_EXPORT_NOTE } from "@/lib/teacherGroups";
import { postJson } from "@/app/(studio)/studio/courses/[id]/postJson";
import { WriteArea } from "@/app/(studio)/studio/StudioWriteLock";

// TCH-002 (docs/decisions/0149) — add this linked student to, or remove them
// from, the teacher's groups. One checkbox per group; each toggle is one call
// to the groups route (add/remove RPCs, 077). Composed from the group page's
// classes; no new tokens.

function LearnerGroupsInner({
  studentId,
  groups,
  memberOf,
}: {
  studentId: string;
  groups: { id: string; name: string }[];
  memberOf: string[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const member = new Set(memberOf);

  async function toggle(groupId: string, add: boolean) {
    setBusyId(groupId);
    try {
      await postJson(
        "/api/studio/teacher-groups",
        add ? { action: "add", groupId, studentIds: [studentId] } : { action: "remove", groupId, studentId },
      );
      toast.success(add ? "Added to the group." : "Removed from the group.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-2" data-studio="learner-groups">
      <h2 className="text-sm font-semibold text-foreground">Groups</h2>
      {groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          You have no groups yet.{" "}
          <Link href="/studio/learners/groups" className="underline hover:text-foreground">
            Create one
          </Link>
          .
        </p>
      ) : (
        <div className="rounded-2xl border border-border bg-card px-4 py-3 space-y-2">
          <ul className="space-y-1">
            {groups.map((g) => (
              <li key={g.id}>
                <label className="flex items-center gap-3 min-h-11 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={member.has(g.id)}
                    disabled={busyId !== null}
                    onChange={(e) => toggle(g.id, e.target.checked)}
                    className="size-4 accent-brand"
                  />
                  <span className="text-sm text-foreground break-all min-w-0">{g.name}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{GROUP_EXPORT_NOTE}</p>
        </div>
      )}
    </section>
  );
}

// TCH-008 (docs/decisions/0155): a frozen seat disables everything inside, with the
// reason as the tooltip; unfrozen, this renders exactly the component above.
export function LearnerGroups(props: React.ComponentProps<typeof LearnerGroupsInner>) {
  return (
    <WriteArea>
      <LearnerGroupsInner {...props} />
    </WriteArea>
  );
}
