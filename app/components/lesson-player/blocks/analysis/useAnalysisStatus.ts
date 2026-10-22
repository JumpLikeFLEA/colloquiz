"use client";

import { useEffect, useState } from "react";
import {
  isInProgress,
  parseStatusBody,
  pollDelayMs,
  shouldGiveUp,
  type AnalysisStatusBody,
} from "@/lib/voice/analysis/view";

/**
 * Polls GET /api/voice/submissions/<id>/analysis until the analysis is settled (VOICE-014,
 * docs/decisions/0189). The wait grows from 2 s to 15 s, polling stops after five minutes, and it
 * pauses while the tab is hidden: a hidden tab asks for nothing, and the first moment it is
 * visible again it asks at once. A failed request is retried on the same schedule and clears
 * itself on the next good answer.
 *
 * Mount it with `key={submissionId}`: a new take is a new hook, so nothing needs resetting.
 */

export type StatusFetcher = (submissionId: string) => Promise<unknown>;

export const fetchAnalysisStatus: StatusFetcher = async (submissionId) => {
  const res = await fetch(`/api/voice/submissions/${encodeURIComponent(submissionId)}/analysis`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
};

export type AnalysisStatusState = {
  body: AnalysisStatusBody | null;
  /** The last request failed and no answer has arrived since. */
  loadFailed: boolean;
  /** Polling gave up while the analysis was still in progress. */
  stalled: boolean;
};

export function useAnalysisStatus(
  submissionId: string,
  fetchStatus: StatusFetcher = fetchAnalysisStatus,
): AnalysisStatusState {
  const [state, setState] = useState<AnalysisStatusState>({ body: null, loadFailed: false, stalled: false });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let paused = false;
    let inFlight = false;
    const startedAt = Date.now();

    const schedule = () => {
      if (cancelled) return;
      if (document.hidden) {
        paused = true;
        return;
      }
      timer = setTimeout(poll, pollDelayMs(attempt++));
    };

    async function poll() {
      if (cancelled || inFlight) return;
      inFlight = true;
      let body: AnalysisStatusBody | null = null;
      let failed = false;
      try {
        body = parseStatusBody(await fetchStatus(submissionId));
        failed = body === null;
      } catch {
        failed = true;
      }
      inFlight = false;
      if (cancelled) return;

      const settled = body !== null && !isInProgress(body.status);
      const gaveUp = !settled && shouldGiveUp(Date.now() - startedAt);
      setState((prev) => ({
        body: body ?? prev.body,
        loadFailed: failed,
        stalled: gaveUp,
      }));
      if (!settled && !gaveUp) schedule();
    }

    const onVisibility = () => {
      if (cancelled) return;
      if (document.hidden) {
        // A wait already running is cancelled: a hidden tab asks for nothing.
        clearTimeout(timer);
        // A request in flight finishes first; its schedule() then sees the hidden tab and pauses.
        if (!inFlight) paused = true;
        return;
      }
      if (!paused) return;
      paused = false;
      void poll();
    };
    document.addEventListener("visibilitychange", onVisibility);

    if (document.hidden) paused = true;
    else void poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [submissionId, fetchStatus]);

  return state;
}
