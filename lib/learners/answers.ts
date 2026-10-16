import { answerText, type AnswerText } from "./answerText";

/**
 * Rows of linked_student_attempts() and linked_student_lesson_scores() (078,
 * docs/decisions/0150) grouped for the Studio learner page. Who may see them
 * is decided in SQL; this only lays them out. The best score is
 * lesson_completion()'s (075) and is passed through, never recomputed.
 */

export type AttemptRow = {
  attemptId: string;
  courseId: string;
  lessonId: string;
  versionId: string;
  blockId: string;
  earned: number;
  possible: number;
  response: unknown;
  createdAt: string;
  block: unknown;
};

export type LessonScoreRow = {
  courseId: string;
  lessonId: string;
  bestPercent: number | null;
  complete: boolean;
  answered: number;
  total: number;
};

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

export function toAttemptRow(r: Record<string, unknown>): AttemptRow {
  return {
    attemptId: r.attempt_id as string,
    courseId: r.course_id as string,
    lessonId: r.lesson_id as string,
    versionId: r.lesson_version_id as string,
    blockId: r.block_id as string,
    earned: num(r.earned),
    possible: num(r.possible),
    response: r.response ?? null,
    createdAt: r.created_at as string,
    block: r.block ?? null,
  };
}

export function toLessonScoreRow(r: Record<string, unknown>): LessonScoreRow {
  return {
    courseId: r.course_id as string,
    lessonId: r.lesson_id as string,
    bestPercent: r.best_percent == null ? null : num(r.best_percent),
    complete: Boolean(r.complete),
    answered: num(r.exercises_answered),
    total: num(r.exercises_total),
  };
}

export type AttemptView = {
  attemptId: string;
  createdAt: string;
  earned: number;
  possible: number;
  answer: AnswerText;
};

/** One exercise of one version, with every attempt, oldest first. */
export type ExerciseAttempts = {
  key: string;
  blockId: string;
  /** The exercise as a number among this lesson's exercises, by first attempt. */
  number: number;
  attempts: AttemptView[];
};

export type LessonAnswers = {
  lessonId: string;
  score: LessonScoreRow | null;
  exercises: ExerciseAttempts[];
};

/** Attempts grouped by lesson, then by (version, block). A block keeps its
 * own version's item, so an answer is read against what the learner saw. */
export function groupAnswers(attempts: AttemptRow[], scores: LessonScoreRow[]): Map<string, LessonAnswers> {
  const scoreOf = new Map(scores.map((s) => [s.lessonId, s]));
  const byLesson = new Map<string, Map<string, AttemptRow[]>>();
  for (const a of attempts) {
    const lesson = byLesson.get(a.lessonId) ?? new Map<string, AttemptRow[]>();
    const key = `${a.versionId}:${a.blockId}`;
    lesson.set(key, [...(lesson.get(key) ?? []), a]);
    byLesson.set(a.lessonId, lesson);
  }
  const out = new Map<string, LessonAnswers>();
  for (const [lessonId, blocks] of byLesson) {
    const exercises = [...blocks.entries()]
      .map(([key, rows]) => ({ key, rows: [...rows].sort((x, y) => x.createdAt.localeCompare(y.createdAt)) }))
      .sort((x, y) => x.rows[0].createdAt.localeCompare(y.rows[0].createdAt))
      .map(({ key, rows }, i) => ({
        key,
        blockId: rows[0].blockId,
        number: i + 1,
        attempts: rows.map((r) => ({
          attemptId: r.attemptId,
          createdAt: r.createdAt,
          earned: r.earned,
          possible: r.possible,
          answer: answerText(r.block, r.response),
        })),
      }));
    out.set(lessonId, { lessonId, score: scoreOf.get(lessonId) ?? null, exercises });
  }
  return out;
}

/** A course and the lessons whose answers can be listed under it. */
export type AnswerCourse = {
  courseId: string;
  courseTitle: string;
  lessons: { lessonId: string; lessonTitle: string; lessonOrdinal: number }[];
};

/** A row of linked_student_assigned_lessons() (080). */
export type AssignedLessonRow = {
  course_id: string;
  course_title: string;
  lesson_id: string;
  lesson_title: string;
  lesson_ordinal: number;
};

/**
 * The lessons the teacher edits (learner_lessons, 064) plus the lessons they
 * only assigned (080), as the courses the Answers section lists. A lesson
 * already present is not added twice; a course not yet present is appended in
 * the SQL order. Which lessons may be read is decided in SQL: this only titles
 * the ones the reader returns.
 */
export function mergeAssignedLessons(edited: readonly AnswerCourse[], assigned: readonly AssignedLessonRow[]): AnswerCourse[] {
  const out = new Map<string, AnswerCourse>(edited.map((c) => [c.courseId, { ...c, lessons: [...c.lessons] }]));
  for (const r of assigned) {
    const course = out.get(r.course_id) ?? { courseId: r.course_id, courseTitle: r.course_title, lessons: [] };
    if (!course.lessons.some((l) => l.lessonId === r.lesson_id)) {
      course.lessons.push({ lessonId: r.lesson_id, lessonTitle: r.lesson_title, lessonOrdinal: num(r.lesson_ordinal) });
    }
    out.set(r.course_id, course);
  }
  return [...out.values()];
}
