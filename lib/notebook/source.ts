import type { ReadableCourse, ReadableLesson } from "./types";

/**
 * Where a row came from (0236 section 1, "Staying readable"): the current title when the caller can
 * read it, else the title stored with the row. A lesson links only when it and its course are
 * readable and it is not archived (its page is gone).
 */
export type NotebookSource = { courseTitle: string | null; lessonTitle: string | null; href: string | null };

export type SourceRow = {
  courseId: string | null;
  lessonId: string | null;
  courseTitle: string | null;
  lessonTitle: string | null;
};

export type SourceIndex = {
  courses: ReadonlyMap<string, ReadableCourse>;
  lessons: ReadonlyMap<string, ReadableLesson>;
};

export function sourceIndex(courses: readonly ReadableCourse[], lessons: readonly ReadableLesson[]): SourceIndex {
  return { courses: new Map(courses.map((c) => [c.id, c])), lessons: new Map(lessons.map((l) => [l.id, l])) };
}

export function rowSource(row: SourceRow, index: SourceIndex): NotebookSource {
  const course = row.courseId ? index.courses.get(row.courseId) : undefined;
  const lesson = row.lessonId ? index.lessons.get(row.lessonId) : undefined;
  return {
    courseTitle: course?.title ?? row.courseTitle,
    lessonTitle: lesson?.title ?? row.lessonTitle,
    href: course && lesson && !lesson.archived ? `/courses/${course.slug}/${lesson.slug}` : null,
  };
}
