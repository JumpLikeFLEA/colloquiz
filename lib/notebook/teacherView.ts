import { newestFirst } from "./newest";
import type { SummaryKind } from "./types";

/**
 * PROG-020 (docs/decisions/0236 section 5, 0244) — a linked teacher's read-only view of a
 * student's notebook, from `linked_student_notebook(p_student)` (112). That function decides every
 * row: lessons in `_teacher_readable_lessons`, copied rows only, a compared summary only when its
 * baseline's lesson is readable too. This module only reads its JSON and groups it.
 *
 * The JSON has no `submission_id` and no `note`, so `parseNotebook` (the learner's reader) refuses
 * it by design (0239). An `own` row is dropped here as well, so a future change to the function
 * that let one through would still not draw it.
 */

export type TeacherEntry =
  | { kind: "said"; id: string; phrase: string; phraseKey: string; quote: string; exact: boolean; createdAt: string }
  | { kind: "fix"; id: string; quote: string; correction: string; createdAt: string };

export type TeacherSummary = {
  kind: SummaryKind;
  summary: string;
  /** The goal of a first take, the next step of a final or interim one; null when blank. */
  follow: { label: "goal" | "next_step"; text: string } | null;
  takenAt: string;
};

export type TeacherNotebookLesson = {
  lessonId: string;
  lessonTitle: string | null;
  /** Newest first. */
  summaries: TeacherSummary[];
  /** Said phrases merged by key inside the lesson, newest quote; newest first. */
  said: (Extract<TeacherEntry, { kind: "said" }> & { times: number })[];
  fixes: Extract<TeacherEntry, { kind: "fix" }>[];
  /** The newest row's time: what lessons are ordered by. */
  latest: string;
};

export type TeacherNotebookCourse = { courseId: string; courseTitle: string | null; lessons: TeacherNotebookLesson[] };

type Raw = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const time = (v: unknown): string | null => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);
const filled = (s: string | null): string | null => (s !== null && s.trim() !== "" ? s : null);
const SUMMARY_KINDS = new Set(["first", "final", "interim"]);

type Located = { courseId: string; courseTitle: string | null; lessonId: string; lessonTitle: string | null };

function locate(r: Raw): Located | null {
  const courseId = str(r.course_id);
  const lessonId = str(r.lesson_id);
  if (!courseId || !lessonId) return null;
  return { courseId, lessonId, courseTitle: str(r.course_title), lessonTitle: str(r.lesson_title) };
}

function toEntry(r: Raw): (TeacherEntry & Located) | null {
  const at = locate(r);
  const id = str(r.id);
  const createdAt = time(r.created_at);
  const quote = str(r.quote);
  if (!at || !id || !createdAt || quote === null) return null;
  if (r.kind === "said") {
    const phrase = str(r.phrase);
    const phraseKey = str(r.phrase_key);
    if (phrase === null || phraseKey === null || typeof r.exact !== "boolean") return null;
    return { ...at, kind: "said", id, phrase, phraseKey, quote, exact: r.exact, createdAt };
  }
  const correction = str(r.correction);
  if (r.kind === "fix" && correction !== null) return { ...at, kind: "fix", id, quote, correction, createdAt };
  return null; // `own`, or anything else: never drawn.
}

function toSummary(r: Raw): (TeacherSummary & Located) | null {
  const at = locate(r);
  const takenAt = time(r.taken_at);
  const kind = str(r.kind);
  if (!at || !takenAt || !kind || !SUMMARY_KINDS.has(kind)) return null;
  const first = kind === "first";
  const followText = filled(str(first ? r.goal : r.next_step));
  const summary = filled(str(r.summary));
  if (summary === null && followText === null) return null;
  return {
    ...at,
    kind: kind as SummaryKind,
    summary: summary ?? "",
    follow: followText === null ? null : { label: first ? "goal" : "next_step", text: followText },
    takenAt,
  };
}

/**
 * The RPC's JSON into courses → lessons, newest lesson first. Null when the answer is not the two
 * lists: the page shows a failed read then, never an empty notebook.
 */
export function teacherNotebook(raw: unknown): TeacherNotebookCourse[] | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const { entries, summaries } = raw as Raw;
  if (!Array.isArray(entries) || !Array.isArray(summaries)) return null;

  const lessons = new Map<string, TeacherNotebookLesson & { courseId: string; courseTitle: string | null }>();
  const lessonFor = (at: Located, when: string) => {
    let l = lessons.get(at.lessonId);
    if (!l) {
      l = { ...at, summaries: [], said: [], fixes: [], latest: when };
      lessons.set(at.lessonId, l);
    }
    if (Date.parse(when) > Date.parse(l.latest)) l.latest = when;
    return l;
  };

  const parsedEntries = entries
    .map((e) => (typeof e === "object" && e !== null ? toEntry(e as Raw) : null))
    .filter((e): e is TeacherEntry & Located => e !== null);
  for (const e of newestFirst(parsedEntries, (x) => x.createdAt)) {
    const l = lessonFor(e, e.createdAt);
    if (e.kind === "fix") {
      l.fixes.push({ kind: "fix", id: e.id, quote: e.quote, correction: e.correction, createdAt: e.createdAt });
      continue;
    }
    const shown = l.said.find((s) => s.phraseKey === e.phraseKey);
    if (shown) shown.times += 1;
    else l.said.push({ kind: "said", id: e.id, phrase: e.phrase, phraseKey: e.phraseKey, quote: e.quote, exact: e.exact, createdAt: e.createdAt, times: 1 });
  }
  const parsedSummaries = summaries
    .map((s) => (typeof s === "object" && s !== null ? toSummary(s as Raw) : null))
    .filter((s): s is TeacherSummary & Located => s !== null);
  for (const s of newestFirst(parsedSummaries, (x) => x.takenAt)) {
    lessonFor(s, s.takenAt).summaries.push({ kind: s.kind, summary: s.summary, follow: s.follow, takenAt: s.takenAt });
  }

  const courses = new Map<string, TeacherNotebookCourse & { latest: string }>();
  for (const l of newestFirst([...lessons.values()], (x) => x.latest)) {
    const { courseId, courseTitle, ...lesson } = l;
    const c = courses.get(courseId);
    if (c) c.lessons.push(lesson);
    else courses.set(courseId, { courseId, courseTitle, lessons: [lesson], latest: l.latest });
  }
  return [...courses.values()].map(({ latest: _latest, ...c }) => c);
}
