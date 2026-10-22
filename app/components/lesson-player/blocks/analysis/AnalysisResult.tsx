"use client";

import { ArrowRight, Target } from "lucide-react";
import { voiceAnalysisCopy as copy } from "@/lib/alliengll/voiceAnalysisCopy";
import { GOAL_REACHED_LABELS, statCards, type ViewAnalysis } from "@/lib/voice/analysis/view";
import { MarkedTranscript } from "./MarkedTranscript";

/**
 * A finished analysis, drawn (VOICE-014, docs/decisions/0189). Everything it shows is text taken
 * from the stored result, rendered as React text children: nothing here sets HTML.
 *
 * Order, top to bottom: what worked, the count cards (with the first take's figure on a final),
 * the learner's words with the marks, the lesson's expressions, the one error to fix (and all of
 * them under a disclosure), how it sounds, then the goal (a first), or the goal verdict, the
 * then/now pairs and the next step (a final). A final also holds the first take's feedback,
 * collapsed. The counts are what was marked, not a score (0156 Decision 1): no colour judges them.
 */

const SECTION_HEADING = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";
const CARD = "rounded-xl bg-muted px-3 py-2.5";

type Props = {
  analysis: ViewAnalysis;
  transcript: string;
  /** The first take's feedback, for a final. */
  baseline: { analysis: ViewAnalysis; transcript: string } | null;
  /** The task's own list, to name what was not used. Absent on a `before` task (the list stays hidden). */
  listenFor?: readonly string[];
  /** Drawn inside the Day 1 disclosure: no second baseline, no count deltas. */
  embedded?: boolean;
};

export function AnalysisResult({ analysis: a, transcript, baseline, listenFor, embedded = false }: Props) {
  const cards = statCards(a, baseline?.analysis ?? null);
  const main = a.mainError !== null ? a.errors[a.mainError] : null;
  const usedExpressions = new Set(a.expressionsUsed.map((e) => e.expression));
  const unused = (listenFor ?? []).filter((x) => !usedExpressions.has(x));

  return (
    <div className="flex flex-col gap-4">
      {a.summary && (
        <section className="flex flex-col gap-1">
          <h4 className={SECTION_HEADING}>{copy.whatWorked}</h4>
          <p className="break-words text-sm text-foreground">{a.summary}</p>
        </section>
      )}

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cards.map((c) => (
          <li key={c.key} className={CARD}>
            <p className="text-xl font-semibold tabular-nums text-foreground">{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.label}</p>
            {c.from !== null && !embedded && (
              <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                {copy.was} {c.from}
              </p>
            )}
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-2">
        <h4 className={SECTION_HEADING}>{copy.yourWords}</h4>
        <MarkedTranscript analysis={a} transcript={transcript} />
        {a.coverage.truncated && <p className="text-xs text-muted-foreground">{copy.truncated}</p>}
      </section>

      {(a.expressionsUsed.length > 0 || unused.length > 0) && (
        <section className="flex flex-col gap-1.5">
          <h4 className={SECTION_HEADING}>{copy.expressionsHeading}</h4>
          <ul className="flex flex-col gap-1 text-sm">
            {a.expressionsUsed.map((e, i) => (
              <li key={i} className="break-words text-foreground">
                <span className="font-medium">{e.expression}</span>
                <span className="text-muted-foreground">
                  {" "}
                  — {e.exact ? copy.expressionExact : copy.expressionClose}: “{e.quote}”
                </span>
              </li>
            ))}
          </ul>
          {unused.length > 0 && (
            <p className="break-words text-sm text-muted-foreground">
              {copy.notUsedYet} {unused.join(", ")}
            </p>
          )}
        </section>
      )}

      {main && (
        <section className="flex flex-col gap-1.5">
          <h4 className={SECTION_HEADING}>{copy.mainErrorHeading}</h4>
          <div className={CARD}>
            <p className="break-words text-sm text-foreground">
              {copy.youSaid}: “{main.quote}”
            </p>
            <p className="mt-1 break-words text-sm font-medium text-foreground">
              {copy.better}: “{main.correction}”
            </p>
            <p className="mt-1 break-words text-sm text-muted-foreground">{main.explanation}</p>
          </div>
        </section>
      )}

      {a.errors.length > 1 && (
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer list-none py-2.5 font-medium text-brand-text outline-none focus-visible:ring-2 focus-visible:ring-brand">
            {copy.allErrors} ({a.errors.length})
          </summary>
          <ul className="flex flex-col gap-2">
            {a.errors.map((e, i) => (
              <li key={i} className={CARD}>
                <p className="break-words text-foreground">
                  “{e.quote}” <ArrowRight className="inline size-3.5" aria-label="to" /> “{e.correction}”
                </p>
                <p className="mt-1 break-words text-muted-foreground">{e.explanation}</p>
              </li>
            ))}
          </ul>
        </details>
      )}

      {a.howItSounds && (
        <section className="flex flex-col gap-1">
          <h4 className={SECTION_HEADING}>{copy.howItSounds}</h4>
          <p className="break-words text-sm text-foreground">{a.howItSounds}</p>
        </section>
      )}

      {a.goal && (
        <section className="flex flex-col gap-1.5">
          <h4 className={SECTION_HEADING}>{copy.goalHeading}</h4>
          <div className="flex items-start gap-2 rounded-xl bg-brand-subtle px-3 py-2.5 text-brand-text">
            <Target className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="break-words text-sm font-medium">{a.goal}</p>
          </div>
        </section>
      )}

      {a.goalReached && (
        <section className="flex flex-col gap-1.5">
          <h4 className={SECTION_HEADING}>{copy.goalReachedHeading}</h4>
          <div className="rounded-xl bg-brand-subtle px-3 py-2.5 text-brand-text">
            <p className="text-sm font-semibold">{GOAL_REACHED_LABELS[a.goalReached.status]}</p>
            <p className="mt-1 break-words text-sm">{a.goalReached.note}</p>
          </div>
        </section>
      )}

      {a.thenNow.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h4 className={SECTION_HEADING}>{copy.thenNowHeading}</h4>
          <ul className="flex flex-col gap-2">
            {a.thenNow.map((p, i) => (
              <li key={i} className={CARD}>
                <p className="break-words text-sm text-muted-foreground">
                  {copy.then}: “{p.then}”
                </p>
                <p className="mt-0.5 break-words text-sm font-medium text-foreground">
                  {copy.now}: “{p.now}”
                </p>
                <p className="mt-1 break-words text-sm text-muted-foreground">{p.note}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {a.nextStep && (
        <section className="flex flex-col gap-1.5">
          <h4 className={SECTION_HEADING}>{copy.nextStepHeading}</h4>
          <div className="flex items-start gap-2 rounded-xl bg-brand-subtle px-3 py-2.5 text-brand-text">
            <Target className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="break-words text-sm font-medium">{a.nextStep}</p>
          </div>
        </section>
      )}

      {baseline && !embedded && (
        <details className="rounded-xl border border-border px-3">
          <summary className="min-h-11 cursor-pointer list-none py-2.5 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand">
            {copy.day1}
          </summary>
          <div className="pb-3">
            <AnalysisResult analysis={baseline.analysis} transcript={baseline.transcript} baseline={null} embedded />
          </div>
        </details>
      )}
    </div>
  );
}
