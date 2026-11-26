/**
 * The learner notebook's data, as the pure modules in this folder read it (PROG-013,
 * docs/decisions/0235, 0236, 0239). Nothing here decides access: every row is one SQL already
 * returned to the caller (migration 112).
 */

type EntryBase = {
  id: string;
  courseId: string | null;
  lessonId: string | null;
  /** Titles at write time: the name is kept when the lesson can no longer be read. */
  courseTitle: string | null;
  lessonTitle: string | null;
  createdAt: string;
};

export type SaidEntry = EntryBase & {
  kind: "said";
  submissionId: string;
  phrase: string;
  /** 112's generated key: what notebook_delete_entry matches on, so what rows are merged by. */
  phraseKey: string;
  quote: string;
  /** False is shown as "close". */
  exact: boolean;
};
export type FixEntry = EntryBase & { kind: "fix"; submissionId: string; quote: string; correction: string };
export type OwnEntry = EntryBase & { kind: "own"; phrase: string; note: string | null };
export type NotebookEntry = SaidEntry | FixEntry | OwnEntry;

export type SummaryKind = "first" | "final" | "interim";

export type NotebookSummary = {
  submissionId: string;
  courseId: string | null;
  lessonId: string | null;
  courseTitle: string | null;
  lessonTitle: string | null;
  kind: SummaryKind;
  summary: string;
  nextStep: string | null;
  goal: string | null;
  takenAt: string;
};

/** One of the learner's own `voice_submissions` rows, one per slot (060, 094). */
export type NotebookTake = {
  id: string;
  courseId: string;
  lessonId: string;
  courseTitle: string | null;
  lessonTitle: string | null;
  submittedAt: string;
  /** Null for a self-paced take (094). */
  enrolmentId: string | null;
  /** The cohort run's end; null for a self-paced take, or when the run could not be read. */
  runEndsAt: string | null;
  /** Null once the 6-month purge removed the audio (060). */
  objectName: string | null;
  /** The stored container's MIME type (060); the download states its format from it (PROG-019). */
  contentType: string | null;
};

/** What the caller's own session can read now, for current titles and links. */
export type ReadableCourse = { id: string; slug: string; title: string };
export type ReadableLesson = {
  id: string;
  courseId: string;
  slug: string;
  title: string;
  ordinal: number;
  archived: boolean;
  /** The published document, or null when it was not read. */
  document: readonly unknown[] | null;
};

/** One `notebook_try_gate()` row (112, 0236 section 6): the caller's own started courses only. */
export type TryGateRow = { courseId: string; hasBefore: boolean; beforeTaken: boolean };
