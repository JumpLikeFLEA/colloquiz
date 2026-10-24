import type { AuthoredCourse } from "@/lib/courseAuthoring";

// TCH-015 (docs/decisions/0206 Decisions 1, 3-6) — the "Get started" checklist
// on /studio, computed from reads Studio already makes. Pure: the page
// gathers the facts, this decides which steps are ticked, which phase shows
// and where each step leads. Nothing is stored (Decision 5).

export type ChecklistFacts = {
  /** The courses the caller edits (listAuthoredCourses). */
  courses: Pick<
    AuthoredCourse,
    "id" | "title" | "status" | "lessonCount" | "subtitle" | "coverImageUrl" | "createdAt"
  >[];
  /** getJoinLinkState().exists */
  hasStudentLink: boolean;
  linkedStudentCount: number;
  /** A cohort invite of one of their courses has been claimed. */
  hasClaimedInvite: boolean;
  /** getTeacherHomework().length > 0 */
  hasHomework: boolean;
  canImport: boolean;
  /** Any inbox section has a row (the page computes it). */
  inboxHasItems: boolean;
};

export type ChecklistStepId =
  | "create"
  | "lesson"
  | "publish"
  | "invite"
  | "cover"
  | "access"
  | "preview"
  | "homework";

export type ChecklistStep = {
  id: ChecklistStepId;
  label: string;
  /** One line under the label. */
  detail: string;
  /** null: a link only, never ticked (0206 Decision 3). */
  done: boolean | null;
  /** The article behind the "How?" link; must exist in GUIDE_ARTICLES. */
  article: string;
  href: string;
  action: string;
};

export type Checklist =
  | { phase: "hidden" }
  | {
      /** "full": core steps not all ticked. "setup": core done, extras left. */
      phase: "full" | "setup";
      focus: { id: string; title: string } | null;
      core: ChecklistStep[];
      extras: ChecklistStep[];
    };

/** The course the course steps follow (Decision 4): the oldest published
 * course, else the newest draft. */
export function focusCourse<T extends Pick<AuthoredCourse, "status" | "createdAt">>(courses: T[]): T | null {
  const byDate = (a: T, b: T) => a.createdAt.localeCompare(b.createdAt);
  const published = courses.filter((c) => c.status === "published").sort(byDate);
  if (published.length > 0) return published[0];
  const drafts = courses.filter((c) => c.status === "draft").sort(byDate);
  return drafts.length > 0 ? drafts[drafts.length - 1] : null;
}

export function buildChecklist(f: ChecklistFacts): Checklist {
  const focus = focusCourse(f.courses);
  const courseHref = focus ? `/studio/courses/${focus.id}` : "/studio/courses";

  const core: ChecklistStep[] = [
    {
      id: "create",
      label: "Create a course",
      detail: f.canImport ? "Start from scratch, or import a file." : "Give it a title.",
      done: focus !== null,
      article: "create-a-course",
      href: "/studio/courses",
      action: "Courses",
    },
    {
      id: "lesson",
      label: "Add a lesson",
      detail: "Theory and an exercise or two.",
      done: focus !== null && focus.lessonCount > 0,
      article: "lessons-and-exercises",
      href: courseHref,
      action: "Open course",
    },
    {
      id: "publish",
      label: "Publish the course",
      detail: "Needs a cover, a summary and a lesson open to anyone.",
      done: focus !== null && focus.status === "published",
      article: "publish",
      href: courseHref,
      action: "Open course",
    },
    {
      id: "invite",
      label: "Invite students",
      detail: "Make your student link and send it.",
      done: f.hasStudentLink || f.linkedStudentCount > 0 || f.hasClaimedInvite,
      article: "your-student-link",
      href: "/studio/learners",
      action: "Learners",
    },
  ];

  const extras: ChecklistStep[] = [
    {
      id: "cover",
      label: "Add a cover and a summary",
      detail: "How the course looks on its card.",
      done: focus !== null && !!focus.coverImageUrl && !!focus.subtitle,
      article: "cover-and-summary",
      href: courseHref,
      action: "Open course",
    },
    {
      id: "preview",
      label: "Preview a lesson as a learner",
      detail: "Open it from the lesson editor.",
      done: null,
      article: "preview",
      href: courseHref,
      action: "Open course",
    },
    {
      id: "access",
      label: "Choose who can open each lesson",
      detail: "Optional: the default works.",
      done: null,
      article: "access-levels",
      href: courseHref,
      action: "Open course",
    },
    {
      id: "homework",
      label: "Assign homework",
      detail: "A lesson or a course, with an optional due date.",
      done: f.hasHomework,
      article: "homework",
      href: "/studio/homework",
      action: "Homework",
    },
  ];

  const focusRef = focus && { id: focus.id, title: focus.title };
  if (!core.every((s) => s.done === true)) return { phase: "full", focus: focusRef, core, extras };

  // Core is ticked: the card collapses, and goes once the extras that can be
  // ticked are, or once real work has arrived in the inbox (Decision 5).
  const tickable = extras.filter((s) => s.done !== null);
  if (f.inboxHasItems || tickable.every((s) => s.done === true)) return { phase: "hidden" };
  return { phase: "setup", focus: focusRef, core, extras: extras.filter((s) => s.done !== true) };
}
