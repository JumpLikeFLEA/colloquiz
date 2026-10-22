"use client";

import { useId, useMemo, useState } from "react";
import { voiceAnalysisCopy as copy } from "@/lib/alliengll/voiceAnalysisCopy";
import {
  MARK_LABELS,
  buildSegments,
  markDetail,
  marksOf,
  type MarkKind,
  type ViewAnalysis,
} from "@/lib/voice/analysis/view";

/**
 * The learner's own words with the analysis laid over them (VOICE-014, docs/decisions/0189).
 * Every run is a React text child: a quote that contains `<b>` or `</transcript>` is drawn as
 * those characters, and nothing here can produce markup from them.
 *
 * A marked phrase is a real <button>: Enter and Space toggle its explanation, shown once below
 * the text (not beside each phrase, so a long explanation never breaks a sentence in two). A mark
 * is told apart by more than colour: the underline differs per kind and the key names each one.
 * An inline phrase cannot be given a 44px target without breaking the line, so every error is also
 * listed in full by AnalysisResult, a path that does not depend on tapping a phrase.
 */

const MARK_CLASS: Record<MarkKind, string> = {
  error: "bg-warning-subtle text-warning underline decoration-wavy decoration-1 underline-offset-4",
  strength: "bg-brand-subtle text-brand-text underline decoration-solid decoration-1 underline-offset-4",
  self_correction: "bg-brand-subtle text-brand-text underline decoration-dotted decoration-2 underline-offset-4",
  hesitation: "bg-muted text-foreground underline decoration-dashed decoration-1 underline-offset-4",
  expression: "bg-highlight text-highlight-foreground underline decoration-double decoration-1 underline-offset-4",
};

const MARK_BASE =
  "cursor-pointer rounded px-0.5 py-0.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand";

export function MarkedTranscript({ analysis, transcript }: { analysis: ViewAnalysis; transcript: string }) {
  const detailId = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const segments = useMemo(() => buildSegments(transcript, marksOf(analysis)), [analysis, transcript]);
  const kindsShown = useMemo(() => {
    const seen = new Set<MarkKind>();
    for (const s of segments) if (s.mark) seen.add(s.mark.kind);
    return (Object.keys(MARK_CLASS) as MarkKind[]).filter((k) => seen.has(k));
  }, [segments]);
  const detail = selected ? markDetail(analysis, selected) : null;

  return (
    <div className="flex flex-col gap-2">
      <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground">
        {segments.map((s, i) =>
          s.mark ? (
            <button
              key={i}
              type="button"
              aria-pressed={selected === s.mark.id}
              aria-describedby={detailId}
              onClick={() => setSelected((cur) => (cur === s.mark!.id ? null : s.mark!.id))}
              className={`${MARK_BASE} ${MARK_CLASS[s.mark.kind]} ${selected === s.mark.id ? "ring-2 ring-brand" : ""}`}
            >
              {s.text}
            </button>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </p>

      {kindsShown.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label={copy.legend}>
          {kindsShown.map((k) => (
            <li key={k} className="inline-flex items-center gap-1.5">
              <span className={`rounded px-1 ${MARK_CLASS[k]}`} aria-hidden="true">
                abc
              </span>
              {MARK_LABELS[k]}
            </li>
          ))}
        </ul>
      )}

      <div id={detailId} aria-live="polite" className="rounded-xl bg-muted px-3 py-2.5 text-sm">
        {detail ? (
          <>
            <p className="text-xs font-semibold text-muted-foreground">{detail.label}</p>
            <p className="mt-1 break-words text-foreground">“{detail.quote}”</p>
            {detail.correction && (
              <p className="mt-1 break-words font-medium text-foreground">
                {copy.better}: “{detail.correction}”
              </p>
            )}
            <p className="mt-1 break-words text-muted-foreground">{detail.text}</p>
          </>
        ) : (
          <p className="text-muted-foreground">{copy.tapHint}</p>
        )}
      </div>
    </div>
  );
}
