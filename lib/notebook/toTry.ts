import { VoiceTaskBlockSchema } from "../lessons/taskBlocks";
import { phraseKey } from "./phraseKey";
import type { NotebookEntry, ReadableLesson, TryGateRow } from "./types";

/**
 * The To try tab (0235 "To try", 0236 section 6): listen-for phrases of the courses the learner has
 * started, minus the ones said in that course. Derived on every read, never stored.
 *
 * `gate` is `notebook_try_gate()`: a course with no row is not started. A course with a `before`
 * voice task shows nothing until the learner's `before` take exists, so the baseline stays honest
 * (0156 Decision 8). `lessons` are what the learner's own session can read, so a list in a lesson
 * they cannot open is never here, while the gate still knows about its `before` task.
 */
export type TryRow = { courseId: string; lessonId: string; phrase: string };

/** The gate's own test (112), on the raw block: a block the schema refuses still counts as one. */
function isBefore(block: unknown): boolean {
  const b = block as { kind?: unknown; type?: unknown; compare?: unknown } | null;
  return b?.kind === "task" && b.type === "voice" && b.compare === "before";
}

export function toTryRows(
  gate: readonly TryGateRow[],
  lessons: readonly ReadableLesson[],
  entries: readonly NotebookEntry[],
): TryRow[] {
  const rows: TryRow[] = [];
  for (const { courseId, hasBefore, beforeTaken } of gate) {
    if (hasBefore && !beforeTaken) continue;
    const mine = lessons.filter((l) => l.courseId === courseId && !l.archived).sort((a, b) => a.ordinal - b.ordinal);
    // The gate is the rule. A `before` task the session can see while the gate says there is none
    // (a publish between the two reads) is the same state, so it hides the list too.
    if (!beforeTaken && mine.some((l) => l.document?.some(isBefore))) continue;

    const seen = new Set<string>();
    for (const e of entries) if (e.kind === "said" && e.courseId === courseId) seen.add(phraseKey(e.phrase));
    for (const lesson of mine) {
      for (const block of lesson.document ?? []) {
        const task = VoiceTaskBlockSchema.safeParse(block);
        for (const phrase of (task.success && task.data.listenFor) || []) {
          const key = phraseKey(phrase);
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({ courseId, lessonId: lesson.id, phrase });
        }
      }
    }
  }
  return rows;
}
