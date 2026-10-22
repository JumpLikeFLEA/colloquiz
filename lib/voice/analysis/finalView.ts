import { parseStoredAnalysis } from "./parseStored";
import { isInProgress, type AnalysisStatusBody, type ViewAnalysis } from "./view";

/**
 * PROG-007 (docs/decisions/0191): what the before/after screen draws for the final take's AI
 * feedback, from the answer `readAnalysisStatus` gives the lesson page's own poller. The same
 * states, decided once; this only chooses what a page that cannot poll shows for each.
 *
 * `none` and `off` draw nothing at all, so production while VOICE_ANALYSIS_MODE is `off` (and a
 * take sent before the analysis existed) reads exactly as it did before this card. `working` is
 * a take still being analysed: the page is a snapshot, so it says to come back rather than
 * pretending to update. A result that does not read as an analysis is `failed`, never half a page
 * (the lesson page's rule, 0189).
 */
export type FinalAnalysisView =
  | { kind: "none" }
  | { kind: "working" }
  | { kind: "failed" }
  | { kind: "withdrawn" }
  | { kind: "paused" }
  | { kind: "limit" }
  | {
      kind: "done";
      analysis: ViewAnalysis;
      transcript: string;
      /** The first take's feedback, when it is still there to compare with. */
      baseline: { analysis: ViewAnalysis; transcript: string } | null;
    };

export function finalAnalysisView(body: AnalysisStatusBody | null): FinalAnalysisView {
  if (!body) return { kind: "none" };
  if (body.status === "done") {
    const analysis = parseStoredAnalysis(body.result, body.transcript, body.baseline?.transcript ?? null);
    if (!analysis) return { kind: "failed" };
    const base = body.baseline ? parseStoredAnalysis(body.baseline.result, body.baseline.transcript) : null;
    return {
      kind: "done",
      analysis,
      transcript: body.transcript,
      baseline: base && body.baseline ? { analysis: base, transcript: body.baseline.transcript } : null,
    };
  }
  if (isInProgress(body.status)) return { kind: "working" };
  switch (body.status) {
    case "failed":
      return { kind: "failed" };
    case "withdrawn":
      return { kind: "withdrawn" };
    case "paused":
      return { kind: "paused" };
    case "limit":
      return { kind: "limit" };
    default:
      return { kind: "none" };
  }
}
