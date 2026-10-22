"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { AnalysisResult } from "@/app/components/lesson-player/blocks/analysis/AnalysisResult";
import { parseStoredAnalysis } from "@/lib/voice/analysis/parseStored";
import { STATE_LABEL, STATE_PILL, canHide, studioAnalysisState } from "@/lib/voice/analysis/studioList";
import { postJson } from "@/app/(studio)/studio/courses/[id]/postJson";
import { LocalTime } from "@/app/(studio)/studio/courses/[id]/LocalTime";
import { WriteArea } from "@/app/(studio)/studio/StudioWriteLock";

// VOICE-015 (docs/decisions/0190). One take's AI analysis as the author sees it: the learner's own
// renderer (AnalysisResult, VOICE-014), read-only, with the state, and "Hide" for a finished one.
// Used by the voice detail page and, collapsed, by the cohort review card. Hiding goes through
// hide_voice_analysis (096): it checks can_edit_course and the seat (083) itself, so the button
// being disabled under a lapsed seat (WriteArea) is a courtesy. Every stored string is a React text
// child inside AnalysisResult; nothing here sets HTML.

export type StudioAnalysisData = {
  submissionId: string;
  status: string;
  hiddenAt: string | null;
  transcript: string | null;
  result: unknown;
  promptVersion: string | null;
  model: string | null;
  baseline: { transcript: string; result: unknown } | null;
};

const SECONDARY_BUTTON =
  "cursor-pointer inline-flex min-h-11 items-center justify-center gap-1.5 px-4 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

function AiLabel() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-subtle px-2.5 py-1 text-xs font-medium text-brand-text">
      <Sparkles className="size-3.5" aria-hidden="true" />
      AI feedback
    </span>
  );
}

function HideAnalysis({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function hide() {
    setBusy(true);
    try {
      await postJson("/api/studio/voice/hide", { submissionId });
      toast.success("Analysis hidden.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WriteArea>
      <button type="button" onClick={() => setOpen(true)} disabled={busy} className={SECONDARY_BUTTON}>
        Hide this analysis
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hide this analysis?</AlertDialogTitle>
            <AlertDialogDescription>
              The learner will see &ldquo;Feedback withdrawn &mdash; send again&rdquo; instead of it, and the send
              counts for nothing against their limit, so they can send again. You will still see it here. This
              can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setOpen(false);
                void hide();
              }}
            >
              Hide analysis
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WriteArea>
  );
}

function Body({
  data,
  listenFor,
  showHeader = true,
}: {
  data: StudioAnalysisData;
  listenFor?: readonly string[];
  /** Off inside the review card's summary, which already carries the label and the state. */
  showHeader?: boolean;
}) {
  const state = studioAnalysisState(data);
  const shown = useMemo(() => {
    if (data.status !== "done" || typeof data.transcript !== "string") return null;
    const analysis = parseStoredAnalysis(data.result, data.transcript, data.baseline?.transcript ?? null);
    if (!analysis) return null;
    const base = data.baseline ? parseStoredAnalysis(data.baseline.result, data.baseline.transcript) : null;
    return { analysis, baseline: base && data.baseline ? { analysis: base, transcript: data.baseline.transcript } : null };
  }, [data]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {showHeader && (
          <>
            <AiLabel />
            <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATE_PILL[state]}`}>{STATE_LABEL[state]}</span>
          </>
        )}
        {data.promptVersion && (
          <span className="text-xs text-muted-foreground break-all">
            {data.promptVersion}
            {data.model ? ` · ${data.model}` : ""}
          </span>
        )}
      </div>

      {state === "withdrawn" && data.hiddenAt && (
        <p className="text-sm text-muted-foreground">
          Hidden <LocalTime iso={data.hiddenAt} />. The learner sees &ldquo;Feedback withdrawn &mdash; send
          again&rdquo;. What follows is what they saw.
        </p>
      )}
      {state === "working" && (
        <p className="text-sm text-muted-foreground">Still being analysed. Reload in a moment.</p>
      )}
      {state === "failed" && (
        <p className="text-sm text-muted-foreground">
          The analysis failed on our side. The learner was told, and the send does not count against their limit.
        </p>
      )}

      {(state === "done" || state === "withdrawn") &&
        (shown && data.transcript !== null ? (
          <AnalysisResult
            analysis={shown.analysis}
            transcript={data.transcript}
            baseline={shown.baseline}
            listenFor={listenFor}
          />
        ) : (
          <p className="text-sm text-muted-foreground">This analysis can&apos;t be displayed.</p>
        ))}

      {canHide(state) && <HideAnalysis submissionId={data.submissionId} />}
    </div>
  );
}

/**
 * `collapsible`: the review card's form, a native `<details>` so the queue stays short; the
 * learner's analysis opens beside the written-feedback box on a wide screen and under it on a phone.
 */
export function StudioAnalysis({
  data,
  listenFor,
  collapsible = false,
}: {
  data: StudioAnalysisData;
  listenFor?: readonly string[];
  collapsible?: boolean;
}) {
  if (!collapsible) return <Body data={data} listenFor={listenFor} />;
  const state = studioAnalysisState(data);
  return (
    <details className="rounded-xl border border-border bg-card px-3" data-studio="card-analysis">
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-2 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-brand">
        <AiLabel />
        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATE_PILL[state]}`}>{STATE_LABEL[state]}</span>
      </summary>
      <div className="pb-3">
        <Body data={data} listenFor={listenFor} showHeader={false} />
      </div>
    </details>
  );
}
