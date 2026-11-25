import { newestFirst } from "./newest";
import type { TryRow } from "./toTry";
import type { NotebookEntry, ReadableCourse } from "./types";

export type CourseChip = { courseId: string; title: string | null };

/** One chip per course with a row in any tab: stored entries' courses newest first, then To try's.
 * The current title when readable, else the newest stored one. A row with no course (an own note
 * written on the notebook page, or one whose draft course was deleted) is under All courses only. */
export function courseChips(
  entries: readonly NotebookEntry[],
  toTry: readonly TryRow[],
  courses: ReadonlyMap<string, ReadableCourse>,
): CourseChip[] {
  const stored = new Map<string, string | null>();
  for (const e of newestFirst(entries, (x) => x.createdAt)) {
    if (e.courseId && !stored.has(e.courseId)) stored.set(e.courseId, e.courseTitle);
  }
  for (const t of toTry) if (!stored.has(t.courseId)) stored.set(t.courseId, null);
  return [...stored].map(([courseId, title]) => ({ courseId, title: courses.get(courseId)?.title ?? title }));
}

/** `?course=` (a course id), allow-listed against the chips: anything else is All courses (null). */
export function parseCourse(raw: unknown, chips: readonly CourseChip[]): string | null {
  return chips.find((c) => c.courseId === raw)?.courseId ?? null;
}
