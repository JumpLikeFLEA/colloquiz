import { InlineContentSchema } from "./lessons/inline";
import { inlinePlainText } from "./lessons/plainText";

/**
 * The Studio course stats page (AUTH-014, docs/decisions/0109 Decision 9,
 * 0121). Rows come from course_stats() (migration 065), which decides who
 * may see the course and computes every value, including the 5-learner
 * threshold below which an average is NULL. This module only parses and
 * groups rows for the page: no rule lives here.
 */

/** Copy only: the threshold is enforced in course_stats() (065). */
export const AVERAGE_MIN_LEARNERS = 5;

export type ExerciseStat = {
  blockId: string;
  /** 1-based position among the lesson's practice blocks. */
  number: number;
  type: string;
  promptText: string;
  learners: number;
  /** 0..1, or null below the threshold. */
  average: number | null;
};

export type LessonStat = {
  lessonId: string;
  title: string;
  ordinal: number;
  week: number | null;
  opened: number;
  attempted: number;
  exercises: ExerciseStat[];
};

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

function promptText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  const parsed = InlineContentSchema.safeParse(raw);
  return parsed.success ? inlinePlainText(parsed.data) : "";
}

/** RPC rows (one per lesson × practice block, in lesson then block order)
 * → lessons with their exercises. A row with a NULL block_id is a lesson
 * with no practice block. */
export function groupCourseStats(rows: readonly Record<string, unknown>[]): LessonStat[] {
  const out = new Map<string, LessonStat>();
  for (const r of rows) {
    const lessonId = r.lesson_id as string;
    let l = out.get(lessonId);
    if (!l) {
      l = {
        lessonId,
        title: r.lesson_title as string,
        ordinal: num(r.lesson_ordinal),
        week: (r.week as number | null) ?? null,
        opened: num(r.opened_learners),
        attempted: num(r.attempted_learners),
        exercises: [],
      };
      out.set(lessonId, l);
    }
    if (r.block_id == null) continue;
    l.exercises.push({
      blockId: r.block_id as string,
      number: l.exercises.length + 1,
      type: r.block_type as string,
      promptText: promptText(r.block_prompt),
      learners: num(r.block_learners),
      average: r.block_avg == null ? null : num(r.block_avg),
    });
  }
  return [...out.values()];
}

/** 0..1 → "73%". */
export function formatAverage(average: number): string {
  return `${Math.round(average * 100)}%`;
}
