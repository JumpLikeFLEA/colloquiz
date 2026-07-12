"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Flag } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import type { ReportCategory } from "@/types";

const CATEGORIES: { value: ReportCategory; label: string }[] = [
  { value: "wrong_answer", label: "Wrong answer" },
  { value: "unclear", label: "Unclear or ambiguous" },
  { value: "typo", label: "Typo or formatting" },
  { value: "outdated", label: "Outdated" },
  { value: "other", label: "Other" },
];

// Inline report control. Renders a small "Report question" trigger; expands to
// the form in place (no modal) so the user can keep reading the question. The
// form mounts only while open, so its fields reset every time it's reopened —
// no state bleeds between different questions.
export function ReportQuestionInline({
  questionId,
  selectedAnswer,
  reported,
  onReported,
}: {
  questionId: string;
  selectedAnswer: string | null;
  reported: boolean;
  onReported: (questionId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (reported) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Flag size={13} /> Reported — thanks for the feedback
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
      >
        <Flag size={13} className="text-red-400" /> Report question
      </button>
    );
  }

  return (
    <ReportForm
      questionId={questionId}
      selectedAnswer={selectedAnswer}
      onCancel={() => setOpen(false)}
      onReported={onReported}
    />
  );
}

function ReportForm({
  questionId,
  selectedAnswer,
  onCancel,
  onReported,
}: {
  questionId: string;
  selectedAnswer: string | null;
  onCancel: () => void;
  onReported: (questionId: string) => void;
}) {
  const [category, setCategory] = useState<ReportCategory>("wrong_answer");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId,
          category,
          comment: comment.trim() || undefined,
          selectedAnswer,
        }),
      });
      if (res.status === 409) {
        // Already an open report from this user — treat as done.
        toast.success("You've already reported this question.");
        onReported(questionId);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not submit report.");
        return;
      }
      toast.success("Thanks — we'll review this question.");
      onReported(questionId);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4 rounded-2xl border border-border bg-muted/30">
      <p className="text-sm font-medium text-foreground">Report this question</p>

      <RadioGroup
        value={category}
        onValueChange={(v) => setCategory(v as ReportCategory)}
        className="gap-2.5"
      >
        {CATEGORIES.map((c) => (
          <label
            key={c.value}
            className="flex items-center gap-2.5 cursor-pointer text-sm text-foreground"
          >
            <RadioGroupItem
              value={c.value}
              className="size-4 border-2 border-muted-foreground/60"
            />
            {c.label}
          </label>
        ))}
      </RadioGroup>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`report-comment-${questionId}`}>Comment (optional)</Label>
        <Textarea
          id={`report-comment-${questionId}`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="What's wrong with this question?"
          rows={3}
          maxLength={2000}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={submitting}
          className="px-3 py-1.5 rounded-lg bg-[#4f46e5] text-white text-sm font-medium hover:bg-[#4338ca] disabled:opacity-50 transition-colors"
        >
          {submitting ? "Submitting…" : "Submit report"}
        </button>
      </div>
    </div>
  );
}
