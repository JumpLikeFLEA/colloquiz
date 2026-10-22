import type { VoiceAnalysisMode } from "./mode";
import { IN_PROGRESS_STATUSES, type AnalysisStatusBody } from "./view";

/**
 * Where one take's analysis stands, as the learner's view asks for it (VOICE-014,
 * docs/decisions/0189). The route is thin; the decisions are here so they can be tested with
 * fakes and a positive control beside every denial.
 *
 * RLS (096) lets the owner read their own analysis only while it is not hidden, so three things
 * a learner must be told look like "no row" to their own session: the author withdrew the
 * feedback, a cohort send went past a cap and was stored without an analysis, and the mode
 * paused the analysis after the send. 0185 asked for a definer function to tell them apart. This
 * answers the same question with a service-role read instead, which needs no new SQL: after
 * RLS has proved the take is the caller's, `readHidden` and `readLedger` are asked about THAT
 * take and only a state word leaves this module, never a row.
 */

export type StatusDeps = {
  /** Under the caller's session: is this take theirs? (RLS plus an explicit user filter.) */
  ownsTake: (submissionId: string) => Promise<boolean>;
  /** Under the caller's session: the analysis RLS lets them read. */
  readVisible: (submissionId: string) => Promise<VisibleRow | null>;
  /** Service role, after `ownsTake`: does a hidden analysis exist for this take? */
  readHidden: (submissionId: string) => Promise<boolean>;
  /** Service role, after `ownsTake`: the send's ledger row. */
  readLedger: (submissionId: string) => Promise<LedgerRow | null>;
  /** Service role, after `ownsTake`: the take a final was compared with. */
  readBaselineId: (submissionId: string) => Promise<string | null>;
  /** Under the caller's session: that take's analysis, only if it is done and still visible. */
  readBaseline: (baselineId: string) => Promise<{ transcript: string; result: unknown } | null>;
};

export type VisibleRow = { status: string; transcript: string | null; result: unknown };
export type LedgerRow = { analysed: boolean; uncountedReason: string | null };

const IN_PROGRESS = new Set<string>(IN_PROGRESS_STATUSES);

/** What a take with no visible analysis row is. Exported for its own test. */
export function stateWithoutVisibleRow(input: {
  hidden: boolean;
  ledger: LedgerRow | null;
}): "withdrawn" | "limit" | "paused" | "none" {
  if (input.hidden) return "withdrawn";
  if (!input.ledger) return "none";
  if (!input.ledger.analysed) return "limit";
  if (input.ledger.uncountedReason === "paused") return "paused";
  return "none";
}

export async function readAnalysisStatus(
  submissionId: string,
  mode: VoiceAnalysisMode,
  deps: StatusDeps,
): Promise<AnalysisStatusBody> {
  const visible = await deps.readVisible(submissionId);

  if (visible) {
    if (visible.status === "done") {
      if (typeof visible.transcript !== "string" || visible.result == null) return { ok: true, status: "failed" };
      // Only the owner is told what the take was compared with; an author reading the same row
      // (the editor policy) gets the analysis alone.
      let baseline: { transcript: string; result: unknown } | null = null;
      if (await deps.ownsTake(submissionId)) {
        const baselineId = await deps.readBaselineId(submissionId);
        if (baselineId) baseline = await deps.readBaseline(baselineId);
      }
      return { ok: true, status: "done", transcript: visible.transcript, result: visible.result, baseline };
    }
    if (IN_PROGRESS.has(visible.status)) {
      // Under `off` nobody is shown anything (production before OPS-027); the row is about to be paused.
      if (mode === "off") return { ok: true, status: "off" };
      return { ok: true, status: visible.status as "pending" | "transcribing" | "analysing" };
    }
    if (visible.status === "failed") return { ok: true, status: "failed" };
    return { ok: true, status: "none" };
  }

  // Nothing readable. Only the take's owner is told why.
  if (mode === "off") return { ok: true, status: "off" };
  if (!(await deps.ownsTake(submissionId))) return { ok: true, status: "none" };
  const [hidden, ledger] = await Promise.all([deps.readHidden(submissionId), deps.readLedger(submissionId)]);
  return { ok: true, status: stateWithoutVisibleRow({ hidden, ledger }) };
}
