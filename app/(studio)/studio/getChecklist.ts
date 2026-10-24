import { listAuthoredCourses } from "@/lib/courseAuthoring";
import type { CourseAccess } from "@/lib/courseAccess";
import { getTeacherHomework } from "@/lib/homework/homeworkServer";
import { buildChecklist, type Checklist } from "@/lib/studioGuide/checklist";
import { getCourseRunInvites } from "@/lib/runInvitesServer";
import { getJoinLinkState, getLinkedStudents } from "@/lib/teacherLinksServer";
import type { StudioWriteState } from "@/lib/studioWriteLock";

// TCH-015 (docs/decisions/0206 Decision 6). Who sees the checklist, and the
// reads behind its ticks. Every read is one Studio already makes (the course
// list, the join-link state, the linked students, the homework list, a
// course's invites); nothing is stored and nothing new is asked of the
// database. A failed read hides the card instead of ticking on a guess.

const HIDDEN: Checklist = { phase: "hidden" };

export async function getChecklist(opts: {
  access: CourseAccess;
  writeState: StudioWriteState;
  canImport: boolean;
  inboxHasItems: boolean;
}): Promise<Checklist> {
  const { access, writeState } = opts;
  // A seat holder who can write. Hidden for an admin (they list every course,
  // so no course is "theirs" to follow) and for a grantee with no seat; hidden
  // while the seat is lapsed, where the read-only banner already explains.
  if (access.isAdmin || !writeState.hasSeat || !writeState.canWrite) return HIDDEN;

  try {
    const courses = await listAuthoredCourses(access.editableCourseIds);
    const [link, linked, homework] = await Promise.all([getJoinLinkState(), getLinkedStudents(), getTeacherHomework()]);
    const hasStudentLink = link?.exists === true;

    // The invites are the costly read (one call per course), so they are only
    // asked when nothing else has ticked "invite" already.
    let hasClaimedInvite = false;
    if (!hasStudentLink && linked.length === 0) {
      const lists = await Promise.all(courses.map((c) => getCourseRunInvites(c.id)));
      hasClaimedInvite = lists.some((l) => l.some((i) => i.state === "claimed"));
    }

    return buildChecklist({
      courses,
      hasStudentLink,
      linkedStudentCount: linked.length,
      hasClaimedInvite,
      hasHomework: homework.length > 0,
      canImport: opts.canImport,
      inboxHasItems: opts.inboxHasItems,
    });
  } catch (e) {
    console.error("Studio checklist: a read failed", e);
    return HIDDEN;
  }
}
