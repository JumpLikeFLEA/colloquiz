/**
 * A pipeline step that did not work (VOICE-012). One class for both providers, so the
 * pipeline asks one question of any failure: may it be tried again?
 *
 * - `transient`: a timeout, a 429 or a 5xx, a network error. Nothing is recorded and
 *   the lease is left to expire; the next status poll (or the sweep, after 24 h) deals
 *   with it. The provider SDK already retried what it could.
 * - not transient: the provider said no, and saying it again would cost money and say
 *   no again (a refusal, a cut-off answer, a 4xx, a job that ended in error). The
 *   analysis is failed and its send is given back (voice_analysis_fail).
 *
 * `code` is stored in voice_analyses.failure (200 characters at most), so it is a short
 * word, never a provider message that could carry a quote of the learner's speech.
 */
export class AnalysisStepError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly transient: boolean,
  ) {
    super(message);
    this.name = "AnalysisStepError";
  }
}

/** True for an HTTP status that is worth trying again later. */
export function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}
