import Link from "next/link";
import { notFound } from "next/navigation";
import { getCourseAccess } from "@/lib/courseAccess";
import { createClient } from "@/lib/supabase/server";
import {
  countLearners,
  parseLearnerFilters,
  rosterFilterOptions,
  scopeRoster,
  toRosterRow,
} from "@/lib/learners/roster";
import { getJoinLinkState, getLinkedStudents } from "@/lib/teacherLinksServer";
import { getGroupMemberRows, getTeacherGroups } from "@/lib/teacherGroupsServer";
import { membersByGroup } from "@/lib/teacherGroups";
import { LocalTimeZone } from "@/app/(studio)/studio/courses/[id]/LocalTime";
import { LearnerCard } from "./LearnerCard";
import { LearnerFilters } from "./LearnerFilters";
import { StudentLinksPanel } from "./StudentLinksPanel";

// /studio/learners — the roster (AUTH-011, docs/decisions/0109 Decision 8,
// 0116). Who may see which learner is decided in SQL: learner_roster()
// (063) returns only courses the caller edits (can_edit_course).
// getCourseAccess() here is the page gate (the Studio layout's too), not
// the data boundary.
//
// The page reads the roster unfiltered and narrows it with lib/learners,
// the review queue's pattern (0114 Decision 4): the filter menus need the
// unfiltered rows.

export const metadata = { title: "Learners" };

export default async function LearnersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { isAdmin, editableCourseIds } = await getCourseAccess();
  if (!isAdmin && editableCourseIds.length === 0) notFound();

  const filters = parseLearnerFilters(await searchParams);
  const supabase = await createClient();
  const [{ data, error }, linkState, allLinkedStudents, groups, memberRows] = await Promise.all([
    supabase.rpc("learner_roster"),
    getJoinLinkState(),
    getLinkedStudents(),
    getTeacherGroups(),
    getGroupMemberRows(),
  ]);
  if (error) throw new Error(error.message);
  // TCH-001: the roster is activity-derived and unchanged; a linked student
  // is a separate, explicit relationship (0141 Decision 3), so the panel
  // lists them whether or not they appear in it.
  const linkedIds = new Set(allLinkedStudents.map((s) => s.userId));
  // TCH-002: the Group filter narrows the roster and the linked list to one
  // of the caller's own groups. A group id that isn't theirs has no members
  // here, so it shows nobody rather than everybody.
  const groupMembers = filters.group ? (membersByGroup(memberRows).get(filters.group) ?? new Set<string>()) : null;
  const linkedStudents = groupMembers
    ? allLinkedStudents.filter((s) => groupMembers.has(s.userId))
    : allLinkedStudents;

  const allRows = ((data ?? []) as Record<string, unknown>[]).map(toRosterRow);
  const options = rosterFilterOptions(allRows, filters.course);
  const rows = scopeRoster(allRows, filters, groupMembers);
  const people = countLearners(rows);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Learners</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Signed-in learners of the courses you edit: where they came from and what they have done.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Visitors who never sign in aren&apos;t listed: their progress stays on their device. Times are in your
            timezone (<LocalTimeZone />).
          </p>
        </div>
        {(allRows.length > 0 || groups.length > 0) && (
          <LearnerFilters filters={filters} options={options} groups={groups.map((g) => ({ id: g.id, name: g.name }))} />
        )}
        {linkState && (
          <Link
            href="/studio/learners/groups"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            {groups.length === 0 ? "Groups" : `Groups (${groups.length})`}
          </Link>
        )}
      </div>

      {linkState && <StudentLinksPanel linkState={linkState} students={linkedStudents} />}

      {allRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border text-sm text-center px-4">
          No learners yet. A learner appears here once they open a lesson while signed in, or join a run.
        </div>
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            {people === 1 ? "1 learner" : `${people} learners`}
          </h2>
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground rounded-2xl border border-dashed border-border text-sm text-center px-4">
              Nobody matches these filters.
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <LearnerCard
                  key={`${row.courseId}:${row.userId}:${row.enrolmentId ?? "none"}`}
                  row={row}
                  linked={linkedIds.has(row.userId)}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
