"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, RefreshCw, ArrowRight, Dumbbell } from "lucide-react";
import { MathHtml } from "@/app/components/MathHtml";
import type { CoursePracticeItem } from "@/types";

type Phase = "answering" | "feedback";

/**
 * Unlimited free practice for a stage. Each item comes from draw_practice_item
 * (unseen siblings first, then least-recently-seen — never a dead end). Feedback
 * is immediate and local (the item ships correctAnswer, like the quiz engine),
 * while record_practice_answer independently writes the server-truth seen record
 * that drives draw order and needs_review. Practice never touches progress.
 */
export function PracticePlayer({ stageId }: { stageId: string }) {
  const [item, setItem] = useState<CoursePracticeItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("answering");
  const [showExplanation, setShowExplanation] = useState(false);
  const [answered, setAnswered] = useState(0);

  // Button handler ("Next question" / "Try again"): reset synchronously for an
  // instant transition, then fetch and apply in the promise callbacks. setState
  // in a handler is unrestricted; the callbacks keep it out of any effect body.
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setSelected(null);
    setPhase("answering");
    setShowExplanation(false);
    fetch(`/api/courses/stages/${stageId}/practice`)
      .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (!ok || !data.ok) {
          setError(data.error ?? "Could not load a question.");
          setItem(null);
        } else {
          setItem(data.item as CoursePracticeItem);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Network error. Please try again.");
        setItem(null);
        setLoading(false);
      });
  }, [stageId]);

  // Mount / stage-change: fetch the first item. setState lives only inside the
  // promise callbacks (never synchronously in the effect body), the same shape
  // NotificationBell uses — satisfies react-hooks/set-state-in-effect.
  useEffect(() => {
    let active = true;
    fetch(`/api/courses/stages/${stageId}/practice`)
      .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (!active) return;
        if (!ok || !data.ok) {
          setError(data.error ?? "Could not load a question.");
          setItem(null);
        } else {
          setItem(data.item as CoursePracticeItem);
        }
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setError("Network error. Please try again.");
          setItem(null);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [stageId]);

  function handleSelect(i: number) {
    if (phase === "feedback" || !item) return;
    setSelected(i);
    setPhase("feedback");
    setAnswered((n) => n + 1);
    // Record server-side (server-truth grading). Fire-and-forget: the UI already
    // shows local feedback, and the seen-record is not blocking.
    void fetch(`/api/courses/stages/${stageId}/practice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: item.id, answer: item.options[i].raw }),
    }).catch(() => {});
  }

  if (loading && !item) {
    return <p className="text-sm text-muted-foreground py-8">Loading a question…</p>;
  }

  if (error && !item) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <button
          onClick={() => void load()}
          className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-accent transition-colors"
        >
          <RefreshCw size={15} /> Try again
        </button>
      </div>
    );
  }

  if (!item) return null;

  const isCorrect = selected !== null && item.options[selected].raw === item.correctAnswer;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Dumbbell size={15} /> Practice — no score, drill as long as you like
        </span>
        {answered > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">{answered} answered</span>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={item.id + ":" + answered}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="flex flex-col gap-6"
        >
          <div className="flex flex-col gap-4 p-6 rounded-2xl border border-border bg-card">
            <MathHtml className="text-foreground leading-relaxed" html={item.questionHtml} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {item.options.map((option, i) => {
              const letter = String.fromCharCode(65 + i);
              const isCorrectOption = option.raw === item.correctAnswer;

              let optionClass =
                "border-border bg-card hover:border-brand/50 hover:bg-brand-subtle/50 cursor-pointer";
              let letterClass = "bg-muted text-muted-foreground";
              let textClass = "text-foreground";

              if (phase === "feedback" && selected !== null) {
                if (isCorrectOption) {
                  optionClass = "border-success bg-success-subtle";
                  letterClass = "bg-success text-success-foreground";
                  textClass = "text-success";
                } else if (i === selected) {
                  optionClass = "border-destructive bg-destructive-subtle";
                  letterClass = "bg-destructive text-destructive-foreground";
                  textClass = "text-destructive-text";
                } else {
                  optionClass = "border-border bg-card opacity-50 cursor-default";
                }
              }

              return (
                <button
                  key={i}
                  onClick={() => handleSelect(i)}
                  disabled={phase === "feedback"}
                  className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all w-full ${optionClass}`}
                >
                  <span
                    className={`flex items-center justify-center w-8 h-8 rounded-xl shrink-0 text-sm font-semibold transition-all ${letterClass}`}
                  >
                    {phase === "feedback" && isCorrectOption ? (
                      <CheckCircle2 size={16} />
                    ) : phase === "feedback" && i === selected && !isCorrectOption ? (
                      <XCircle size={16} />
                    ) : (
                      letter
                    )}
                  </span>
                  <MathHtml
                    className={`text-sm leading-snug transition-colors ${textClass}`}
                    html={option.html}
                  />
                </button>
              );
            })}
          </div>

          <AnimatePresence>
            {phase === "feedback" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex flex-col gap-3 p-4 rounded-2xl ${
                  isCorrect
                    ? "bg-success-subtle border border-success-border"
                    : "bg-destructive-subtle border border-destructive-border"
                }`}
              >
                <div className="flex items-center gap-2">
                  {isCorrect ? (
                    <CheckCircle2 size={18} className="text-success shrink-0" />
                  ) : (
                    <XCircle size={18} className="text-destructive-text shrink-0" />
                  )}
                  <p
                    className={`font-medium text-sm ${isCorrect ? "text-success" : "text-destructive-text"}`}
                  >
                    {isCorrect ? "Correct!" : "Not quite — the correct answer is highlighted above."}
                  </p>
                  {item.explanationHtml && (
                    <button
                      onClick={() => setShowExplanation((v) => !v)}
                      className={`ml-auto text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-colors ${
                        isCorrect
                          ? "border-success-border text-success hover:bg-success-subtle-hover"
                          : "border-destructive-border text-destructive-text hover:bg-destructive-subtle-hover"
                      }`}
                    >
                      {showExplanation ? "Hide" : "Explain"}
                    </button>
                  )}
                </div>
                <AnimatePresence>
                  {showExplanation && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <MathHtml
                        className={`text-sm ${isCorrect ? "text-success" : "text-destructive-text"}`}
                        html={item.explanationHtml}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {phase === "feedback" && (
            <div className="flex justify-end">
              <button
                onClick={() => void load()}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand text-white hover:bg-brand-hover transition-colors cursor-pointer"
              >
                Next question <ArrowRight size={16} />
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
