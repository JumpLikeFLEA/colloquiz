/**
 * A pipeline step that did not work (CNT-018), the shape of voice/analysis/errors.ts.
 *
 * - `transient`: a timeout, a 429 or a 5xx, a network error. Nothing is recorded and the lease
 *   is left to expire; the next status poll claims the row again, and the daily sweep fails it
 *   after 24 hours if that never works.
 * - not transient: saying it again would cost money and fail again (a refusal, a cut-off
 *   answer, a 4xx, a file nobody can read). The import is failed with `code`.
 *
 * `code` is stored in course_imports.failure (200 characters at most), so it is a short word
 * and never a provider message, which could quote the author's file.
 */
export class ImportStepError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly transient: boolean,
  ) {
    super(message);
    this.name = "ImportStepError";
  }
}

/** True for an HTTP status that is worth trying again later. */
export function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}
