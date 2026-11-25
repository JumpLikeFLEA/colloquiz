import { phraseRows } from "./phrases";
import type { NotebookEntry, NotebookTake } from "./types";

/**
 * The record's four numbers (0235 "The record numbers"). Never filtered by course.
 *
 * Lessons completed counts the learner's completion rows (`get_course_attempt_summary`, 075), an
 * archived or unpublished lesson's included. Recordings sent counts tasks recorded: one
 * `voice_submissions` row per slot, however often it was sent, purged takes included. Phrases said
 * are the merged rows (0236 section 4), so the number equals the said rows under All courses.
 */
export type CompletionRow = { courseId: string; lessonSlug: string; complete: boolean };

export type NotebookRecord = {
  lessonsCompleted: number;
  recordingsSent: number;
  phrasesSaid: number;
  notesSaved: number;
};

export function notebookRecord(
  completion: readonly CompletionRow[],
  takes: readonly Pick<NotebookTake, "id">[],
  entries: readonly NotebookEntry[],
): NotebookRecord {
  const phrases = phraseRows(entries);
  return {
    // A slug is unique in its course, archived lessons included (043's lessons_course_slug_idx).
    lessonsCompleted: new Set(completion.filter((c) => c.complete).map((c) => `${c.courseId}/${c.lessonSlug}`)).size,
    recordingsSent: new Set(takes.map((t) => t.id)).size,
    phrasesSaid: phrases.filter((p) => p.kind === "said").length,
    notesSaved: phrases.filter((p) => p.kind === "own").length,
  };
}
