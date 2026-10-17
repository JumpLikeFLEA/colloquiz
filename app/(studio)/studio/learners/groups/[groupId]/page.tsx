import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { canEnterStudio, getCourseAccess } from "@/lib/courseAccess";
import { getLinkedStudents } from "@/lib/teacherLinksServer";
import { getCalendarEvents } from "@/lib/calendarEventsServer";
import { eventsForGroup } from "@/lib/calendarEvents";
import { CalendarEventsSection } from "@/app/(studio)/studio/CalendarEvents";
import { WriteArea } from "@/app/(studio)/studio/StudioWriteLock";
import { getGroupMemberRows, getTeacherGroups } from "@/lib/teacherGroupsServer";
import { membersByGroup } from "@/lib/teacherGroups";
import { homeworkForGroup } from "@/lib/homework/homework";
import { AssignHomeworkButton } from "../../../homework/AssignHomework";
import { loadAssignContext, loadHomeworkViews } from "../../../homework/data";
import { HomeworkSummary } from "../../../homework/HomeworkSummary";
import { GroupDetail } from "./GroupDetail";

// /studio/learners/groups/[groupId] — one group (TCH-002, docs/decisions/
// 0149). A group that is not the caller's is not in teacher_groups_list(),
// so it 404s, the same page an unknown id gets.

export const metadata = { title: "Group" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const access = await getCourseAccess();
  if (!canEnterStudio(access)) notFound();

  const { groupId } = await params;
  if (!UUID.test(groupId)) notFound();
  const id = groupId.toLowerCase();

  const [groups, memberRows, students, assignCtx, homework, events] = await Promise.all([
    getTeacherGroups(),
    getGroupMemberRows(),
    getLinkedStudents(),
    loadAssignContext(),
    loadHomeworkViews(),
    getCalendarEvents(),
  ]);
  const group = groups.find((g) => g.id === id);
  if (!group) notFound();

  const memberIds = membersByGroup(memberRows).get(id) ?? new Set<string>();
  const person = (s: (typeof students)[number]) => ({ userId: s.userId, label: s.label || "Unnamed learner" });
  const members = students.filter((s) => memberIds.has(s.userId)).map(person);
  const candidates = students.filter((s) => !memberIds.has(s.userId)).map(person);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="space-y-1">
        <Link
          href="/studio/learners/groups"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={12} aria-hidden />
          Groups
        </Link>
        <h1 className="text-2xl font-bold text-foreground break-all">{group.name}</h1>
      </div>
      <HomeworkSummary
        title="Homework"
        homework={homeworkForGroup(homework.views, id)}
        empty="Nothing assigned to this group yet."
        today={new Date()}
        action={
          <AssignHomeworkButton
            courses={assignCtx.courses}
            students={assignCtx.students}
            groups={assignCtx.groups}
            preset={{ groupId: id }}
          />
        }
      />
      {/* COH-014: dated events (084), seen by this group's students. */}
      <section className="rounded-2xl border border-border bg-card px-4 py-3">
        <WriteArea>
          <CalendarEventsSection scope={{ kind: "group", groupId: id }} events={eventsForGroup(events, id)} />
        </WriteArea>
      </section>
      <GroupDetail groupId={id} name={group.name} members={members} candidates={candidates} />
    </div>
  );
}
