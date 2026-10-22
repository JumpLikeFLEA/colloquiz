"use client";

import { useMemo, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { voiceAnalysisCopy as copy } from "@/lib/alliengll/voiceAnalysisCopy";
import { isInProgress, parseStoredAnalysis, type AnalysisStatus } from "@/lib/voice/analysis/view";
import { AnalysisResult } from "./AnalysisResult";
import { useAnalysisStatus, type StatusFetcher } from "./useAnalysisStatus";

/**
 * The learner's AI feedback under their recording (VOICE-014, docs/decisions/0189). This module
 * is the feedback view's own lazy chunk: VoiceRecorder loads it with next/dynamic only when the
 * analysis is switched on and there is a sent take, so a lesson without a voice task, and every
 * lesson while VOICE_ANALYSIS_MODE is `off`, never download it.
 *
 * Mount with `key={submissionId}`: a new take is a new panel.
 *
 * The label "AI feedback" sits on every state (docs/release/legal/privacy-policy.md section 12
 * promises it). The panel never says a grade, never colours a count, and never blocks anything:
 * it is advice the learner may ignore (0156 Decision 1).
 */

type Props = {
  submissionId: string;
  /** A cohort send: its limit state says the teacher will still answer (0156 Decision 3). */
  cohort: boolean;
  /** The task's "Try to use" list; absent on a `before` task so the baseline stays honest. */
  listenFor?: readonly string[];
  /** For tests. */
  fetchStatus?: StatusFetcher;
};

const BOX = "mt-1 rounded-xl border border-border bg-card p-3 sm:p-4";

function Label() {
  return (
    <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-brand-subtle px-2.5 py-1 text-xs font-medium text-brand-text">
      <Sparkles className="size-3.5" aria-hidden="true" />
      {copy.label}
    </p>
  );
}

function Message({ title, body }: { title?: string; body?: string }) {
  return (
    <>
      {title && <p className="text-sm font-semibold text-foreground">{title}</p>}
      {body && <p className={`${title ? "mt-1 " : ""}text-sm text-muted-foreground`}>{body}</p>}
    </>
  );
}

function progressText(status: AnalysisStatus): string {
  if (status === "transcribing") return copy.transcribing;
  if (status === "analysing") return copy.analysing;
  return copy.pending;
}

export function VoiceAnalysisPanel({ submissionId, cohort, listenFor, fetchStatus }: Props) {
  const { body, loadFailed, stalled } = useAnalysisStatus(submissionId, fetchStatus);

  const done = useMemo(() => {
    if (!body || body.status !== "done") return null;
    const analysis = parseStoredAnalysis(body.result, body.transcript, body.baseline?.transcript ?? null);
    if (!analysis) return null;
    const base = body.baseline ? parseStoredAnalysis(body.baseline.result, body.baseline.transcript) : null;
    return { analysis, transcript: body.transcript, baseline: base && body.baseline ? { analysis: base, transcript: body.baseline.transcript } : null };
  }, [body]);

  // Nothing to say: the mode is off, there is no take, or the first read has not come back.
  if (body?.status === "off" || body?.status === "none") return null;

  const status = body?.status ?? "pending";

  let content: ReactNode;
  if (body?.status === "done") {
    content = done ? (
      <>
        <AnalysisResult analysis={done.analysis} transcript={done.transcript} baseline={done.baseline} listenFor={listenFor} />
        <p className="mt-3 text-xs text-muted-foreground">{copy.disclaimer}</p>
      </>
    ) : (
      // A result that does not read as an analysis is shown as a failure, never as a half page.
      <Message title={copy.failedTitle} body={copy.failedBody} />
    );
  } else if (status === "failed") {
    content = <Message title={copy.failedTitle} body={copy.failedBody} />;
  } else if (status === "withdrawn") {
    content = <Message title={copy.withdrawnTitle} body={copy.withdrawnBody} />;
  } else if (status === "paused") {
    content = <Message title={copy.pausedTitle} body={copy.pausedBody} />;
  } else if (status === "limit") {
    content = <Message body={cohort ? copy.limit : copy.limitSelf} />;
  } else if (isInProgress(status)) {
    content = stalled ? (
      <Message body={copy.stalled} />
    ) : (
      <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="size-2 shrink-0 rounded-full bg-brand motion-safe:animate-pulse" aria-hidden="true" />
        {progressText(status)}
      </div>
    );
  } else {
    content = null;
  }

  return (
    <section className={BOX} aria-label={copy.label}>
      <Label />
      {content}
      {loadFailed && !done && <p className="mt-2 text-xs text-muted-foreground">{copy.loadFailed}</p>}
    </section>
  );
}
