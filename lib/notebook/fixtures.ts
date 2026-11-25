import { phraseKey } from "./phraseKey";
import type { FixEntry, NotebookSummary, NotebookTake, OwnEntry, ReadableLesson, SaidEntry } from "./types";

/** Row builders for this folder's tests. Nothing outside a test imports it. */
let n = 0;
const base = () => ({
  id: `e${++n}`,
  courseId: "c1" as string | null,
  lessonId: "l1" as string | null,
  courseTitle: "Course one (then)" as string | null,
  lessonTitle: "Lesson one (then)" as string | null,
  createdAt: "2026-11-01T10:00:00+00:00",
});

export const said = (phrase: string, over: Partial<SaidEntry> = {}): SaidEntry => ({
  ...base(),
  kind: "said",
  submissionId: "t1",
  phrase,
  phraseKey: phraseKey(phrase),
  quote: `I said ${phrase}`,
  exact: true,
  ...over,
});

export const fix = (over: Partial<FixEntry> = {}): FixEntry => ({
  ...base(),
  kind: "fix",
  submissionId: "t1",
  quote: "I have went",
  correction: "I went",
  ...over,
});

export const own = (phrase: string, over: Partial<OwnEntry> = {}): OwnEntry => ({
  ...base(),
  kind: "own",
  phrase,
  note: null,
  ...over,
});

export const summary = (over: Partial<NotebookSummary> = {}): NotebookSummary => ({
  submissionId: "t1",
  courseId: "c1",
  lessonId: "l1",
  courseTitle: "Course one (then)",
  lessonTitle: "Lesson one (then)",
  kind: "first",
  summary: "You told a clear story.",
  nextStep: null,
  goal: null,
  takenAt: "2026-11-01T10:00:00+00:00",
  ...over,
});

export const take = (over: Partial<NotebookTake> = {}): NotebookTake => ({
  id: "t1",
  courseId: "c1",
  lessonId: "l1",
  courseTitle: "Course one",
  lessonTitle: "Lesson one",
  submittedAt: "2026-11-01T10:00:00+00:00",
  enrolmentId: null,
  runEndsAt: null,
  objectName: "c1/u/x.webm",
  ...over,
});

export const voice = (id: string, listenFor: string[], compare?: "before" | "interim" | "after") => ({
  id,
  kind: "task",
  type: "voice",
  prompt: [{ text: "Say something." }],
  maxSeconds: 60,
  listenFor,
  ...(compare ? { compare } : {}),
});

export const lesson = (over: Partial<ReadableLesson> = {}): ReadableLesson => ({
  id: "l1",
  courseId: "c1",
  slug: "one",
  title: "Lesson one",
  ordinal: 1,
  archived: false,
  document: [],
  ...over,
});
