import { answerText, type AnswerText } from "../learners/answerText";

// TCH-018 — an assignment's results by exercise (migration 106,
// docs/decisions/0213). Pure: the row homework_results() returns, its mapping,
// and the grid Studio lays out from it. Who is a recipient, which exercises
// exist and which attempt is a student's best are decided in SQL; this only
// groups rows and numbers columns.

export type ResultRow = {
  studentId: string;
  lessonId: string;
  lessonTitle: string;
  lessonOrdinal: number;
  blockId: string;
  blockPos: number;
  block: unknown;
  earned: number | null;
  possible: number | null;
  response: unknown;
  attemptedAt: string | null;
};

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

export function toResultRow(r: Record<string, unknown>): ResultRow {
  return {
    studentId: r.student_id as string,
    lessonId: r.lesson_id as string,
    lessonTitle: r.lesson_title as string,
    lessonOrdinal: num(r.lesson_ordinal),
    blockId: r.block_id as string,
    blockPos: num(r.block_pos),
    block: r.block ?? null,
    earned: r.earned == null ? null : num(r.earned),
    possible: r.possible == null ? null : num(r.possible),
    response: r.response ?? null,
    attemptedAt: (r.attempted_at as string | null) ?? null,
  };
}

export type GridExercise = {
  /** `lessonId:blockId`: unique across the grid, and the cell's address. */
  key: string;
  blockId: string;
  /** 1-based among the lesson's exercises, in document order. */
  number: number;
  prompt: string | null;
};

export type GridLesson = {
  lessonId: string;
  title: string;
  ordinal: number;
  exercises: GridExercise[];
};

export type GridCell = {
  /** "1/2", or null when the student has no attempt on this version. */
  score: string | null;
  earned: number | null;
  possible: number | null;
  answer: AnswerText | null;
  attemptedAt: string | null;
};

export type ResultsGrid = {
  lessons: GridLesson[];
  /** The student ids present, in first-seen order; the page orders them by label. */
  studentIds: string[];
  /** cells.get(studentId)?.get(exercise.key) */
  cells: Map<string, Map<string, GridCell>>;
};

function promptOf(block: unknown): string | null {
  if (typeof block !== "object" || block === null) return null;
  const payload = (block as { payload?: unknown }).payload;
  if (typeof payload !== "object" || payload === null) return null;
  const prompt = (payload as { prompt?: unknown }).prompt;
  return typeof prompt === "string" && prompt.trim() ? prompt.trim() : null;
}

export const cellKey = (lessonId: string, blockId: string) => `${lessonId}:${blockId}`;

/** Lessons by ordinal, exercises by document position, one cell per row. */
export function buildResultsGrid(rows: readonly ResultRow[]): ResultsGrid {
  const lessonMap = new Map<string, GridLesson & { seen: Map<string, number> }>();
  for (const r of rows) {
    const lesson = lessonMap.get(r.lessonId) ?? {
      lessonId: r.lessonId,
      title: r.lessonTitle,
      ordinal: r.lessonOrdinal,
      exercises: [],
      seen: new Map<string, number>(),
    };
    if (!lesson.seen.has(r.blockId)) {
      lesson.seen.set(r.blockId, r.blockPos);
      lesson.exercises.push({ key: cellKey(r.lessonId, r.blockId), blockId: r.blockId, number: 0, prompt: promptOf(r.block) });
    }
    lessonMap.set(r.lessonId, lesson);
  }
  const lessons: GridLesson[] = [...lessonMap.values()]
    .sort((a, b) => a.ordinal - b.ordinal)
    .map(({ seen, ...l }) => ({
      ...l,
      exercises: [...l.exercises]
        .sort((a, b) => (seen.get(a.blockId) ?? 0) - (seen.get(b.blockId) ?? 0))
        .map((e, i) => ({ ...e, number: i + 1 })),
    }));

  const cells = new Map<string, Map<string, GridCell>>();
  const studentIds: string[] = [];
  for (const r of rows) {
    let row = cells.get(r.studentId);
    if (!row) {
      row = new Map();
      cells.set(r.studentId, row);
      studentIds.push(r.studentId);
    }
    const attempted = r.earned != null && r.possible != null;
    row.set(cellKey(r.lessonId, r.blockId), {
      score: attempted ? `${r.earned}/${r.possible}` : null,
      earned: r.earned,
      possible: r.possible,
      answer: attempted ? answerText(r.block, r.response) : null,
      attemptedAt: r.attemptedAt,
    });
  }
  return { lessons, studentIds, cells };
}
