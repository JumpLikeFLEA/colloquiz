import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCourseAccess } from "@/lib/courseAccess";
import { getTeacherGroups } from "@/lib/teacherGroupsServer";
import { GroupsManager } from "./GroupsManager";

// /studio/learners/groups — the teacher's private groups of linked students
// (TCH-002, docs/decisions/0149). Whose groups come back is decided in SQL:
// teacher_groups_list() (077) is scoped to the caller.

export const metadata = { title: "Groups" };

export default async function GroupsPage() {
  const { isAdmin, editableCourseIds } = await getCourseAccess();
  if (!isAdmin && editableCourseIds.length === 0) notFound();

  const groups = await getTeacherGroups();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="space-y-1">
        <Link
          href="/studio/learners"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={12} aria-hidden />
          Learners
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Groups</h1>
        <p className="text-sm text-muted-foreground">
          Private to you. Only students linked to you can be in a group, and a student who leaves or is removed
          leaves your groups.
        </p>
      </div>
      <GroupsManager groups={groups} />
    </div>
  );
}
