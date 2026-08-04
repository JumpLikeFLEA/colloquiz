"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X, Pencil, Save, Ban, CircleCheck, CircleAlert, CircleHelp, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { Label } from "@/app/components/ui/label";
import { RichText } from "@/app/components/RichText";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { cn } from "@/lib/utils";
import { answerOptions } from "@/lib/options";
import type { Question, QuestionCriticNotes, Difficulty } from "@/types";

interface Props {
  initial: Question[];
  currentPage: number;
  totalPages: number;
  total: number;
  pageSize: number;
}

export type EditDraft = {
  question: string;
  options: [string, string, string, string];
  correct_answer: string;
  explanation: string;
  difficulty: Difficulty;
};

export function ReviewQueue({ initial, currentPage, totalPages, total, pageSize }: Props) {
  const router = useRouter();
  const [questions, setQuestions] = React.useState<Question[]>(initial);

  if (questions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        {total === 0
          ? "The queue is empty. New AI-generated batches will appear here."
          : "No questions on this page."}
      </div>
    );
  }

  function removeFromList(id: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  function patchInList(id: string, changes: Partial<Question>) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...changes } : q)));
  }

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, total);

  return (
    <div className="space-y-4">
      {questions.map((q) => (
        <ReviewCard
          key={q.id}
          question={q}
          onApproved={() => {
            removeFromList(q.id);
            router.refresh();
          }}
          onRejected={() => {
            removeFromList(q.id);
            router.refresh();
          }}
          onEdited={(changes) => patchInList(q.id, changes)}
        />
      ))}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Showing {start}–{end} of {total}
          </p>
          <div className="flex items-center gap-2">
            {currentPage > 1 ? (
              <Link
                href={`/admin/review?page=${currentPage - 1}`}
                className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
              >
                <ChevronLeft className="size-4" /> Previous
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm text-muted-foreground opacity-50">
                <ChevronLeft className="size-4" /> Previous
              </span>
            )}
            <span className="text-sm text-muted-foreground tabular-nums px-2">
              Page {currentPage} of {totalPages}
            </span>
            {currentPage < totalPages ? (
              <Link
                href={`/admin/review?page=${currentPage + 1}`}
                className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
              >
                Next <ChevronRight className="size-4" />
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm text-muted-foreground opacity-50">
                Next <ChevronRight className="size-4" />
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Single question card ────────────────────────────────────────────────────

function ReviewCard({
  question,
  onApproved,
  onRejected,
  onEdited,
}: {
  question: Question;
  onApproved: () => void;
  onRejected: () => void;
  onEdited: (changes: Partial<Question>) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/questions/${question.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Request failed");
        return false;
      }
      return true;
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    const ok = await patch({ status: "approved" });
    if (ok) {
      toast.success("Approved");
      onApproved();
    }
  }

  async function handleReject() {
    const ok = await patch({ status: "rejected" });
    if (ok) {
      toast.success("Rejected");
      onRejected();
    }
  }

  async function handleSaveEdit(draft: EditDraft, approve: boolean) {
    const body: Record<string, unknown> = {
      question: draft.question,
      options: draft.options,
      correct_answer: draft.correct_answer,
      explanation: draft.explanation,
      difficulty: draft.difficulty,
    };
    if (approve) body.status = "approved";

    const ok = await patch(body);
    if (!ok) return;

    if (approve) {
      toast.success("Saved and approved");
      onApproved();
    } else {
      toast.success("Saved");
      onEdited({
        question: draft.question,
        options: draft.options,
        correct_answer: draft.correct_answer,
        explanation: draft.explanation,
        difficulty: draft.difficulty,
      });
      setEditing(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 flex-wrap">
        <Badge variant="secondary">{question.subject}</Badge>
        <DifficultyBadge difficulty={question.difficulty} />
        {question.tags.map((t) => (
          <Badge key={t} variant="outline" className="font-normal">{t}</Badge>
        ))}
        <span className="ml-auto text-xs text-muted-foreground font-mono">
          {question.id}
        </span>
      </CardHeader>

      <CardContent className="space-y-4">
        {editing ? (
          <EditForm
            initial={{
              question: question.question,
              options: question.options,
              correct_answer: question.correct_answer,
              explanation: question.explanation,
              difficulty: question.difficulty,
            }}
            loading={loading}
            onCancel={() => setEditing(false)}
            onSave={(draft) => handleSaveEdit(draft, false)}
            onSaveAndApprove={(draft) => handleSaveEdit(draft, true)}
          />
        ) : (
          <ReadMode question={question} />
        )}

        {question.critic_notes && <CriticPanel report={question.critic_notes} />}

        {!editing && (
          <div className="flex gap-2 pt-2">
            <Button onClick={handleApprove} disabled={loading} className="bg-success hover:bg-success-hover">
              <Check className="size-4" /> Approve
            </Button>
            <Button onClick={() => setEditing(true)} disabled={loading} variant="outline">
              <Pencil className="size-4" /> Edit
            </Button>
            <Button onClick={handleReject} disabled={loading} variant="outline" className="ml-auto text-destructive-text hover:bg-destructive-subtle hover:text-destructive-text">
              <Ban className="size-4" /> Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Read-only display of the question ───────────────────────────────────────

export function ReadMode({ question }: { question: Question }) {
  return (
    <>
      <p className="font-medium leading-relaxed"><RichText text={question.question} /></p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {answerOptions(question.options).map((opt, i) => {
          const isCorrect = opt === question.correct_answer;
          return (
            <div
              key={i}
              className={cn(
                "rounded-md border px-3 py-2 text-sm",
                isCorrect
                  ? "border-success-border bg-success-subtle text-success"
                  : "border-border bg-muted/30"
              )}
            >
              <span className="font-mono text-xs text-muted-foreground mr-2">
                {String.fromCharCode(65 + i)}
              </span>
              <RichText text={opt} />
              {isCorrect && <Check className="inline size-3.5 ml-1.5 text-success" />}
            </div>
          );
        })}
      </div>
      <div className="rounded-md bg-muted/40 p-3 text-sm">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
          Explanation
        </p>
        <p className="leading-relaxed"><RichText text={question.explanation} /></p>
      </div>
    </>
  );
}

// ── Edit form ───────────────────────────────────────────────────────────────

export function EditForm({
  initial,
  loading,
  onCancel,
  onSave,
  onSaveAndApprove,
  saveAndApproveLabel = "Save & Approve",
}: {
  initial: EditDraft;
  loading: boolean;
  onCancel: () => void;
  onSave: (draft: EditDraft) => void;
  onSaveAndApprove: (draft: EditDraft) => void;
  saveAndApproveLabel?: string;
}) {
  const [draft, setDraft] = React.useState<EditDraft>(initial);

  function patchDraft(p: Partial<EditDraft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function setOption(idx: number, value: string) {
    const newOptions = [...draft.options] as [string, string, string, string];
    newOptions[idx] = value;
    // Keep correct_answer in sync if the edited option was the correct one
    const newCorrect = draft.correct_answer === draft.options[idx] ? value : draft.correct_answer;
    patchDraft({ options: newOptions, correct_answer: newCorrect });
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="q-text">Question</Label>
        <Textarea
          id="q-text"
          value={draft.question}
          onChange={(e) => patchDraft({ question: e.target.value })}
          rows={2}
        />
      </div>

      <div>
        <Label>Options (select the correct one)</Label>
        <div className="space-y-2 mt-1">
          {draft.options.map((opt, i) => {
            const isCorrect = draft.correct_answer === opt;
            return (
              <div key={i} className="flex items-start gap-2">
                <input
                  type="radio"
                  name="correct"
                  checked={isCorrect}
                  onChange={() => patchDraft({ correct_answer: opt })}
                  className="mt-2.5"
                />
                <span className="text-sm text-muted-foreground font-mono mt-2 w-4">
                  {String.fromCharCode(65 + i)}
                </span>
                <Input
                  value={opt}
                  onChange={(e) => setOption(i, e.target.value)}
                  className={cn("flex-1", isCorrect && "border-success-border")}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <Label htmlFor="q-explain">Explanation</Label>
        <Textarea
          id="q-explain"
          value={draft.explanation}
          onChange={(e) => patchDraft({ explanation: e.target.value })}
          rows={4}
        />
      </div>

      <div>
        <Label htmlFor="q-diff">Difficulty</Label>
        <Select
          value={draft.difficulty}
          onValueChange={(v) => patchDraft({ difficulty: v as Difficulty })}
        >
          <SelectTrigger id="q-diff" className="bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="easy">easy</SelectItem>
            <SelectItem value="medium">medium</SelectItem>
            <SelectItem value="hard">hard</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 pt-2">
        <Button onClick={() => onSave(draft)} disabled={loading} variant="outline">
          <Save className="size-4" /> Save
        </Button>
        <Button
          onClick={() => onSaveAndApprove(draft)}
          disabled={loading}
          className="bg-success hover:bg-success-hover"
        >
          <Check className="size-4" /> {saveAndApproveLabel}
        </Button>
        <Button onClick={onCancel} disabled={loading} variant="ghost" className="ml-auto">
          <X className="size-4" /> Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Critic panel ────────────────────────────────────────────────────────────

function CriticPanel({ report }: { report: QuestionCriticNotes }) {
  return (
    <div className="rounded-md border border-brand-border bg-brand-subtle/40 p-3 space-y-2">
      <p className="text-xs font-medium text-brand-text uppercase tracking-wide">
        Critic Report
      </p>
      <div className="flex flex-wrap gap-2 text-xs">
        <CheckBadge label="Correctness" value={report.correctness_check} />
        <CheckBadge label="Ambiguity" value={report.ambiguity_check} />
        <span className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5">
          <span className="text-muted-foreground">Distractors</span>
          <span className="font-medium">{report.distractor_quality}/5</span>
        </span>
      </div>
      {report.notes && (
        <p className="text-sm text-brand-text leading-relaxed">{report.notes}</p>
      )}
    </div>
  );
}

function CheckBadge({ label, value }: { label: string; value: "pass" | "fail" | "unsure" }) {
  const Icon = value === "pass" ? CircleCheck : value === "fail" ? CircleAlert : CircleHelp;
  const cls =
    value === "pass"
      ? "text-success bg-success-subtle border-success-border"
      : value === "fail"
      ? "text-destructive-text bg-destructive-subtle border-destructive-border"
      : "text-warning bg-warning-subtle border-warning-border";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5", cls)}>
      <Icon className="size-3" />
      <span className="font-medium">{label}</span>
      <span className="opacity-70">{value}</span>
    </span>
  );
}

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const cls =
    difficulty === "easy"
      ? "bg-success-subtle text-success border-success-border"
      : difficulty === "medium"
      ? "bg-warning-subtle text-warning border-warning-border"
      : "bg-destructive-subtle text-destructive-text border-destructive-border";
  return <Badge variant="outline" className={cls}>{difficulty}</Badge>;
}
