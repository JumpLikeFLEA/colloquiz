import { FeedbackContentSchema, type FeedbackContent } from "../feedback/content";

/**
 * WRITE-002 (docs/decisions/0225): what the lesson page knows about one
 * writing task for the signed-in learner, as writing_task_state (migration
 * 109) answers it. `route` is where a send would go; "practice" means nothing
 * is uploaded.
 */
export type WritingRoute = "practice" | "cohort" | "linked";

export interface WritingTaskState {
  route: WritingRoute;
  locked: boolean;
  submission: { id: string; body: string; updatedAt: string } | null;
  feedback: { body: FeedbackContent; publishedAt: string } | null;
}

/** What the lesson page hands the player: the lesson, and a state per ticked task. */
export interface WritingTasksContext {
  lessonId: string;
  blocks: Record<string, WritingTaskState>;
}

export const PRACTICE_STATE: WritingTaskState = { route: "practice", locked: false, submission: null, feedback: null };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The RPC's JSON as a state; anything unexpected is practice. */
export function parseWritingState(raw: unknown): WritingTaskState {
  if (!isRecord(raw) || raw.ok !== true) return PRACTICE_STATE;
  const route: WritingRoute = raw.route === "cohort" || raw.route === "linked" ? raw.route : "practice";
  const sub = isRecord(raw.submission) ? raw.submission : null;
  const submission =
    sub && typeof sub.id === "string" && typeof sub.body === "string" && typeof sub.updated_at === "string"
      ? { id: sub.id, body: sub.body, updatedAt: sub.updated_at }
      : null;
  const fb = isRecord(raw.feedback) ? raw.feedback : null;
  const parsedFb = fb ? FeedbackContentSchema.safeParse(fb.body) : null;
  const feedback =
    fb && parsedFb?.success && typeof fb.published_at === "string"
      ? { body: parsedFb.data, publishedAt: fb.published_at }
      : null;
  // A locked answer needs its feedback to show; without both, it is not locked.
  const locked = raw.locked === true && submission !== null && feedback !== null;
  return { route, locked, submission, feedback: locked ? feedback : null };
}

/** The ids of the writing tasks in a lesson document that are sent to a teacher. */
export function sendingWritingBlockIds(document: readonly unknown[]): string[] {
  const ids: string[] = [];
  for (const b of document) {
    if (!isRecord(b)) continue;
    if (b.kind === "task" && b.type === "writing" && b.sendToTeacher === true && typeof b.id === "string") ids.push(b.id);
  }
  return ids;
}
