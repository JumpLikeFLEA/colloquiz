/**
 * Deleting a draft course (AUTH-018, docs/decisions/0125 Decision 8, 0129).
 * Pure: the blocker copy the course editor shows, and the path rule the
 * DELETE route applies before it removes anything from the lesson-images
 * bucket with the service role.
 *
 * The blocker codes are course_delete_blockers()'s (migration 068); SQL
 * decides whether a course is deletable, and this file only names why not.
 */

export const COURSE_DELETE_BLOCKERS = [
  "published",
  "entitlements",
  "enrolments",
  "invites",
  "recordings",
  "final_comments",
  "attempts",
  "opens",
  "signups",
  "pending_claims",
] as const;

export type CourseDeleteBlocker = (typeof COURSE_DELETE_BLOCKERS)[number];

const BLOCKER_COPY: Record<CourseDeleteBlocker, string> = {
  published: "it is published. Unpublish it first",
  entitlements: "a learner has been given access to it",
  enrolments: "a learner has joined one of its runs",
  invites: "one of its runs has an invite",
  recordings: "a learner has sent a recording in it",
  final_comments: "a learner has a final comment in it",
  attempts: "a learner has answered its exercises",
  opens: "a learner has opened one of its lessons",
  signups: "a learner signed up from it",
  pending_claims: "a new sign-up is about to save answers from it",
};

/**
 * One sentence naming the first blocker: the muted line under "Delete
 * course". The first is enough to act on; "published" leads the SQL order
 * because it is the one the author can fix.
 */
export function courseDeleteBlockedMessage(blockers: readonly string[]): string | null {
  if (blockers.length === 0) return null;
  const known = blockers.find((b): b is CourseDeleteBlocker => b in BLOCKER_COPY);
  return known
    ? `This course can't be deleted because ${BLOCKER_COPY[known]}.`
    : "This course can't be deleted.";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The lesson-images object paths to remove for a deleted course, from a
 * Storage list() of its folder. Throws unless the course id is a UUID, so
 * the folder can never be "", "/" or another course's prefix. Every
 * returned path is exactly "<courseId>/<file>": a nested folder entry or a
 * name with a slash or ".." is skipped, never removed.
 */
export function courseImageObjectPaths(courseId: string, entries: readonly { name: string }[]): string[] {
  if (!UUID_RE.test(courseId)) {
    throw new Error(`Refusing to purge lesson images: "${courseId}" is not a course id`);
  }
  return entries
    .map((e) => e.name)
    .filter((name) => name.length > 0 && !name.includes("/") && name !== "." && name !== "..")
    .map((name) => `${courseId}/${name}`);
}
