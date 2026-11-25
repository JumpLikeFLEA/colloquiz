import { courseChips, parseCourse, type CourseChip } from "./courseChips";
import { emptyState, type EmptyState } from "./emptyState";
import { fixRows } from "./fixes";
import { phraseRows, type PhraseRow } from "./phrases";
import { notebookRecord, type CompletionRow, type NotebookRecord } from "./record";
import { recordingRows, type RecordingRow } from "./recordings";
import { sourceIndex, type SourceIndex } from "./source";
import { summaryCard, type SummaryCard } from "./summaryCard";
import { parseTab, type NotebookTab } from "./tabs";
import { toTryRows, type TryRow } from "./toTry";
import type {
  FixEntry,
  NotebookEntry,
  NotebookSummary,
  NotebookTake,
  ReadableCourse,
  ReadableLesson,
  TryGateRow,
} from "./types";

/**
 * Everything `/my/notebook` draws, from rows already read (PROG-013, docs/decisions/0239). The tab
 * and the course chip filter the list and its counts only: the summary card, the record and the
 * recordings are the learner's whole notebook.
 */
export type NotebookInput = {
  entries: readonly NotebookEntry[];
  summaries: readonly NotebookSummary[];
  takes: readonly NotebookTake[];
  completion: readonly CompletionRow[];
  gate: readonly TryGateRow[];
  courses: readonly ReadableCourse[];
  lessons: readonly ReadableLesson[];
  /** `?tab=` and `?course=`, as they came. */
  tab: unknown;
  course: unknown;
};

export type NotebookView = {
  tab: NotebookTab;
  /** The chosen course, or null for All courses. */
  courseId: string | null;
  chips: CourseChip[];
  counts: Record<NotebookTab, number>;
  phrases: PhraseRow[];
  fixes: FixEntry[];
  toTry: TryRow[];
  empty: EmptyState;
  record: NotebookRecord;
  recordings: RecordingRow[];
  summary: SummaryCard | null;
  /** For `rowSource`: titles and links. */
  sources: SourceIndex;
};

export function notebookView(input: NotebookInput): NotebookView {
  const sources = sourceIndex(input.courses, input.lessons);
  const allPhrases = phraseRows(input.entries);
  const allFixes = fixRows(input.entries);
  const allToTry = toTryRows(input.gate, input.lessons, input.entries);
  const totals = { phrases: allPhrases.length, fixes: allFixes.length, "to-try": allToTry.length };

  const chips = courseChips(input.entries, allToTry, sources.courses);
  const courseId = parseCourse(input.course, chips);
  const tab = parseTab(input.tab);
  const inCourse = (row: { courseId: string | null }) => courseId === null || row.courseId === courseId;

  const phrases = allPhrases.filter(inCourse);
  const fixes = allFixes.filter(inCourse);
  const toTry = allToTry.filter(inCourse);
  const counts = { phrases: phrases.length, fixes: fixes.length, "to-try": toTry.length };
  const recordings = recordingRows(input.takes, input.entries, input.summaries);
  const summary = summaryCard(input.summaries);
  const notebookEmpty =
    input.entries.length === 0 && allToTry.length === 0 && recordings.length === 0 && summary === null;

  return {
    tab,
    courseId,
    chips,
    counts,
    phrases,
    fixes,
    toTry,
    empty: emptyState({ notebookEmpty, shown: counts[tab], inAllCourses: totals[tab] }),
    record: notebookRecord(input.completion, input.takes, input.entries),
    recordings,
    summary,
    sources,
  };
}
