import { readStoredPlan } from "./plan";

/**
 * What the status page shows for an import (CNT-018 → CNT-019): the four steps of the card
 * ("Reading file", "Planning", "Lesson k of n", "Saving"), where the job is in them, and a
 * sentence for a failure. Pure; the route reads the row under the caller's session and hands
 * it here.
 */

export type ImportStatusRow = {
  status: string;
  plan: unknown;
  lessons_done: number;
  qa: unknown;
  course_id: string | null;
  failure: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
};

export type ImportStepState = "done" | "active" | "todo";
export type ImportStepView = { key: "reading" | "planning" | "drafting" | "saving"; label: string; state: ImportStepState };

export type ImportStatusBody = {
  ok: true;
  state: "running" | "done" | "failed";
  steps: ImportStepView[];
  lessonsDone: number;
  lessonsTotal: number | null;
  qa: unknown;
  courseId: string | null;
  failure: { code: string; message: string } | null;
};

const ORDER = ["reading", "planning", "drafting", "saving"] as const;

/** Index of the step a status is working on; -1 once nothing is running. */
function activeIndex(status: string): number {
  switch (status) {
    case "pending":
      return 0;
    case "planning":
      return 1;
    case "drafting":
      return 2;
    case "committing":
      return 3;
    default:
      return -1;
  }
}

export function importStatusView(row: ImportStatusRow): ImportStatusBody {
  const plan = readStoredPlan(row.plan);
  const total = plan ? plan.lessons.length : null;
  const state = row.status === "done" ? "done" : row.status === "failed" ? "failed" : "running";

  // A failed job keeps what it finished: the plan says reading and planning are done, a full
  // set of lessons says drafting is too. The step it died in is not marked, since the row no
  // longer says which it was.
  const active = state === "running" ? activeIndex(row.status) : -1;
  const reached = !plan ? 0 : row.lessons_done >= (total ?? Infinity) ? 3 : 2;

  const steps: ImportStepView[] = ORDER.map((key, i) => {
    let s: ImportStepState;
    if (state === "done") s = "done";
    else if (state === "running") s = i < active ? "done" : i === active ? "active" : "todo";
    else s = i < reached ? "done" : "todo";
    return { key, label: stepLabel(key, row.lessons_done, total), state: s };
  });

  return {
    ok: true,
    state,
    steps,
    lessonsDone: row.lessons_done,
    lessonsTotal: total,
    qa: state === "done" ? row.qa : null,
    courseId: state === "done" ? row.course_id : null,
    failure: row.failure ? { code: row.failure, message: failureMessage(row.failure) } : null,
  };
}

function stepLabel(key: ImportStepView["key"], done: number, total: number | null): string {
  switch (key) {
    case "reading":
      return "Reading file";
    case "planning":
      return "Planning";
    case "drafting":
      return total === null ? "Drafting lessons" : `Lesson ${Math.min(done + 1, total)} of ${total}`;
    case "saving":
      return "Saving";
  }
}

/** A failure code, as a sentence for the author. Unknown codes get the generic one. */
export function failureMessage(code: string): string {
  if (code.startsWith("lesson_invalid")) {
    return "A lesson came back in a shape the editor cannot open, even after a second attempt. Try again, or split the file.";
  }
  if (code.startsWith("llm_http_")) {
    return "The drafting service rejected the request. A very long or unusual file can cause this. Try again, or split the file.";
  }
  switch (code) {
    case "mode_off":
      return "Course import is switched off right now.";
    case "empty_file":
      return "No text could be read from the file.";
    case "file_too_long":
      return "The file is too long to import in one go. Split it and import the parts as separate courses.";
    case "object_missing":
    case "file_missing":
      return "The uploaded file is gone. Upload it again.";
    case "docx_unreadable":
      return "The DOCX could not be opened. Save it again from Word and retry.";
    case "llm_refusal":
      return "The drafting service declined to work on this file.";
    case "llm_max_tokens":
      return "A lesson was too long to draft in one piece. Try again, or split the file.";
    case "llm_network":
      return "The drafting service could not be reached.";
    case "plan_invalid":
      return "The plan for the course could not be read. Try again.";
    case "invalid_course":
      return "The drafted course did not pass the final check. Try again.";
    case "slug_taken":
      return "Another course took this slug while the import ran. Start again with a different slug.";
    case "forbidden":
      return "Your import access was removed while the import ran.";
    case "seat_lapsed":
      return "Your author seat has ended, so the course could not be saved.";
    case "timeout":
      return "The import did not finish within a day and was stopped.";
    case "file_expired":
      return "The file held by the drafting service expired. Start again.";
    default:
      return "The import failed. Try again; if it keeps failing, tell the admin.";
  }
}
