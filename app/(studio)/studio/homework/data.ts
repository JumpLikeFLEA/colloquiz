import { cache } from "react";
import { getLinkedStudents } from "@/lib/teacherLinksServer";
import { getTeacherGroups } from "@/lib/teacherGroupsServer";
import { buildHomeworkViews, type HomeworkView } from "@/lib/homework/homework";
import {
  getAssignableCourses,
  getHomeworkProgress,
  getHomeworkTargets,
  getTeacherHomework,
} from "@/lib/homework/homeworkServer";
import type { AssignGroup, AssignPerson } from "./AssignHomework";

// TCH-005 — the data Studio's homework surfaces share (docs/decisions/0152).
// Every read is a SECURITY DEFINER function scoped to the caller (080); this
// only composes them. cache(): the page and its siblings in one request share
// one set of reads.

export const studentLabel = (label: string) => label || "Unnamed learner";

/** Everything the assign dialog needs: offerable courses, linked students, groups. */
export const loadAssignContext = cache(async () => {
  const [courses, linked, groups] = await Promise.all([getAssignableCourses(), getLinkedStudents(), getTeacherGroups()]);
  const students: AssignPerson[] = linked.map((s) => ({ userId: s.userId, label: studentLabel(s.label) }));
  const groupList: AssignGroup[] = groups.map((g) => ({ id: g.id, name: g.name }));
  return { courses, students, groups: groupList };
});

/** The caller's assignments with targets and per-recipient progress. */
export const loadHomeworkViews = cache(async (): Promise<{ views: HomeworkView[]; labelOf: (id: string) => string; groupNames: Map<string, string> }> => {
  const [list, targets, progress, linked, groups] = await Promise.all([
    getTeacherHomework(),
    getHomeworkTargets(),
    getHomeworkProgress(),
    getLinkedStudents(),
    getTeacherGroups(),
  ]);
  const labels = new Map(linked.map((s) => [s.userId, studentLabel(s.label)]));
  const labelOf = (id: string) => labels.get(id) ?? "Unnamed learner";
  return {
    views: buildHomeworkViews(list, targets, progress, labelOf),
    labelOf,
    groupNames: new Map(groups.map((g) => [g.id, g.name])),
  };
});

