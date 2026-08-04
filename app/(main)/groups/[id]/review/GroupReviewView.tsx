"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X, ClipboardList } from "lucide-react";
import { answerOptions } from "@/lib/options";
import { RichText } from "@/app/components/RichText";
import type { ReviewItem } from "@/lib/groups";

export function GroupReviewView({
  groupId,
  groupName,
  items,
}: {
  groupId: string;
  groupName: string;
  items: ReviewItem[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(questionId: string, status: "approved" | "rejected") {
    setBusy(questionId);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/questions/${questionId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not review this question.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-8">
      <div>
        <Link
          href={`/groups/${groupId}`}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ← {groupName}
        </Link>
        <h1 className="text-2xl font-bold text-foreground mt-1">Review queue</h1>
        <p className="text-muted-foreground mt-1">
          Approved questions become playable in the group&rsquo;s quizzes. You can&rsquo;t
          review your own — ask another member.
        </p>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-destructive-subtle border border-destructive-border text-sm text-destructive-text">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground rounded-2xl border border-dashed border-border">
          <ClipboardList size={32} className="mb-2 opacity-40" />
          <p className="text-sm">Nothing awaiting review. Everything is approved.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(({ question, authorName, canReview }) => (
            <div key={question.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                  {question.difficulty}
                </span>
                <span className="text-xs text-muted-foreground">by {authorName}</span>
              </div>

              <p className="text-sm font-medium text-foreground"><RichText text={question.question} /></p>

              <div className="flex flex-col gap-1.5 mt-3">
                {answerOptions(question.options).map((opt) => {
                  const correct = opt === question.correct_answer;
                  return (
                    <div
                      key={opt}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${
                        correct
                          ? "bg-success-subtle text-success border-success-border"
                          : "bg-background text-foreground border-border"
                      }`}
                    >
                      {correct && <Check className="size-3.5 shrink-0" />}
                      <span className="min-w-0"><RichText text={opt} /></span>
                    </div>
                  );
                })}
              </div>

              {question.explanation && (
                <p className="text-xs text-muted-foreground mt-3"><RichText text={question.explanation} /></p>
              )}

              <div className="flex items-center gap-2 mt-4">
                {canReview ? (
                  <>
                    <button
                      onClick={() => review(question.id, "approved")}
                      disabled={busy === question.id}
                      className="cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors"
                    >
                      <Check className="size-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => review(question.id, "rejected")}
                      disabled={busy === question.id}
                      className="cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent disabled:opacity-50 transition-colors"
                    >
                      <X className="size-4" />
                      Reject
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    This is your own question — another member needs to review it.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
