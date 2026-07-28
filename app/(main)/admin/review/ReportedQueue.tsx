"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Ban, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/app/components/ui/card";
import { Textarea } from "@/app/components/ui/textarea";
import { Label } from "@/app/components/ui/label";
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
import type { ReportCategory, ReportResolution, ReportedQuestionGroup } from "@/types";
import { ReadMode, EditForm, DifficultyBadge, type EditDraft } from "./ReviewQueue";

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  wrong_answer: "Wrong answer",
  unclear: "Unclear",
  typo: "Typo",
  outdated: "Outdated",
  other: "Other",
};

export function ReportedQueue({ initial }: { initial: ReportedQuestionGroup[] }) {
  const router = useRouter();
  const [groups, setGroups] = React.useState<ReportedQuestionGroup[]>(initial);

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        No reported questions. User reports will appear here for review.
      </div>
    );
  }

  function removeGroup(questionId: string) {
    setGroups((prev) => prev.filter((g) => g.question.id !== questionId));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <ReportedCard key={group.question.id} group={group} onResolved={removeGroup} />
      ))}
    </div>
  );
}

function ReportedCard({
  group,
  onResolved,
}: {
  group: ReportedQuestionGroup;
  onResolved: (questionId: string) => void;
}) {
  const { question, reports } = group;
  const [editing, setEditing] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const inPool = question.status === "approved";

  async function resolve(resolution: ReportResolution): Promise<boolean> {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, resolution, note: note.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not resolve reports.");
        return false;
      }
      return true;
    } catch {
      setError("Network error. Please try again.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function saveQuestion(draft: EditDraft): Promise<boolean> {
    const res = await fetch(`/api/admin/questions/${question.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: draft.question,
        options: draft.options,
        correct_answer: draft.correct_answer,
        explanation: draft.explanation,
        difficulty: draft.difficulty,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save the question.");
      return false;
    }
    return true;
  }

  async function handleSaveAndResolve(draft: EditDraft) {
    setLoading(true);
    const saved = await saveQuestion(draft);
    if (!saved) {
      setLoading(false);
      return;
    }
    setLoading(false);
    const ok = await resolve("edited");
    if (ok) {
      toast.success("Saved and resolved");
      onResolved(question.id);
    }
  }

  // Save the edit without resolving — the reports stay open for another look.
  async function handleSaveOnly(draft: EditDraft) {
    setLoading(true);
    const saved = await saveQuestion(draft);
    setLoading(false);
    if (saved) {
      toast.success("Saved");
      setEditing(false);
    }
  }

  async function handleDismiss() {
    const ok = await resolve("dismissed");
    if (ok) {
      toast.success("Dismissed");
      onResolved(question.id);
    }
  }

  async function handleRemove() {
    setConfirmRemove(false);
    const ok = await resolve("removed");
    if (ok) {
      toast.success("Removed from the pool");
      onResolved(question.id);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 flex-wrap">
        <Badge variant="secondary">{question.subject}</Badge>
        <DifficultyBadge difficulty={question.difficulty} />
        <Badge variant="outline" className="bg-destructive-subtle text-destructive-text border-destructive-border">
          {reports.length} report{reports.length === 1 ? "" : "s"}
        </Badge>
        {!inPool && (
          <Badge variant="outline" className="bg-warning-subtle text-warning border-warning-border">
            no longer in pool ({question.status})
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground font-mono">{question.id}</span>
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
            onSave={handleSaveOnly}
            onSaveAndApprove={handleSaveAndResolve}
            saveAndApproveLabel="Save & Resolve"
          />
        ) : (
          <ReadMode question={question} />
        )}

        {/* Reports */}
        <div className="rounded-md border border-destructive-border bg-destructive-subtle/40 p-3 space-y-3">
          <p className="text-xs font-medium text-destructive-text uppercase tracking-wide">
            Reports ({reports.length})
          </p>
          {reports.map((r) => (
            <div key={r.id} className="space-y-1 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="bg-card border-destructive-border text-destructive-text">
                  {CATEGORY_LABELS[r.category]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
              {r.comment && <p className="text-foreground/80 leading-relaxed">{r.comment}</p>}
              <p className="text-xs text-muted-foreground">
                {r.reported_answer ? (
                  <>Answered: &ldquo;{r.reported_answer}&rdquo;</>
                ) : (
                  <>Did not answer</>
                )}
              </p>
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-destructive-text">{error}</p>}

        {!editing && (
          <>
            <div>
              <Label htmlFor={`note-${question.id}`}>Resolution note (optional, sent to reporters)</Label>
              <Textarea
                id={`note-${question.id}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why did you edit / remove / dismiss? Reporters will see this."
                rows={2}
                maxLength={2000}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button onClick={() => setEditing(true)} disabled={loading} variant="outline">
                <Pencil className="size-4" /> Edit
              </Button>
              <Button onClick={handleDismiss} disabled={loading} variant="outline">
                <ShieldCheck className="size-4" /> Dismiss (false report)
              </Button>
              <Button
                onClick={() => setConfirmRemove(true)}
                disabled={loading}
                variant="outline"
                className="ml-auto text-destructive-text hover:bg-destructive-subtle hover:text-destructive-text"
              >
                <Ban className="size-4" /> Remove
              </Button>
            </div>
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this question from the pool?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be rejected and stop appearing in new quizzes. Existing quizzes and
              results keep working, and you can restore it later from the review queue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              className="rounded-xl bg-destructive text-white hover:bg-destructive-hover"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
