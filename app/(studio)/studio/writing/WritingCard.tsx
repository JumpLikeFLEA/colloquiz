"use client";

import { useRouter } from "next/navigation";
import { postJson } from "@/app/(studio)/studio/courses/[id]/postJson";
import { LocalTime } from "@/app/(studio)/studio/courses/[id]/LocalTime";
import { editedAfterDraft, type WritingReviewRow } from "@/lib/writing/review";
import { FeedbackEditor } from "@/app/(studio)/studio/reviews/FeedbackEditor";
import { STATUS_LABEL, STATUS_PILL } from "@/app/(studio)/studio/reviews/statusLabels";

// One row of writing_review_queue() (migration 109): a learner's written answer. The answer is
// plain text (whitespace-pre-wrap, never HTML); feedback goes through save_writing_feedback, which
// checks _writing_can_review itself. The page then refreshes so the status and the nav badge move.

export type WritingCardRow = WritingReviewRow & { promptText: string };

export function WritingCard({ row }: { row: WritingCardRow }) {
  const router = useRouter();
  const edited = editedAfterDraft(row);
  const resent = row.updatedAt > row.submittedAt;

  return (
    <article className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground break-all">{row.learnerLabel}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_PILL[row.status]}`}>
            {STATUS_LABEL[row.status]}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-muted text-muted-foreground">
            {row.route === "cohort" ? "Cohort" : "Linked student"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground break-words">
          {row.courseTitle}
          {row.route === "cohort" && <> · {row.runTitle || "Untitled run"}</>} · {row.lessonTitle}
        </p>
        <p className="text-xs text-muted-foreground">
          Sent <LocalTime iso={row.submittedAt} />
          {resent && (
            <>
              {" "}
              · Edited <LocalTime iso={row.updatedAt} />
            </>
          )}
        </p>
      </div>

      {row.promptText && (
        <div className="border-t border-border px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground mb-0.5">Task</p>
          <p className="text-sm text-foreground whitespace-pre-line break-words">{row.promptText}</p>
        </div>
      )}

      <div className="border-t border-border px-4 py-3 space-y-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-0.5">Answer</p>
          <p className="text-sm text-foreground whitespace-pre-wrap break-words">{row.body}</p>
        </div>
        {edited && (
          <p className="text-xs rounded-lg bg-warning-subtle text-warning px-3 py-2">
            Edited after your draft: the learner changed this answer after you saved feedback.
          </p>
        )}
        <FeedbackEditor
          initial={row.feedbackBody}
          publishedAt={row.feedbackPublishedAt}
          label={`Feedback for ${row.learnerLabel}`}
          publishHint="Publishing shows it to the learner and locks their answer."
          onSave={async (body, publish) => {
            await postJson("/api/studio/writing/feedback", { submissionId: row.submissionId, body, publish });
            router.refresh();
          }}
        />
      </div>
    </article>
  );
}
