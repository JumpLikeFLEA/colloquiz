/**
 * The author's list of analysed takes (VOICE-015, docs/decisions/0190). Pure: the URL filters, the
 * state words and the shape of a list row. Who may see which row is decided in SQL (096's editor
 * policy on voice_analyses and 060's on voice_submissions); nothing here is a permission.
 */

export const VOICE_LIST_PAGE_SIZE = 25;

export type VoiceListFilters = { course: string | null; page: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** URL → filters. A course that is not a UUID and a page that is not a positive integer fall back. */
export function parseVoiceListFilters(params: Record<string, string | string[] | undefined>): VoiceListFilters {
  const course = first(params.course);
  const page = first(params.page);
  const n = page && /^\d{1,6}$/.test(page) ? Number(page) : 1;
  return {
    course: course && UUID.test(course) ? course.toLowerCase() : null,
    page: n >= 1 ? n : 1,
  };
}

/** Filters → query string, dropping defaults so a link stays short. */
export function voiceListQuery(f: Partial<VoiceListFilters>): string {
  const q = new URLSearchParams();
  if (f.course) q.set("course", f.course);
  if (f.page && f.page > 1) q.set("page", String(f.page));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / VOICE_LIST_PAGE_SIZE));
}

/**
 * What an analysis is, to the author. `withdrawn` is a hidden analysis whatever its status was;
 * the learner sees "Feedback withdrawn" for it (0156 Decision 9).
 */
export type StudioAnalysisState = "working" | "failed" | "done" | "withdrawn";

export function studioAnalysisState(input: { status: string; hiddenAt: string | null }): StudioAnalysisState {
  if (input.hiddenAt) return "withdrawn";
  if (input.status === "done") return "done";
  if (input.status === "failed") return "failed";
  return "working";
}

export const STATE_LABEL: Record<StudioAnalysisState, string> = {
  working: "Analysing",
  failed: "Failed",
  done: "Done",
  withdrawn: "Withdrawn",
};

// The review queue's vocabulary (bg-warning-subtle for "needs a look", bg-brand-subtle for settled,
// bg-muted for neutral). A failed analysis is our fault, not the learner's: it is not destructive.
export const STATE_PILL: Record<StudioAnalysisState, string> = {
  working: "bg-muted text-muted-foreground",
  failed: "bg-warning-subtle text-warning",
  done: "bg-brand-subtle text-brand-text",
  withdrawn: "bg-muted text-muted-foreground",
};

/** Only a finished, shown analysis can be withdrawn (hide_voice_analysis answers `not_done` otherwise). */
export function canHide(state: StudioAnalysisState): boolean {
  return state === "done";
}

export type VoiceListRow = {
  submissionId: string;
  status: string;
  hiddenAt: string | null;
  /** When the analysis row was made (the send). */
  analysedAt: string;
  sentAt: string;
  userId: string;
  courseId: string;
  lessonId: string;
  blockId: string;
  /** A take made inside a cohort run (an enrolment); NULL enrolment is a self-paced take. */
  cohort: boolean;
  purged: boolean;
};

/** One row of the list query, or null when it is not the shape asked for. */
export function toVoiceListRow(raw: unknown): VoiceListRow | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const s = r.voice_submissions;
  // PostgREST embeds a to-one relation as an object; tolerate a one-element array too.
  const sub = (Array.isArray(s) ? s[0] : s) as Record<string, unknown> | null | undefined;
  if (typeof sub !== "object" || sub === null) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const submissionId = str(r.submission_id);
  const status = str(r.status);
  const analysedAt = str(r.created_at);
  const sentAt = str(sub.submitted_at);
  const userId = str(sub.user_id);
  const courseId = str(sub.course_id);
  const lessonId = str(sub.lesson_id);
  const blockId = str(sub.block_id);
  if (!submissionId || !status || !analysedAt || !sentAt || !userId || !courseId || !lessonId || !blockId) return null;
  return {
    submissionId,
    status,
    hiddenAt: str(r.hidden_at),
    analysedAt,
    sentAt,
    userId,
    courseId,
    lessonId,
    blockId,
    cohort: sub.enrolment_id != null,
    purged: sub.object_name == null,
  };
}
