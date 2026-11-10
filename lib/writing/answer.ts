import { WRITING_ANSWER_MAX_CHARS } from "../lessons/taskBlocks";

/**
 * WRITE-002 (docs/decisions/0225 Decisions 2 and 9): the body of a sent
 * writing answer. The route and the card share this, so what the learner sees
 * as "unsent changes" is what the route would store.
 *
 * Normalised: CRLF and lone CR become LF, then the ends are trimmed. The cap
 * is applied AFTER normalising (a CRLF pair is one character, as it is in the
 * database). The same two rules are the SQL's (migration 109: at most 4,000
 * characters and one non-whitespace character), which stays the authority.
 */
export function normaliseWritingBody(raw: string): string {
  return raw.replace(/\r\n?/g, "\n").trim();
}

export type WritingBodyCheck =
  | { ok: true; body: string }
  | { ok: false; error: "invalid_body" };

export function checkWritingBody(raw: unknown): WritingBodyCheck {
  if (typeof raw !== "string") return { ok: false, error: "invalid_body" };
  const body = normaliseWritingBody(raw);
  if (body.length === 0 || body.length > WRITING_ANSWER_MAX_CHARS) {
    return { ok: false, error: "invalid_body" };
  }
  return { ok: true, body };
}

/** submit_writing_answer's refusals (migration 109) as HTTP statuses. */
export const WRITING_ERROR_STATUS: Record<string, number> = {
  unauthenticated: 401,
  not_found: 404,
  not_a_writing_block: 422,
  not_sent_to_teacher: 409,
  invalid_body: 422,
  lesson_not_open: 403,
  no_route: 403,
  locked: 409,
};

/** Refusals after which the card stops offering Send and falls back to
 * practice (the page's read and the RPC disagreed, or the slot locked). */
export const WRITING_FALLBACK_ERRORS: ReadonlySet<string> = new Set([
  "not_a_writing_block",
  "not_sent_to_teacher",
  "lesson_not_open",
  "no_route",
  "locked",
  "not_found",
]);
