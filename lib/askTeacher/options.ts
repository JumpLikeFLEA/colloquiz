/**
 * TCH-006 (docs/decisions/0153) — what the lesson page hands the player so it
 * can offer "Ask the teacher". Which teachers qualify (linked, and they edit
 * the course or assigned it) is decided in SQL by `ask_teacher_options` (081);
 * this only reshapes its rows.
 */

/** A row of `ask_teacher_options(lesson)`. */
export type AskTeacherRow = { teacher_id: string; teacher_label: string };

export type AskTeacherOption = { id: string; label: string };

export function toAskTeacherOptions(rows: readonly AskTeacherRow[] | null | undefined): AskTeacherOption[] {
  return (rows ?? []).map((r) => ({ id: r.teacher_id, label: r.teacher_label }));
}

/** Everything the composer needs besides the exercise itself. Plain JSON, so
 * the server page can pass it across the client boundary. */
export type AskTeacherConfig = {
  /** The signed-in student: the pair's student id for /api/messages. */
  studentId: string;
  teachers: AskTeacherOption[];
  course: { slug: string; title: string };
  lesson: { id: string; slug: string; title: string };
  /** lesson_versions.id the page was served. */
  versionId: string;
};
