"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  ArrowRight,
  RefreshCw,
  Sparkles,
  History,
} from "lucide-react";
import { MathHtml } from "@/app/components/MathHtml";
import type { StageDetail } from "@/lib/courses";
import { stageHref } from "@/lib/courseFilters";
import type { CourseCheckItem, CourseCheckResult } from "@/types";

type Phase = "intro" | "taking" | "submitting" | "results";

/**
 * The graded knowledge check that gates the next stage. Questions ship with NO
 * correct answer (submit_stage_check grades server-side over the RECORDED items,
 * new items only). New and review items are labelled; the score is new-only.
 * Idempotent-start means a refresh mid-check resumes the same attempt with the
 * same option order, and a retake draws fresh.
 */
export function CheckPlayer({ detail }: { detail: StageDetail }) {
  const router = useRouter();
  const { stage } = detail;

  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [items, setItems] = useState<CourseCheckItem[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<CourseCheckResult | null>(null);

  const itemsById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  const answeredCount = Object.keys(answers).length;

  async function start() {
    // Clear any prior items/result so a retake from the results screen shows the
    // intro loading state rather than flashing the previous attempt's questions.
    setItems([]);
    setResult(null);
    setPhase("submitting");
    setError(null);
    try {
      const res = await fetch(`/api/courses/stages/${stage.id}/check`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not start the check.");
        setPhase("intro");
        return;
      }
      setAttemptId(data.attemptId as string);
      setItems(data.items as CourseCheckItem[]);
      setAnswers({});
      setResult(null);
      setPhase("taking");
    } catch {
      setError("Network error. Please try again.");
      setPhase("intro");
    }
  }

  async function submit() {
    if (!attemptId) return;
    setPhase("submitting");
    setError(null);
    try {
      const res = await fetch(`/api/courses/stages/${stage.id}/check`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId, answers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not submit the check.");
        setPhase("taking");
        return;
      }
      setResult(data.result as CourseCheckResult);
      setPhase("results");
      // Refresh server props so the stage's state and the next stage's unlock
      // reflect a pass without a manual reload.
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setPhase("taking");
    }
  }

  // ── intro ─────────────────────────────────────────────────
  if (phase === "intro" || (phase === "submitting" && items.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-center rounded-2xl border border-border bg-card">
        <div className="w-12 h-12 rounded-2xl bg-brand-subtle text-brand-text flex items-center justify-center">
          <ClipboardCheck size={24} />
        </div>
        <div className="space-y-1 max-w-md">
          <p className="font-semibold text-foreground">Knowledge check</p>
          <p className="text-sm text-muted-foreground">
            Answer the new questions to pass at {Math.round(detail.course.passThreshold)}%. Some
            items may revisit earlier stages — those are marked and don&apos;t count toward this
            score. Unlimited retakes, each with a fresh draw.
          </p>
        </div>
        {detail.attempts > 0 && detail.bestScore != null && (
          <p className="text-xs text-muted-foreground">
            Best so far: {Math.round(detail.bestScore)}%
          </p>
        )}
        <button
          onClick={start}
          disabled={phase === "submitting"}
          className="cursor-pointer disabled:cursor-not-allowed inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
        >
          {phase === "submitting"
            ? "Loading…"
            : detail.attempts > 0
              ? "Retake check"
              : "Start check"}
        </button>
        {error && (
          <div className="px-3 py-2 rounded-lg bg-destructive-subtle border border-destructive-border text-sm text-destructive-text">
            {error}
          </div>
        )}
      </div>
    );
  }

  // ── results ───────────────────────────────────────────────
  if (phase === "results" && result) {
    return (
      <CheckResults
        detail={detail}
        result={result}
        itemsById={itemsById}
        onRetake={start}
      />
    );
  }

  // ── taking ────────────────────────────────────────────────
  const submitting = phase === "submitting";
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <ClipboardCheck size={15} /> Answer every question, then submit
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {answeredCount} / {items.length} answered
        </span>
      </div>

      <div className="space-y-5">
        {items.map((item, qi) => (
          <CheckQuestion
            key={item.id}
            index={qi}
            item={item}
            selected={answers[item.id] ?? null}
            disabled={submitting}
            onSelect={(raw) => setAnswers((a) => ({ ...a, [item.id]: raw }))}
          />
        ))}
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-destructive-subtle border border-destructive-border text-sm text-destructive-text">
          {error}
        </div>
      )}

      <div className="flex flex-col items-end gap-2">
        <button
          onClick={submit}
          disabled={submitting}
          className="cursor-pointer disabled:cursor-not-allowed flex items-center gap-2 px-6 py-3 rounded-xl bg-brand text-white hover:bg-brand-hover disabled:opacity-50 transition-colors"
        >
          {submitting ? "Submitting…" : "Submit check"}
          {!submitting && <ArrowRight size={16} />}
        </button>
        {answeredCount < items.length && (
          <p className="text-xs text-muted-foreground">
            {items.length - answeredCount} unanswered will be marked wrong.
          </p>
        )}
      </div>
    </div>
  );
}

function CheckQuestion({
  index,
  item,
  selected,
  disabled,
  onSelect,
}: {
  index: number;
  item: CourseCheckItem;
  selected: string | null;
  disabled: boolean;
  onSelect: (raw: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-6 rounded-2xl border border-border bg-card">
      <div className="flex items-start gap-3">
        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-brand-subtle text-brand-text shrink-0 font-medium text-sm">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0 pt-1">
          {item.isReview && (
            <span className="inline-flex items-center gap-1 mb-2 text-xs font-medium text-warning">
              <History size={12} /> Review · not scored
            </span>
          )}
          <MathHtml className="text-foreground leading-relaxed block" html={item.questionHtml} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {item.options.map((option, i) => {
          const letter = String.fromCharCode(65 + i);
          const isSelected = option.raw === selected;
          return (
            <button
              key={i}
              onClick={() => onSelect(option.raw)}
              disabled={disabled}
              className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all w-full disabled:cursor-not-allowed ${
                isSelected
                  ? "border-brand bg-brand-subtle"
                  : "border-border bg-card hover:border-brand/50 hover:bg-brand-subtle/50 cursor-pointer"
              }`}
            >
              <span
                className={`flex items-center justify-center w-8 h-8 rounded-xl shrink-0 text-sm font-semibold transition-all ${
                  isSelected ? "bg-brand text-white" : "bg-muted text-muted-foreground"
                }`}
              >
                {letter}
              </span>
              <MathHtml
                className={`text-sm leading-snug transition-colors ${isSelected ? "text-brand-text" : "text-foreground"}`}
                html={option.html}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CheckResults({
  detail,
  result,
  itemsById,
  onRetake,
}: {
  detail: StageDetail;
  result: CourseCheckResult;
  itemsById: Map<string, CourseCheckItem>;
  onRetake: () => void;
}) {
  const { course, stage } = detail;
  const passed = result.passed;

  // Rendered given/correct come from the item's own options (client can't render
  // katex): look each raw string up to its pre-rendered html.
  function optionHtml(item: CourseCheckItem | undefined, raw: string | null): string | null {
    if (!item || raw == null) return null;
    return item.options.find((o) => o.raw === raw)?.html ?? null;
  }

  return (
    <div className="space-y-6">
      <div
        className={`flex flex-col items-center justify-center gap-3 py-10 text-center rounded-2xl border ${
          passed
            ? "bg-success-subtle border-success-border"
            : "bg-destructive-subtle border-destructive-border"
        }`}
      >
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
            passed ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"
          }`}
        >
          {passed ? <Sparkles size={26} /> : <RefreshCw size={26} />}
        </div>
        <p className={`text-2xl font-bold ${passed ? "text-success" : "text-destructive-text"}`}>
          {Math.round(result.score)}%
        </p>
        <p className={`font-medium ${passed ? "text-success" : "text-destructive-text"}`}>
          {passed ? "Stage complete!" : `Not passed — you need ${Math.round(course.passThreshold)}%`}
        </p>
        <p className="text-sm text-muted-foreground">
          {result.newCorrect} of {result.newTotal} new questions correct
          {result.reviewTotal > 0 &&
            ` · ${result.reviewCorrect} of ${result.reviewTotal} review correct`}
        </p>
      </div>

      <div className="space-y-3">
        {result.results.map((r) => {
          const item = itemsById.get(r.questionId);
          const givenHtml = optionHtml(item, r.given);
          const correctHtml = optionHtml(item, r.correctAnswer);
          return (
            <div
              key={r.questionId}
              className="flex flex-col gap-3 p-5 rounded-2xl border border-border bg-card"
            >
              <div className="flex items-start gap-3">
                <span className="shrink-0 mt-0.5">
                  {r.correct ? (
                    <CheckCircle2 size={18} className="text-success" />
                  ) : (
                    <XCircle size={18} className="text-destructive-text" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  {r.isReview && (
                    <span className="inline-flex items-center gap-1 mb-1.5 text-xs font-medium text-warning">
                      <History size={12} /> Review · not scored
                    </span>
                  )}
                  {item ? (
                    <MathHtml className="text-foreground leading-relaxed block" html={item.questionHtml} />
                  ) : (
                    <p className="text-sm text-muted-foreground">This question is no longer available.</p>
                  )}
                </div>
              </div>

              <div className="pl-8 space-y-1.5 text-sm">
                {!r.correct && (
                  <p className="flex flex-wrap items-baseline gap-1.5 text-destructive-text">
                    <span className="text-muted-foreground">Your answer:</span>
                    {givenHtml ? (
                      <MathHtml html={givenHtml} />
                    ) : (
                      <span className="text-muted-foreground italic">not answered</span>
                    )}
                  </p>
                )}
                <p className="flex flex-wrap items-baseline gap-1.5 text-success">
                  <span className="text-muted-foreground">Correct answer:</span>
                  {correctHtml ? <MathHtml html={correctHtml} /> : <span>{r.correctAnswer}</span>}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
        {passed && detail.next ? (
          <Link
            href={stageHref(course.slug, detail.next.key)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors"
          >
            Next stage: {detail.next.title} <ArrowRight size={15} />
          </Link>
        ) : passed ? (
          <Link
            href={`/courses/${course.slug}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors"
          >
            Back to syllabus <ArrowRight size={15} />
          </Link>
        ) : (
          <button
            onClick={onRetake}
            className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors"
          >
            <RefreshCw size={15} /> Retake check
          </button>
        )}
        <Link
          href={stageHref(course.slug, stage.key, "practice")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Keep practising
        </Link>
      </div>
    </div>
  );
}
